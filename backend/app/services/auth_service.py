"""身份认证服务。

安全约定（重要，勿修改）：

1. **绝不绕过签名校验。** 历史上这里曾在 firebase_admin 不可用时退化为
   "base64 解码 JWT payload 就算通过"，那等于任何人都能伪造任意用户身份读取他人数据。
   现在无法校验一律拒绝，不做任何降级解析。
2. **开发模式绕过必须显式开启且不能在生产环境生效**，见 is_dev_bypass_enabled()。
3. 所有需要登录的路由都应使用本模块的 require_auth 装饰器，
   不要在各自的 routes 文件里复制实现——多份副本是安全漏洞的温床。
"""

import os
from functools import wraps

from flask import request, jsonify

try:
    from firebase_admin import auth, firestore
    FIREBASE_AVAILABLE = True
except Exception as e:
    print(f"警告: firebase_admin 导入失败，Firebase 认证不可用: {e}")
    auth = None

    class _MockFirestore:
        SERVER_TIMESTAMP = "SERVER_TIMESTAMP"

    firestore = _MockFirestore()
    FIREBASE_AVAILABLE = False

from .firestore_service import create_user_profile, get_user_profile, update_user_profile

# 开发模式绕过认证时使用的模拟用户
DEV_USER_ID = 'test_user_id'
DEV_USER_EMAIL = 'test@example.com'

_bypass_warned = False


def admin_emails():
    """返回配置的管理员邮箱集合（小写）。"""
    raw = os.environ.get('ADMIN_EMAILS', '')
    return {e.strip().lower() for e in raw.split(',') if e.strip()}


def is_admin_email(email):
    """邮箱是否命中管理员列表（大小写不敏感）。"""
    if not email:
        return False
    return str(email).strip().lower() in admin_emails()


def resolve_role(email):
    """根据邮箱解析用户角色：admin / user。"""
    return 'admin' if is_admin_email(email) else 'user'


def is_dev_bypass_enabled():
    """是否启用开发模式认证绕过。

    必须同时满足两个条件：

    1. 显式设置环境变量 ``DEV_MODE=true``
    2. 未声明为生产环境（``APP_ENV`` / ``FLASK_ENV`` 均不为 ``production``）

    开启后所有接口都不再校验身份，**仅限本地开发使用**。
    部署到任何公开环境前，务必确认 DEV_MODE 未开启。
    """
    if os.environ.get('DEV_MODE', '').lower() != 'true':
        return False

    if any(os.environ.get(key, '').lower() == 'production' for key in ('APP_ENV', 'FLASK_ENV')):
        return False

    global _bypass_warned
    if not _bypass_warned:
        print("[警告] 认证绕过已启用（DEV_MODE=true）——仅限本地开发，切勿用于生产环境")
        _bypass_warned = True

    return True


def dev_user_info(email=None):
    """返回开发模式下的模拟用户信息。

    DEV_MODE=true 时身份校验整体绕过（仅限本地开发），角色按模拟登录邮箱判定，
    与生产行为保持一致：只有命中 ADMIN_EMAILS 的邮箱才是管理员。
    """
    email = (email or DEV_USER_EMAIL).strip()
    return {'uid': DEV_USER_ID, 'email': email, 'profile': None, 'role': resolve_role(email)}


def dev_email():
    """开发模式下从前端 X-Dev-Email 请求头读取模拟登录邮箱。

    前端（AuthContext）在 DEV_MODE 下登录/刷新时携带该头，让后端能按
    实际登录邮箱判定角色，从而在本地开发时也模拟"专用管理员账号"。
    缺省回退到默认测试邮箱。
    """
    return (request.headers.get('X-Dev-Email') or DEV_USER_EMAIL).strip()


def verify_firebase_token(id_token):
    """校验 Firebase ID token，返回 ``(user_info, error)``。

    无法校验时一律返回错误。**任何情况下都不会降级为不校验签名的解析。**
    """
    if not FIREBASE_AVAILABLE or auth is None:
        return None, "服务端未配置 Firebase 认证，无法校验身份"

    try:
        decoded_token = auth.verify_id_token(id_token)
    except auth.ExpiredIdTokenError:
        return None, "登录凭证已过期，请重新登录"
    except auth.InvalidIdTokenError:
        return None, "无效的登录凭证"
    except Exception as e:
        return None, f"身份校验失败: {e}"

    uid = decoded_token.get('uid')
    if not uid:
        return None, "登录凭证中缺少用户标识"

    email = decoded_token.get('email') or f'{uid}@firebase.local'

    try:
        profile, error = get_user_profile(uid)
        if error and "User not found" in error:
            _, create_error = create_user_profile(uid, email)
            if create_error:
                return None, f"创建用户档案失败: {create_error}"
            profile, _ = get_user_profile(uid)
        elif error:
            return None, f"读取用户档案失败: {error}"
        else:
            # 管理员停用的账号禁止访问所有接口
            if profile and profile.get('disabled'):
                return None, "该账号已被停用，请联系管理员"
            _, update_error = update_user_profile(uid, {"lastLogin": firestore.SERVER_TIMESTAMP})
            if update_error:
                print(f"警告: 更新最后登录时间失败 ({uid}): {update_error}")
    except Exception as e:
        return None, f"读取用户档案失败: {e}"

    role = resolve_role(email)
    return {"uid": uid, "email": email, "profile": profile, "role": role}, None


def require_auth(f):
    """统一的认证装饰器。

    校验通过后以关键字参数 ``user_info`` 注入用户信息（``{'uid', 'email', 'profile'}``），
    因此被装饰的视图函数必须接受 ``user_info`` 参数。
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        if is_dev_bypass_enabled():
            kwargs['user_info'] = dev_user_info(dev_email())
            return f(*args, **kwargs)

        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({"error": "需要授权令牌"}), 401

        id_token = auth_header[len('Bearer '):].strip()
        if not id_token:
            return jsonify({"error": "需要授权令牌"}), 401

        user_info, error = verify_firebase_token(id_token)
        if error:
            return jsonify({"error": f"认证失败: {error}"}), 401

        kwargs['user_info'] = user_info
        return f(*args, **kwargs)

    return wrapper


def require_admin(f):
    """管理员专属认证装饰器。

    在 require_auth 之上再校验角色：只有管理员（邮箱命中 ADMIN_EMAILS）
    才能访问被装饰的接口，普通用户一律 403。开发模式同样按邮箱判定，
    非管理员邮箱调用管理员接口同样返回 403。
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        if is_dev_bypass_enabled():
            email = dev_email()
            if not is_admin_email(email):
                return jsonify({"error": "无权访问，需要管理员权限"}), 403
            kwargs['user_info'] = dev_user_info(email)
            return f(*args, **kwargs)

        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({"error": "需要授权令牌"}), 401

        id_token = auth_header[len('Bearer '):].strip()
        if not id_token:
            return jsonify({"error": "需要授权令牌"}), 401

        user_info, error = verify_firebase_token(id_token)
        if error:
            return jsonify({"error": f"认证失败: {error}"}), 401

        if user_info.get('role') != 'admin':
            return jsonify({"error": "无权访问，需要管理员权限"}), 403

        kwargs['user_info'] = user_info
        return f(*args, **kwargs)

    return wrapper

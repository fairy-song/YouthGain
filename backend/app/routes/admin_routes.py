"""管理员 API 路由。

所有接口均要求管理员权限（见 auth_service.require_admin），普通用户访问返回 403。
端点一览::

    GET    /api/admin/users                    用户列表
    GET    /api/admin/users/<uid>              用户详情
    PUT    /api/admin/users/<uid>/status       停用/启用用户  {disabled: bool}
    DELETE /api/admin/users/<uid>              删除用户
    GET    /api/admin/stats                    平台统计
    GET    /api/admin/kb                       知识库文章列表
    POST   /api/admin/kb                       新增知识库文章
    PUT    /api/admin/kb/<id>                  更新知识库文章
    DELETE /api/admin/kb/<id>                  删除知识库文章
"""

from flask import Blueprint, jsonify, request

from app.services.auth_service import require_admin
from app.services import admin_service

admin_bp = Blueprint('admin_bp', __name__)


def _ok(data=None, message='success', status=200):
    return jsonify({'status': 'success', 'message': message, 'data': data}), status


def _err(message, status):
    return jsonify({'status': 'error', 'message': message}), status


@admin_bp.errorhandler(ValueError)
def invalid(error):
    return _err(str(error), 400)


# ============================================================
# 用户管理
# ============================================================

@admin_bp.route('/users', methods=['GET'])
@require_admin
def list_users(user_info):
    users, error = admin_service.list_all_users()
    if error:
        return _err(f'读取用户列表失败: {error}', 500)
    return _ok({'users': users, 'count': len(users)})


@admin_bp.route('/users/<uid>', methods=['GET'])
@require_admin
def user_detail(user_info, uid):
    detail, error = admin_service.get_user_detail(uid)
    if error:
        return _err(error, 404 if error == '用户不存在' else 500)
    return _ok(detail)


@admin_bp.route('/users/<uid>/status', methods=['PUT'])
@require_admin
def user_status(user_info, uid):
    data = request.get_json(silent=True) or {}
    disabled = data.get('disabled')
    if not isinstance(disabled, bool):
        return _err('disabled 必须为布尔值', 400)
    success, error = admin_service.set_user_disabled(uid, disabled)
    if not success:
        return _err(error, 404 if error == '用户不存在' else 500)
    return _ok({'uid': uid, 'disabled': disabled}, '已停用' if disabled else '已启用')


@admin_bp.route('/users/<uid>', methods=['DELETE'])
@require_admin
def delete_user(user_info, uid):
    # 不允许管理员删除自己，防止把唯一管理员删掉后无人可管
    if uid == user_info.get('uid'):
        return _err('不能删除当前登录的管理员账号', 400)
    success, error = admin_service.delete_user(uid)
    if not success:
        return _err(error, 404 if error == '用户不存在' else 500)
    return _ok({'uid': uid}, '用户已删除')


# ============================================================
# 平台统计
# ============================================================

@admin_bp.route('/stats', methods=['GET'])
@require_admin
def platform_stats(user_info):
    stats, error = admin_service.get_platform_stats()
    if error:
        return _err(f'读取平台统计失败: {error}', 500)
    return _ok(stats)


# ============================================================
# 知识库内容管理
# ============================================================

@admin_bp.route('/kb', methods=['GET'])
@require_admin
def kb_list(user_info):
    articles, error = admin_service.list_kb_articles()
    if error:
        return _err(f'读取知识库失败: {error}', 500)
    return _ok({'articles': articles, 'count': len(articles)})


@admin_bp.route('/kb', methods=['POST'])
@require_admin
def kb_create(user_info):
    article, error = admin_service.create_kb_article(request.get_json(silent=True) or {})
    if error:
        return _err(f'新增文章失败: {error}', 500)
    return _ok(article, '文章已发布', 201)


@admin_bp.route('/kb/<article_id>', methods=['PUT'])
@require_admin
def kb_update(user_info, article_id):
    article, error = admin_service.update_kb_article(article_id, request.get_json(silent=True) or {})
    if error:
        return _err(error, 404 if error == '文章不存在' else 500)
    return _ok(article, '文章已更新')


@admin_bp.route('/kb/<article_id>', methods=['DELETE'])
@require_admin
def kb_delete(user_info, article_id):
    success, error = admin_service.delete_kb_article(article_id)
    if not success:
        return _err(error, 404 if error == '文章不存在' else 500)
    return _ok({'id': article_id}, '文章已删除')

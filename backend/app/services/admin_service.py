"""管理员数据服务。

为 /api/admin/* 提供跨三种存储模式（内存 dev_data.json / MySQL / Firestore）
的用户管理、平台统计与知识库内容管理数据访问。所有函数只做数据读写，
权限校验由 auth_service.require_admin 在上层完成。

MySQL 模式下的知识库表按 learning_store 的既有模式在首次使用时幂等建表。
"""

import datetime
import uuid

from .firestore_service import (
    get_db,
    is_dev_mode,
    is_mysql_mode,
    _dev_db,
    persist_dev_db,
    get_public_collection_path,
    get_users_root_path,
)
from app.utils.db_mysql import MySQLHelper, to_json_string, from_json_field

# MySQL 知识库表（幂等建表，与 learning_store.TABLE_SQL 同模式）
KB_TABLE_SQL = '''CREATE TABLE IF NOT EXISTS kb_articles (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    summary TEXT,
    content LONGTEXT,
    category VARCHAR(64),
    tags VARCHAR(255),
    image VARCHAR(500),
    read_time INT DEFAULT 5,
    date VARCHAR(32),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'''

USER_STATUS_COLUMN_SQL = "ALTER TABLE users ADD COLUMN disabled TINYINT(1) DEFAULT 0 COMMENT '管理员停用标记'"

MAX_ADMIN_USERS = 500
"""管理员一次最多拉取的用户数，防止 Firestore 模式下接口过慢。"""


def _ensure_mysql_kb_table():
    """确保 MySQL 存在 kb_articles 表（幂等）。"""
    if not MySQLHelper.execute_query("SHOW TABLES LIKE 'kb_articles'"):
        MySQLHelper.execute_update(KB_TABLE_SQL)


def _ensure_mysql_disabled_column():
    """确保 MySQL users 表存在 disabled 列（幂等）。"""
    if not MySQLHelper.execute_query("SHOW COLUMNS FROM users LIKE 'disabled'"):
        MySQLHelper.execute_update(USER_STATUS_COLUMN_SQL)


# ============================================================
# 用户管理
# ============================================================

def list_all_users(limit=MAX_ADMIN_USERS):
    """返回用户列表 [{uid, profile, disabled, ...}]。"""
    users = []
    if is_mysql_mode():
        rows = MySQLHelper.execute_query(
            "SELECT id, email, display_name, created_at, last_login, assessment_completed, disabled "
            "FROM users ORDER BY created_at DESC LIMIT %s", (limit,))
        for row in rows:
            users.append({
                'uid': row['id'],
                'profile': {
                    'email': row['email'],
                    'displayName': row['display_name'],
                    'createdAt': row['created_at'].isoformat() if row['created_at'] else None,
                    'lastLogin': row['last_login'].isoformat() if row['last_login'] else None,
                    'assessmentCompleted': bool(row['assessment_completed']),
                },
                'disabled': bool(row.get('disabled')),
            })
        return users, None

    if is_dev_mode():
        for uid, record in list(_dev_db.get('users', {}).items())[:limit]:
            profile = record.get('profile', {}) or {}
            users.append({
                'uid': uid,
                'profile': profile,
                'disabled': bool(profile.get('disabled', False)),
            })
        return users, None

    db = get_db()
    if not db:
        return [], "数据库未初始化"
    try:
        # Firestore: users/{uid}/profile/{uid} —— 先枚举中间层 uid，再逐个读 profile
        user_refs = db.collection(get_users_root_path()).list_documents()
        for i, user_ref in enumerate(user_refs):
            if i >= limit:
                break
            uid = user_ref.id
            profile_doc = db.collection(get_user_collection_path(uid, 'profile')).document(uid).get()
            profile = profile_doc.to_dict() if profile_doc.exists else {}
            users.append({
                'uid': uid,
                'profile': profile,
                'disabled': bool(profile.get('disabled', False)),
            })
        return users, None
    except Exception as e:
        return [], str(e)


def get_user_detail(uid):
    """返回单个用户详情 {uid, profile, disabled, data_summary}。"""
    if is_mysql_mode():
        row = MySQLHelper.execute_one(
            "SELECT id, email, display_name, created_at, last_login, assessment_completed, disabled "
            "FROM users WHERE id = %s", (uid,))
        if not row:
            return None, "用户不存在"
        counts = {}
        for table in ('assessments', 'goals', 'coach_messages', 'transactions', 'learning_entries'):
            try:
                counts[table] = MySQLHelper.execute_one(
                    f"SELECT COUNT(*) AS c FROM {table} WHERE user_id = %s", (uid,))['c']
            except Exception:
                counts[table] = 0
        return {
            'uid': row['id'],
            'profile': {
                'email': row['email'],
                'displayName': row['display_name'],
                'createdAt': row['created_at'].isoformat() if row['created_at'] else None,
                'lastLogin': row['last_login'].isoformat() if row['last_login'] else None,
                'assessmentCompleted': bool(row['assessment_completed']),
            },
            'disabled': bool(row.get('disabled')),
            'data_summary': counts,
        }, None

    if is_dev_mode():
        record = _dev_db.get('users', {}).get(uid)
        if not record:
            return None, "用户不存在"
        profile = record.get('profile', {}) or {}
        return {
            'uid': uid,
            'profile': profile,
            'disabled': bool(profile.get('disabled', False)),
            'data_summary': {
                'assessments': len(record.get('assessments', {})),
                'goals': len(record.get('goals', [])),
                'coach_messages': len(record.get('coach_messages', [])),
                'transactions': _size_of(record.get('transactions')),
                'learning_entries': len(record.get('learning_entries', {})),
            },
        }, None

    db = get_db()
    if not db:
        return None, "数据库未初始化"
    try:
        profile_doc = db.collection(get_user_collection_path(uid, 'profile')).document(uid).get()
        if not profile_doc.exists:
            return None, "用户不存在"
        profile = profile_doc.to_dict()
        return {
            'uid': uid,
            'profile': profile,
            'disabled': bool(profile.get('disabled', False)),
        }, None
    except Exception as e:
        return None, str(e)


def set_user_disabled(uid, disabled):
    """停用/启用用户。停用后该用户所有接口访问被拒（见 auth_service）。"""
    if is_mysql_mode():
        _ensure_mysql_disabled_column()
        MySQLHelper.execute_update("UPDATE users SET disabled = %s WHERE id = %s", (1 if disabled else 0, uid))
        return True, None

    if is_dev_mode():
        record = _dev_db.get('users', {}).get(uid)
        if not record:
            return False, "用户不存在"
        record.setdefault('profile', {})['disabled'] = bool(disabled)
        persist_dev_db()
        return True, None

    db = get_db()
    if not db:
        return False, "数据库未初始化"
    try:
        db.collection(get_user_collection_path(uid, 'profile')).document(uid).update({'disabled': bool(disabled)})
        return True, None
    except Exception as e:
        return False, str(e)


def delete_user(uid):
    """删除用户及其全部业务数据。"""
    if is_mysql_mode():
        MySQLHelper.execute_update("DELETE FROM users WHERE id = %s", (uid,))
        return True, None

    if is_dev_mode():
        existed = _dev_db.get('users', {}).pop(uid, None)
        if existed is None:
            return False, "用户不存在"
        persist_dev_db()
        return True, None

    db = get_db()
    if not db:
        return False, "数据库未初始化"
    try:
        # Firestore: 删除 profile 文档及其子集合
        profile_ref = db.collection(get_user_collection_path(uid, 'profile')).document(uid)
        _delete_firestore_collection(profile_ref.collection('goals'))
        _delete_firestore_collection(profile_ref.collection('assessments'))
        profile_ref.delete()
        for sub in ('coach_messages', 'learning_entries', 'transactions'):
            _delete_firestore_collection(db.collection(get_user_collection_path(uid, sub)))
        return True, None
    except Exception as e:
        return False, str(e)


def _delete_firestore_collection(collection_ref):
    """删除 Firestore 集合下的全部文档（分页循环）。"""
    while True:
        docs = list(collection_ref.limit(100).get())
        if not docs:
            break
        for doc in docs:
            doc.reference.delete()


def _size_of(value):
    """dev 模式下 transactions 可能是 list 或 dict。"""
    if isinstance(value, dict):
        return len(value)
    if isinstance(value, list):
        return len(value)
    return 0


# ============================================================
# 平台统计
# ============================================================

def get_platform_stats():
    """返回平台整体统计：用户数、评估/学习/消费/目标/对话/知识库文章数。"""
    stats = {
        'total_users': 0,
        'assessment_completed_users': 0,
        'total_assessments': 0,
        'total_learning_entries': 0,
        'total_transactions': 0,
        'total_goals': 0,
        'total_coach_messages': 0,
        'total_kb_articles': 0,
    }

    if is_mysql_mode():
        try:
            stats['total_users'] = MySQLHelper.execute_one("SELECT COUNT(*) AS c FROM users")['c'] or 0
            stats['assessment_completed_users'] = MySQLHelper.execute_one(
                "SELECT COUNT(*) AS c FROM users WHERE assessment_completed = 1")['c'] or 0
            for key, table in (
                ('total_assessments', 'assessments'),
                ('total_goals', 'goals'),
                ('total_coach_messages', 'coach_messages'),
                ('total_transactions', 'transactions'),
                ('total_learning_entries', 'learning_entries'),
            ):
                try:
                    stats[key] = MySQLHelper.execute_one(f"SELECT COUNT(*) AS c FROM {table}")['c'] or 0
                except Exception:
                    stats[key] = 0
            if MySQLHelper.execute_query("SHOW TABLES LIKE 'kb_articles'"):
                stats['total_kb_articles'] = MySQLHelper.execute_one("SELECT COUNT(*) AS c FROM kb_articles")['c'] or 0
            return stats, None
        except Exception as e:
            return None, str(e)

    if is_dev_mode():
        users = _dev_db.get('users', {})
        stats['total_users'] = len(users)
        for record in users.values():
            profile = record.get('profile', {}) or {}
            if profile.get('assessmentCompleted'):
                stats['assessment_completed_users'] += 1
            stats['total_assessments'] += len(record.get('assessments', {}))
            stats['total_learning_entries'] += len(record.get('learning_entries', {}))
            stats['total_transactions'] += _size_of(record.get('transactions'))
            stats['total_goals'] += _size_of(record.get('goals'))
            stats['total_coach_messages'] += len(record.get('coach_messages', []))
        stats['total_kb_articles'] = len(_dev_db.get('public', {}).get('knowledge_base', []))
        return stats, None

    db = get_db()
    if not db:
        return None, "数据库未初始化"
    try:
        user_refs = list(db.collection(get_users_root_path()).list_documents())[:MAX_ADMIN_USERS]
        stats['total_users'] = len(user_refs)
        for user_ref in user_refs:
            uid = user_ref.id
            profile_doc = db.collection(get_user_collection_path(uid, 'profile')).document(uid).get()
            if profile_doc.exists and profile_doc.to_dict().get('assessmentCompleted'):
                stats['assessment_completed_users'] += 1
            for key, sub in (
                ('total_assessments', 'assessments'),
                ('total_learning_entries', 'learning_entries'),
                ('total_transactions', 'transactions'),
                ('total_coach_messages', 'coach_messages'),
            ):
                try:
                    stats[key] += _count_firestore_docs(db.collection(get_user_collection_path(uid, sub)))
                except Exception:
                    pass
        kb_docs = list(db.collection(get_public_collection_path('knowledge_base')).limit(MAX_ADMIN_USERS).get())
        stats['total_kb_articles'] = len(kb_docs)
        return stats, None
    except Exception as e:
        return None, str(e)


def _count_firestore_docs(collection_ref, limit=1000):
    """轻量统计集合文档数（只取引用不拉正文）。"""
    return len(list(collection_ref.select([]).limit(limit).get()))


# ============================================================
# 知识库内容管理
# ============================================================

def list_kb_articles(limit=200):
    """返回知识库文章列表（新到旧）。"""
    if is_mysql_mode():
        _ensure_mysql_kb_table()
        rows = MySQLHelper.execute_query(
            "SELECT * FROM kb_articles ORDER BY created_at DESC LIMIT %s", (limit,))
        articles = []
        for row in rows:
            articles.append({
                'id': row['id'],
                'title': row['title'],
                'summary': row['summary'],
                'content': row['content'],
                'category': row['category'],
                'tags': _split_tags(row['tags']),
                'image': row['image'],
                'readTime': row['read_time'],
                'date': row['date'],
                'createdAt': row['created_at'].isoformat() if row['created_at'] else None,
            })
        return articles, None

    if is_dev_mode():
        articles = _dev_db.get('public', {}).get('knowledge_base', [])[:limit]
        return [dict(a) for a in articles], None

    db = get_db()
    if not db:
        return [], "数据库未初始化"
    try:
        docs = db.collection(get_public_collection_path('knowledge_base')).limit(limit).get()
        articles = []
        for doc in docs:
            article = doc.to_dict()
            article['id'] = doc.id
            articles.append(article)
        return articles, None
    except Exception as e:
        return [], str(e)


def create_kb_article(data):
    """新增知识库文章，返回 (article, error)。"""
    article = _normalize_article(data)
    if is_mysql_mode():
        _ensure_mysql_kb_table()
        article['id'] = str(uuid.uuid4())
        MySQLHelper.execute_update(
            "INSERT INTO kb_articles (id, title, summary, content, category, tags, image, read_time, `date`) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (article['id'], article['title'], article.get('summary'), article.get('content'),
             article.get('category'), ','.join(article.get('tags', [])), article.get('image'),
             article.get('readTime', 5), article.get('date', '')))
        return article, None

    if is_dev_mode():
        article['id'] = str(uuid.uuid4())
        article['createdAt'] = datetime.datetime.now().isoformat()
        _dev_db.setdefault('public', {}).setdefault('knowledge_base', []).append(article)
        persist_dev_db()
        return article, None

    db = get_db()
    if not db:
        return None, "数据库未初始化"
    try:
        ref = db.collection(get_public_collection_path('knowledge_base')).add(article)
        article['id'] = ref[1].id
        return article, None
    except Exception as e:
        return None, str(e)


def update_kb_article(article_id, data):
    """更新知识库文章，返回 (article, error)。"""
    article = _normalize_article(data)
    if is_mysql_mode():
        _ensure_mysql_kb_table()
        affected = MySQLHelper.execute_update(
            "UPDATE kb_articles SET title=%s, summary=%s, content=%s, category=%s, tags=%s, "
            "image=%s, read_time=%s, `date`=%s WHERE id=%s",
            (article['title'], article.get('summary'), article.get('content'), article.get('category'),
             ','.join(article.get('tags', [])), article.get('image'), article.get('readTime', 5),
             article.get('date', ''), article_id))
        if not affected:
            return None, "文章不存在"
        article['id'] = article_id
        return article, None

    if is_dev_mode():
        kb = _dev_db.get('public', {}).get('knowledge_base', [])
        for i, existing in enumerate(kb):
            if existing.get('id') == article_id:
                article['id'] = article_id
                kb[i] = {**existing, **article}
                persist_dev_db()
                return kb[i], None
        return None, "文章不存在"

    db = get_db()
    if not db:
        return None, "数据库未初始化"
    try:
        ref = db.collection(get_public_collection_path('knowledge_base')).document(article_id)
        if not ref.get().exists:
            return None, "文章不存在"
        ref.update(article)
        article['id'] = article_id
        return article, None
    except Exception as e:
        return None, str(e)


def delete_kb_article(article_id):
    """删除知识库文章。"""
    if is_mysql_mode():
        _ensure_mysql_kb_table()
        affected = MySQLHelper.execute_update("DELETE FROM kb_articles WHERE id = %s", (article_id,))
        if not affected:
            return False, "文章不存在"
        return True, None

    if is_dev_mode():
        kb = _dev_db.get('public', {}).get('knowledge_base', [])
        for i, existing in enumerate(kb):
            if existing.get('id') == article_id:
                del kb[i]
                persist_dev_db()
                return True, None
        return False, "文章不存在"

    db = get_db()
    if not db:
        return False, "数据库未初始化"
    try:
        ref = db.collection(get_public_collection_path('knowledge_base')).document(article_id)
        if not ref.get().exists:
            return False, "文章不存在"
        ref.delete()
        return True, None
    except Exception as e:
        return False, str(e)


def _normalize_article(data):
    """规整文章字段，补齐默认值，保护空输入。"""
    data = dict(data or {})
    title = str(data.get('title') or '').strip()
    if not title:
        raise ValueError('文章标题不能为空')
    tags = data.get('tags') or []
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.replace('，', ',').split(',') if t.strip()]
    return {
        'title': title,
        'summary': str(data.get('summary') or '').strip(),
        'content': data.get('content') or '',
        'category': str(data.get('category') or '').strip(),
        'tags': tags,
        'image': str(data.get('image') or '').strip(),
        'readTime': int(data.get('readTime') or 5),
        'date': str(data.get('date') or '').strip(),
    }


def _split_tags(raw):
    if not raw:
        return []
    return [t.strip() for t in raw.replace('，', ',').split(',') if t.strip()]

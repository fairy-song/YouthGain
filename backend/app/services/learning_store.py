"""Account-scoped learning documents for all three supported storage backends."""
from copy import deepcopy
from datetime import datetime
from .checkin_service import BEIJING
from .user_data_service import is_mysql_mode
from .firestore_service import get_db, is_dev_mode, _dev_db, persist_dev_db, get_user_collection_path
from app.utils.db_mysql import MySQLHelper, to_json_string, from_json_field

TABLE_SQL = '''CREATE TABLE IF NOT EXISTS learning_entries (
    user_id VARCHAR(128) NOT NULL,
    entry_id VARCHAR(100) NOT NULL,
    payload JSON NOT NULL,
    PRIMARY KEY (user_id, entry_id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'''


def collection(user_id):
    db = get_db()
    if not db:
        raise RuntimeError('数据库未初始化')
    return db.collection(get_user_collection_path(user_id, 'learning_entries'))


def read_entries(user_id):
    if is_mysql_mode():
        rows = MySQLHelper.execute_query(
            'SELECT payload FROM learning_entries WHERE user_id = %s', (user_id,))
        entries = [from_json_field(row['payload']) for row in rows]
    elif is_dev_mode():
        entries = deepcopy(list(_dev_db['users'].get(user_id, {}).get('learning_entries', {}).values()))
    else:
        entries = [doc.to_dict() for doc in collection(user_id).stream()]
    return sorted(entries, key=lambda e: e.get('updated_at', ''), reverse=True)


def read_entry(user_id, entry_id):
    if is_mysql_mode():
        row = MySQLHelper.execute_one(
            'SELECT payload FROM learning_entries WHERE user_id = %s AND entry_id = %s', (user_id, entry_id))
        return from_json_field(row['payload']) if row else None
    if is_dev_mode():
        return deepcopy(_dev_db['users'].get(user_id, {}).get('learning_entries', {}).get(entry_id))
    doc = collection(user_id).document(entry_id).get()
    return doc.to_dict() if doc.exists else None


def write_entry(user_id, entry_id, payload):
    now = datetime.now(BEIJING).isoformat()
    previous_record = read_entry(user_id, entry_id) or {}
    record = {**payload, 'id': entry_id, 'updated_at': now,
              'created_at': previous_record.get('created_at', now)}
    if payload.get('kind') in ('exercise', 'decision', 'review', 'reflection'):
        days = set(previous_record.get('activity_days', []))
        if previous_record.get('updated_at'):
            days.add(previous_record['updated_at'][:10])
        days.add(now[:10])
        record['activity_days'] = sorted(days)
    if is_mysql_mode():
        MySQLHelper.execute_update(
            'INSERT INTO learning_entries (user_id, entry_id, payload) VALUES (%s, %s, %s) '
            'ON DUPLICATE KEY UPDATE payload = VALUES(payload)',
            (user_id, entry_id, to_json_string(record)))
    elif is_dev_mode():
        user = _dev_db['users'].setdefault(user_id, {})
        entries = user.setdefault('learning_entries', {})
        previous = entries.get(entry_id)
        entries[entry_id] = deepcopy(record)
        try:
            persist_dev_db()
        except Exception:
            if previous is None:
                entries.pop(entry_id, None)
            else:
                entries[entry_id] = previous
            raise
    else:
        collection(user_id).document(entry_id).set(record)
    return record

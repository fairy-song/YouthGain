"""Transactional, single-host store for the reviewed podcast catalogue and daily picks."""
import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from flask import current_app


def database_path():
    configured = current_app.config.get('PODCAST_DB_PATH') or os.environ.get('PODCAST_DB_PATH')
    if configured:
        return Path(configured)
    if current_app.config.get('APP_ENV') == 'production':
        raise RuntimeError('请配置持久化 PODCAST_DB_PATH')
    if current_app.config.get('DB_TYPE') == 'memory':
        from . import firestore_service
        return Path(firestore_service._DEV_DB_PATH).with_name('podcasts.db')
    return Path(current_app.instance_path) / 'podcasts.db'


@contextmanager
def transaction(write=True):
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(path), timeout=30, isolation_level=None)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute('PRAGMA journal_mode=WAL')
        connection.execute('''CREATE TABLE IF NOT EXISTS programs (
            id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)''')
        connection.execute('''CREATE TABLE IF NOT EXISTS feedback (
            user_id TEXT NOT NULL, program_id TEXT NOT NULL, kind TEXT NOT NULL,
            updated_at TEXT NOT NULL, PRIMARY KEY(user_id, program_id, kind))''')
        connection.execute('''CREATE TABLE IF NOT EXISTS events (
            user_id TEXT NOT NULL, local_date TEXT NOT NULL, program_id TEXT NOT NULL,
            kind TEXT NOT NULL, created_at TEXT NOT NULL,
            PRIMARY KEY(user_id, local_date, program_id, kind))''')
        schema = Path(__file__).resolve().parent.parent / 'sql' / 'podcast_recommendations.sql'
        schema_sql = schema.read_text(encoding='utf-8')
        connection.executescript(schema_sql)
        connection.executescript(schema.with_name('finance_funds.sql').read_text(encoding='utf-8'))
        connection.executescript(schema.with_name('podcast_pipeline.sql').read_text(encoding='utf-8'))
        connection.execute('BEGIN IMMEDIATE')
        _migrate_event_types(connection, schema_sql)
        columns = {row['name'] for row in connection.execute('PRAGMA table_info(daily_picks)')}
        if 'recommendation_id' not in columns:
            connection.execute('ALTER TABLE daily_picks ADD COLUMN recommendation_id TEXT')
        connection.execute('CREATE UNIQUE INDEX IF NOT EXISTS daily_picks_recommendation_id '
                           'ON daily_picks(recommendation_id) WHERE recommendation_id IS NOT NULL')
        connection.commit()
        connection.execute('BEGIN IMMEDIATE' if write else 'BEGIN')
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def _migrate_event_types(connection, schema_sql):
    """Widen the legacy CHECK atomically, retaining all append-only history."""
    definition = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='recommendation_events'").fetchone()['sql']
    if "'undislike'" in definition:
        return
    # SQLite cannot alter a CHECK. Copy unchanged rows, including their rowid
    # ordering, then recreate the original indexes and immutable triggers.
    objects = connection.execute(
        "SELECT sql FROM sqlite_master WHERE tbl_name='recommendation_events' "
        "AND type IN ('index','trigger') AND sql IS NOT NULL").fetchall()
    table = schema_sql.split('CREATE TABLE IF NOT EXISTS recommendation_events (', 1)[1].split('\n);', 1)[0]
    connection.execute('CREATE TABLE recommendation_events_next (' + table + '\n)')
    connection.execute('INSERT INTO recommendation_events_next(rowid,user_id,event_id,recommendation_id,'
                       'local_date,program_id,event_type,occurred_at,snapshot_id,model_version,payload) '
                       'SELECT rowid,user_id,event_id,recommendation_id,local_date,program_id,event_type,'
                       'occurred_at,snapshot_id,model_version,payload FROM recommendation_events')
    connection.execute('DROP TABLE recommendation_events')
    connection.execute('ALTER TABLE recommendation_events_next RENAME TO recommendation_events')
    for obj in objects:
        connection.execute(obj['sql'])


def program_rows(connection):
    return [json.loads(row['payload']) for row in connection.execute('SELECT payload FROM programs')]


def program(connection, program_id):
    row = connection.execute('SELECT payload FROM programs WHERE id=?', (program_id,)).fetchone()
    return json.loads(row['payload']) if row else None


def save_program(connection, record):
    # Normalize all legacy/manual episodes into shows while retaining their public IDs and picks.
    row = connection.execute('SELECT id FROM podcast_shows WHERE canonical_url=?', (record['canonical_url'],)).fetchone()
    from uuid import uuid4
    record['show_id'] = row['id'] if row else str(uuid4())
    show = {key: record.get(key) for key in ('name', 'publisher', 'description', 'canonical_url', 'language')}
    connection.execute('INSERT INTO podcast_shows VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
                       (record['show_id'], record['canonical_url'], json.dumps(show, ensure_ascii=False)))
    connection.execute('''INSERT INTO programs(id,payload,updated_at) VALUES(?,?,?)
        ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at''',
        (record['id'], json.dumps(record, ensure_ascii=False, allow_nan=False), record['updated_at']))


def daily_pick(connection, user_id, local_date):
    row = connection.execute('SELECT payload FROM daily_picks WHERE user_id=? AND local_date=?',
                             (user_id, local_date)).fetchone()
    return json.loads(row['payload']) if row else None


def save_pick(connection, user_id, local_date, record, replace_empty=False):
    if replace_empty:
        connection.execute('''UPDATE daily_picks SET program_id=?, payload=?, recommendation_id=?
            WHERE user_id=? AND local_date=? AND program_id IS NULL''',
            (record.get('program_id'), json.dumps(record, ensure_ascii=False, allow_nan=False),
             record.get('recommendation_id'), user_id, local_date))
    else:
        connection.execute('INSERT INTO daily_picks(user_id,local_date,program_id,payload,recommendation_id) VALUES(?,?,?,?,?)',
                           (user_id, local_date, record.get('program_id'),
                            json.dumps(record, ensure_ascii=False, allow_nan=False), record.get('recommendation_id')))


def recent_picks(connection, user_id, since_date):
    return [json.loads(row['payload']) for row in connection.execute(
        'SELECT payload FROM daily_picks WHERE user_id=? AND local_date>=? ORDER BY local_date DESC',
        (user_id, since_date))]


def feedback_rows(connection, user_id):
    return [dict(row) for row in connection.execute(
        'SELECT program_id,kind,updated_at FROM feedback WHERE user_id=?', (user_id,))]


def update_pick(connection, user_id, record):
    connection.execute('UPDATE daily_picks SET payload=?, recommendation_id=? WHERE user_id=? AND local_date=?',
                       (json.dumps(record, ensure_ascii=False, allow_nan=False), record['recommendation_id'],
                        user_id, record['date']))


def save_snapshot(connection, user_id, snapshot):
    connection.execute('INSERT INTO finance_snapshots VALUES(?,?,?,?,?)',
                       (snapshot['snapshot_id'], user_id, snapshot['as_of'], snapshot['feature_version'],
                        json.dumps(snapshot, ensure_ascii=False, allow_nan=False)))


def read_snapshot(connection, user_id, snapshot_id):
    row = connection.execute('SELECT payload FROM finance_snapshots WHERE user_id=? AND snapshot_id=?',
                             (user_id, snapshot_id)).fetchone()
    return json.loads(row['payload']) if row else None


def event_by_id(connection, user_id, event_id):
    row = connection.execute('SELECT * FROM recommendation_events WHERE user_id=? AND event_id=?',
                             (user_id, event_id)).fetchone()
    return dict(row) if row else None


def append_event(connection, user_id, record, event_id, event_type, occurred_at):
    connection.execute('''INSERT OR IGNORE INTO recommendation_events
        (user_id,event_id,recommendation_id,local_date,program_id,event_type,occurred_at,snapshot_id,model_version)
        VALUES(?,?,?,?,?,?,?,?,?)''',
        (user_id, event_id, record['recommendation_id'], record['date'], record['program_id'],
         event_type, occurred_at, record.get('snapshot_id'), record.get('model_version', 'legacy')))
    if event_type == 'served':
        return connection.execute('''SELECT event_id FROM recommendation_events
            WHERE user_id=? AND recommendation_id=? AND event_type=?''',
            (user_id, record['recommendation_id'], event_type)).fetchone()['event_id']
    return event_id


def event_history(connection, user_id, as_of, limit=100):
    rows = connection.execute('''SELECT program_id,event_type,occurred_at FROM recommendation_events
        WHERE user_id=? AND occurred_at<? AND event_type NOT IN ('served','impression')
        ORDER BY occurred_at DESC, rowid DESC LIMIT ?''', (user_id, as_of, limit)).fetchall()
    return [{'program_id': r['program_id'], 'action': r['event_type'], 'occurred_at': r['occurred_at']}
            for r in reversed(rows)]

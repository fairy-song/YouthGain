"""Durable, single-host research registry with cross-process atomic transactions.

The research ledger is independent of the operational ledger (MySQL/Firestore).
All workers MUST use the same local SQLite path; multi-host deployments need a
shared transactional database before enabling this feature.
"""
import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from flask import current_app


def database_path():
    configured = current_app.config.get('RESEARCH_DB_PATH') or os.environ.get('RESEARCH_DB_PATH')
    if configured:
        return Path(configured)
    if current_app.config.get('APP_ENV') == 'production':
        raise RuntimeError('请配置独立研究账本 RESEARCH_DB_PATH')
    # Isolated tests follow their isolated development database automatically.
    if current_app.config.get('DB_TYPE') == 'memory':
        from . import firestore_service
        return Path(firestore_service._DEV_DB_PATH).with_name('research.db')
    return Path(current_app.instance_path) / 'research.db'


@contextmanager
def transaction():
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=30, isolation_level=None)
    try:
        conn.execute('PRAGMA synchronous=FULL')
        conn.execute('CREATE TABLE IF NOT EXISTS research_state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)')
        conn.execute('BEGIN IMMEDIATE')
        row = conn.execute('SELECT payload FROM research_state WHERE id=1').fetchone()
        state = json.loads(row[0]) if row else {
            'version': 1, 'projects': {}, 'consents': {}, 'releases': {}, 'audit': [],
            'budget': {'total_milli': int(current_app.config.get('RESEARCH_GLOBAL_EPSILON_MILLI', 6000)),
                       'spent_milli': 0, 'entries': []}}
        if not 1 <= state['budget']['total_milli'] <= 20000:
            raise RuntimeError('累计隐私预算配置必须在 1 至 20000 毫epsilon之间')
        if state['version'] != 1:
            raise RuntimeError('研究账本版本不兼容')
        yield state
        payload = json.dumps(state, ensure_ascii=False, allow_nan=False)
        conn.execute('INSERT INTO research_state(id,payload) VALUES(1,?) '
                     'ON CONFLICT(id) DO UPDATE SET payload=excluded.payload', (payload,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

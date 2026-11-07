"""Single-host persistent public passages and content-addressed embedding cache."""
from contextlib import contextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3

import numpy as np
from flask import current_app, has_app_context


def index_path():
    from .podcast_store import database_path
    configured = current_app.config.get('KNOWLEDGE_INDEX_DB_PATH')
    base = current_app.config.get('KNOWLEDGE_UPDATES_DB_PATH')
    return Path(configured or (Path(base) if base else database_path()).with_name('knowledge_index.db'))


@contextmanager
def database():
    path = index_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30)
    try:
        conn.executescript('''
        CREATE TABLE IF NOT EXISTS ki_vectors(model TEXT, digest TEXT, dimension INTEGER, value BLOB,
          PRIMARY KEY(model,digest));
        CREATE TABLE IF NOT EXISTS ki_snapshots(scope TEXT PRIMARY KEY, digest TEXT, documents INTEGER,
          passages INTEGER, updated_at TEXT);
        CREATE TABLE IF NOT EXISTS ki_passages(scope TEXT, ordinal INTEGER, payload TEXT,
          PRIMARY KEY(scope,ordinal));
        ''')
        yield conn
        conn.commit()
    finally:
        conn.close()


def cached_vectors(keys):
    if not has_app_context() or not current_app.config.get('KNOWLEDGE_PERSISTENT_INDEX', True):
        return {}
    result = {}
    with database() as conn:
        for model, digest in keys:
            row = conn.execute('SELECT dimension,value FROM ki_vectors WHERE model=? AND digest=?', (model, digest)).fetchone()
            if row:
                vector = np.frombuffer(row[1], dtype='<f4').copy()
                if vector.size == row[0] and vector.size and np.isfinite(vector).all():
                    result[(model, digest)] = vector
    return result


def save_vectors(values):
    if not has_app_context() or not current_app.config.get('KNOWLEDGE_PERSISTENT_INDEX', True):
        return
    with database() as conn:
        for (model, digest), vector in values.items():
            array = np.asarray(vector, dtype='<f4')
            if array.ndim != 1 or not array.size or not np.isfinite(array).all():
                raise ValueError('invalid_persistent_embedding')
            conn.execute('INSERT OR REPLACE INTO ki_vectors VALUES(?,?,?,?)', (model, digest, array.size, array.tobytes()))
        # Bound historical cache independently from the active corpus quota.
        maximum = int(current_app.config.get('KNOWLEDGE_VECTOR_CACHE_LIMIT', 40000))
        conn.execute('DELETE FROM ki_vectors WHERE rowid IN (SELECT rowid FROM ki_vectors ORDER BY rowid DESC LIMIT -1 OFFSET ?)', (maximum,))


def persist_snapshot(documents, digest, scope='coach-CN'):
    if not has_app_context() or not current_app.config.get('KNOWLEDGE_PERSISTENT_INDEX', True):
        return
    with database() as conn:
        conn.execute('BEGIN IMMEDIATE')
        previous = conn.execute('SELECT digest FROM ki_snapshots WHERE scope=?', (scope,)).fetchone()
        if previous and previous[0] == digest:
            return
        conn.execute('DELETE FROM ki_passages WHERE scope=?', (scope,))
        conn.executemany('INSERT INTO ki_passages VALUES(?,?,?)',
                         [(scope, i, json.dumps(d, ensure_ascii=False)) for i, d in enumerate(documents)])
        conn.execute('INSERT OR REPLACE INTO ki_snapshots VALUES(?,?,?,?,?)',
                     (scope, digest, len({d['article_id'] for d in documents}), len(documents), datetime.now(timezone.utc).isoformat()))


def read_snapshot(digest, scope='coach-CN'):
    if not has_app_context() or not current_app.config.get('KNOWLEDGE_PERSISTENT_INDEX', True):
        return None
    with database() as conn:
        row = conn.execute('SELECT digest FROM ki_snapshots WHERE scope=?', (scope,)).fetchone()
        if not row or row[0] != digest:
            return None
        return [json.loads(r[0]) for r in conn.execute('SELECT payload FROM ki_passages WHERE scope=? ORDER BY ordinal', (scope,))]


def statistics():
    with database() as conn:
        row = conn.execute('SELECT digest,documents,passages,updated_at FROM ki_snapshots WHERE scope=?', ('coach-CN',)).fetchone()
        vectors = conn.execute('SELECT COUNT(*) FROM ki_vectors').fetchone()[0]
    return dict(snapshot=row[0] if row else None, documents=row[1] if row else 0,
                passages=row[2] if row else 0, updated_at=row[3] if row else None,
                cached_vectors=vectors, database_bytes=index_path().stat().st_size)

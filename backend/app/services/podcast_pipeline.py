"""Durable ingestion queue. Web requests enqueue; the standalone worker does network I/O."""
import json
import secrets
from datetime import timedelta
from uuid import uuid4

from flask import current_app

from . import podcast_store as store
from .podcast_service import PodcastError, _url, _text, now


def dump(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False)


def audit(conn, entity, action, **details):
    conn.execute('INSERT INTO podcast_audit(entity_id,action,occurred_at,payload) VALUES(?,?,?,?)',
                 (entity, action, now().isoformat(), dump(details)))


def source(conn, source_id):
    row = conn.execute('SELECT payload FROM podcast_sources WHERE id=?', (source_id,)).fetchone()
    return json.loads(row['payload']) if row else None


def save_source(conn, value):
    conn.execute('INSERT INTO podcast_sources VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET '
                 'url=excluded.url,payload=excluded.payload', (value['id'], value['url'], dump(value)))


def public_source(value):
    return {k: v for k, v in value.items() if k not in ('websub_secret', 'websub_token')}


def register_source(data, actor='migration', conn=None):
    """Idempotent, no fetching. Only explicitly approved hostnames can be fetched later."""
    url = _url(data.get('url'), 'RSS 地址', True)
    if conn is None:
        with store.transaction() as connection:
            return public_source(register_source(data, actor, connection))
    existing = conn.execute('SELECT payload FROM podcast_sources WHERE url=?', (url,)).fetchone()
    value = json.loads(existing['payload']) if existing else {
        'id': str(uuid4()), 'url': url, 'created_at': now().isoformat(),
        'next_poll_at': now().isoformat(), 'etag': None, 'last_modified': None,
        'last_success_at': None, 'last_error': None, 'failures': 0, 'unchanged': 0,
        'enabled': True, 'trusted': False, 'auto_approve': False,
        'websub_secret': secrets.token_hex(32), 'websub_token': secrets.token_hex(32),
    }
    permission = data.get('permission', value.get('permission', 'public_rss'))
    if permission not in ('public_rss', 'licensed'):
        raise PodcastError('请确认公开 RSS 或已获授权')
    for field in ('enabled', 'trusted', 'auto_approve'):
        if field in data:
            if type(data[field]) is not bool:
                raise PodcastError('来源开关必须是布尔值')
            value[field] = data[field]
    value.update(name=_text(data.get('name', value.get('name', url[:120])), '来源名称', 120, True),
                 permission=permission, updated_at=now().isoformat())
    if value['auto_approve'] and not value['trusted']:
        raise PodcastError('自动发布须先将来源设为可信，并通过完整资料规则检查')
    save_source(conn, value)
    for item in store.program_rows(conn):
        if item.get('source_id') == value['id']:
            item['source_enabled'] = value['enabled']
            store.save_program(conn, item)
    audit(conn, value['id'], 'source_saved', actor=actor,
          trusted=value['trusted'], auto_approve=value['auto_approve'], enabled=value['enabled'])
    return value


def enqueue(conn, kind, target):
    key = f'{kind}:{target}'
    previous = conn.execute("SELECT id FROM podcast_jobs WHERE dedupe_key=? AND state IN ('queued','running')",
                            (key,)).fetchone()
    if previous:
        return previous['id']
    job_id, stamp = str(uuid4()), now().isoformat()
    conn.execute('INSERT INTO podcast_jobs(id,kind,target,dedupe_key,state,available_at,created_at) '
                 "VALUES(?,?,?,?,'queued',?,?)", (job_id, kind, target, key, stamp, stamp))
    return job_id


def queue_source(source_id):
    with store.transaction() as conn:
        value = source(conn, source_id)
        if not value:
            raise PodcastError('来源不存在', 404)
        if not value['enabled']:
            raise PodcastError('来源已停用')
        return {'job_id': enqueue(conn, 'fetch', source_id), 'state': 'queued'}


def schedule_due():
    with store.transaction() as conn:
        # Convert legacy per-episode RSS settings without changing IDs or editorial state.
        for item in store.program_rows(conn):
            if item.get('rss_url') and item.get('source_permission') in ('public_rss', 'licensed'):
                exists = conn.execute('SELECT id FROM podcast_sources WHERE url=?', (item['rss_url'],)).fetchone()
                if not exists:
                    register_source({'url': item['rss_url'], 'name': item['name'],
                                     'permission': item['source_permission']}, conn=conn)
        jobs = []
        for row in conn.execute('SELECT payload FROM podcast_sources').fetchall():
            value = json.loads(row['payload'])
            if value['enabled'] and value['next_poll_at'] <= now().isoformat():
                jobs.append(enqueue(conn, 'fetch', value['id']))
            if (value['enabled'] and value.get('hub_url') and value.get('websub_renew_at', '') <= now().isoformat()
                    and current_app.config.get('PODCAST_WEBSUB_CALLBACK_BASE')):
                jobs.append(enqueue(conn, 'subscribe', value['id']))
        for provider, config in (('podcastindex', 'PODCAST_INDEX_KEY'), ('listennotes', 'PODCAST_LISTENNOTES_KEY')):
            if current_app.config.get(config) and (provider != 'podcastindex' or current_app.config.get('PODCAST_INDEX_SECRET')):
                last = conn.execute("SELECT created_at FROM podcast_jobs WHERE kind='discover' AND target=? "
                                    'ORDER BY created_at DESC LIMIT 1', (provider,)).fetchone()
                if not last or last['created_at'] < (now() - timedelta(hours=6)).isoformat():
                    jobs.append(enqueue(conn, 'discover', provider))
        return {'queued': jobs}


def claim():
    with store.transaction() as conn:
        # Recover a crashed worker; the old worker cannot commit after its lease is replaced.
        cutoff = (now() - timedelta(minutes=10)).isoformat()
        conn.execute("UPDATE podcast_jobs SET state=CASE WHEN attempts>=4 THEN 'failed' ELSE 'queued' END, "
                     "lease_token=NULL, error='worker_lease_expired' WHERE state='running' AND locked_at<?", (cutoff,))
        row = conn.execute("SELECT * FROM podcast_jobs WHERE state='queued' AND available_at<=? "
                           'ORDER BY available_at,created_at LIMIT 1', (now().isoformat(),)).fetchone()
        if not row:
            return None
        job = dict(row)
        job.update(lease_token=str(uuid4()), attempts=job['attempts'] + 1)
        conn.execute("UPDATE podcast_jobs SET state='running',attempts=?,locked_at=?,lease_token=? WHERE id=?",
                     (job['attempts'], now().isoformat(), job['lease_token'], job['id']))
        return job


def check_lease(conn, job):
    if job is not None and not conn.execute(
            "SELECT 1 FROM podcast_jobs WHERE id=? AND state='running' AND lease_token=?",
            (job['id'], job['lease_token'])).fetchone():
        raise PodcastError('任务已由其他工作进程接管', 409)


def run_one():
    job = claim()
    if not job:
        return None
    try:
        if job['kind'] == 'fetch':
            from .podcast_ingestion import fetch_source
            fetch_source(job['target'], job)
        elif job['kind'] == 'process':
            from .podcast_enrichment import process_episode
            process_episode(job['target'], job)
        elif job['kind'] == 'discover':
            from .podcast_discovery import discover
            discover('page' if job['target'].startswith('page:') else job['target'], job=job)
        elif job['kind'] == 'subscribe':
            from .podcast_discovery import subscribe
            subscribe(job['target'], job)
        else:
            raise PodcastError('未知任务类型')
        with store.transaction() as conn:
            check_lease(conn, job)
            conn.execute("UPDATE podcast_jobs SET state='done',error=NULL,finished_at=? WHERE id=?",
                         (now().isoformat(), job['id']))
        return {'id': job['id'], 'state': 'done'}
    except Exception as error:
        # Keep worker alive; persistent retries are bounded. Never store credentials/body in errors.
        current_app.logger.warning('Podcast job %s failed (%s)', job['id'], type(error).__name__)
        message = str(error)[:200] if isinstance(error, PodcastError) else type(error).__name__
        state = 'failed' if job['attempts'] >= 4 else 'queued'
        with store.transaction() as conn:
            owned = conn.execute('UPDATE podcast_jobs SET state=?,error=?,available_at=?,finished_at=? '
                         'WHERE id=? AND lease_token=?', (state, message,
                         (now() + timedelta(seconds=60 * 2 ** job['attempts'])).isoformat(),
                         now().isoformat() if state == 'failed' else None, job['id'], job['lease_token'])).rowcount
            if not owned:
                return {'id': job['id'], 'state': 'superseded'}
            value = source(conn, job['target']) if job['kind'] == 'fetch' else None
            if value:
                value.update(last_error=message, failures=value['failures'] + 1,
                             next_poll_at=(now() + timedelta(minutes=min(1440, 15 * 2 ** job['attempts']))).isoformat())
                save_source(conn, value)
        return {'id': job['id'], 'state': state, 'error': message}


def dashboard():
    with store.transaction() as conn:
        sources = [public_source(json.loads(r['payload'])) for r in conn.execute('SELECT payload FROM podcast_sources')]
        jobs = [dict(r) for r in conn.execute('SELECT id,kind,target,state,attempts,error,available_at,finished_at '
                                            'FROM podcast_jobs ORDER BY created_at DESC LIMIT 50')]
        discoveries = [json.loads(r['payload']) for r in conn.execute('SELECT payload FROM podcast_discoveries LIMIT 200')]
        episodes = store.program_rows(conn)
        audit_rows = [dict(r) for r in conn.execute('SELECT * FROM podcast_audit ORDER BY id DESC LIMIT 50')]
        return {'sources': sources, 'jobs': jobs, 'discoveries': discoveries, 'audit': audit_rows,
                'counts': {'sources': len(sources), 'healthy_sources': sum(bool(s.get('last_success_at')) and not s.get('last_error') for s in sources),
                           'episodes': len(episodes), 'pending_review': sum(p['status'] == 'draft' for p in episodes),
                           'approved': sum(p['status'] == 'approved' for p in episodes)},
                'integrations': {'podcastindex': bool(current_app.config.get('PODCAST_INDEX_KEY') and current_app.config.get('PODCAST_INDEX_SECRET')),
                                 'listennotes': bool(current_app.config.get('PODCAST_LISTENNOTES_KEY')),
                                 'websub': bool(current_app.config.get('PODCAST_WEBSUB_CALLBACK_BASE'))}}


def retry_job(job_id):
    with store.transaction() as conn:
        row = conn.execute("SELECT * FROM podcast_jobs WHERE id=? AND state='failed'", (job_id,)).fetchone()
        if not row:
            raise PodcastError('仅可重试已失败的任务', 409)
        # A newer active job may already cover this target; enqueue merges it.
        return {'job_id': enqueue(conn, row['kind'], row['target']), 'state': 'queued'}

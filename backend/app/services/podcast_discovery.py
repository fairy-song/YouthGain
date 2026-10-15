"""Directory discovery and WebSub subscriber; providers never bypass source approval."""
import hashlib
import hmac
import json
import secrets
import time
from datetime import timedelta
from html.parser import HTMLParser
from urllib.parse import urlencode, urljoin
from uuid import uuid4

from flask import current_app

from . import podcast_pipeline as pipe, podcast_store as store
from .podcast_ingestion import public_request, canonical_url
from .podcast_service import PodcastError, _url, _plain, now


def remember(conn, url, title, provider, metadata=None):
    url = canonical_url(url)
    old = conn.execute('SELECT payload FROM podcast_discoveries WHERE url=?', (url,)).fetchone()
    value = json.loads(old['payload']) if old else {
        'id': str(uuid4()), 'url': url, 'title': str(title)[:120],
        'provider': provider, 'status': 'pending', 'discovered_at': now().isoformat(),
        'metadata': metadata or {}}
    value['last_seen_at'] = now().isoformat()
    conn.execute('INSERT INTO podcast_discoveries VALUES(?,?,?) ON CONFLICT(url) DO UPDATE SET payload=excluded.payload',
                 (value['id'], url, pipe.dump(value)))
    return value


def directory_json(url, headers, host):
    status, _, body = public_request(url, headers=headers, allowed_hosts={host}, redirects=0)
    if status != 200:
        raise PodcastError(f'目录服务返回 HTTP {status}', 502)
    try:
        value = json.loads(body)
    except (ValueError, UnicodeError):
        raise PodcastError('目录服务返回无效 JSON', 502)
    if not isinstance(value, dict):
        raise PodcastError('目录服务返回格式无效', 502)
    return value


def discover(provider, job=None):
    """At most 3 queries / 10 feeds each per six-hour scheduled run."""
    topics = current_app.config.get('PODCAST_DISCOVERY_QUERIES', '大学生预算,消费决策,金融素养')
    queries = [''] if provider == 'page' else [q.strip()[:80] for q in topics.split(',') if q.strip()][:3]
    feeds = []
    deadline = time.monotonic() + 180  # comfortably shorter than the worker lease
    for query in queries:
        if time.monotonic() > deadline:
            break
        if provider == 'podcastindex':
            key, secret = current_app.config.get('PODCAST_INDEX_KEY'), current_app.config.get('PODCAST_INDEX_SECRET')
            if not key or not secret:
                raise PodcastError('Podcast Index 密钥尚未配置', 503)
            stamp = str(int(now().timestamp()))
            headers = {'X-Auth-Key': key, 'X-Auth-Date': stamp,
                       'Authorization': hashlib.sha1((key + secret + stamp).encode()).hexdigest()}
            value = directory_json('https://api.podcastindex.org/api/1.0/search/byterm?' +
                                   urlencode({'q': query, 'max': 10, 'clean': ''}), headers, 'api.podcastindex.org')
            for feed in value.get('feeds', [])[:10]:
                if isinstance(feed, dict) and feed.get('url'):
                    feeds.append((feed['url'], feed.get('title', ''), {'query': query, 'id': feed.get('id')}))
        elif provider == 'listennotes':
            key = current_app.config.get('PODCAST_LISTENNOTES_KEY')
            if not key:
                raise PodcastError('Listen Notes 密钥尚未配置', 503)
            headers = {'X-ListenAPI-Key': key}
            value = directory_json('https://listen-api.listennotes.com/api/v2/search?' +
                urlencode({'q': query, 'type': 'podcast', 'language': 'Chinese', 'safe_mode': 1}),
                headers, 'listen-api.listennotes.com')
            for feed in value.get('results', [])[:10]:
                if time.monotonic() > deadline:
                    break
                if not isinstance(feed, dict):
                    continue
                # The search response need not contain an RSS URL; retrieve the selected podcast's metadata.
                if not feed.get('rss') and isinstance(feed.get('id'), str) and feed['id'].isalnum():
                    feed = directory_json('https://listen-api.listennotes.com/api/v2/podcasts/' + feed['id'],
                                          headers, 'listen-api.listennotes.com')
                if feed.get('rss'):
                    feeds.append((feed['rss'], feed.get('title_original') or feed.get('title', ''), {'query': query}))
        elif provider == 'page':
            # Optional adapter for publicly permitted pages (including an operator-managed RSSHub route).
            with store.transaction() as conn:
                row = conn.execute('SELECT payload FROM podcast_discoveries WHERE id=?', (job['target'].split(':', 1)[1],)).fetchone()
            if not row:
                raise PodcastError('待发现页面不存在', 404)
            page = json.loads(row['payload'])
            status, _, body = public_request(page['url'])
            if status != 200:
                raise PodcastError('公开页面暂时无法读取', 502)
            parser = FeedLinks(page['url'])
            parser.feed(body.decode('utf-8', errors='replace'))
            feeds.extend((url, page['title'], {'page': page['url']}) for url in parser.links[:20])
            break
        else:
            raise PodcastError('目录来源无效')
    with store.transaction() as conn:
        pipe.check_lease(conn, job)
        saved = []
        for url, title, meta in feeds:
            try:
                saved.append(remember(conn, url, _plain(title), provider, meta))
            except PodcastError:
                continue  # Unsupported insecure URLs are counted but never fetched/upgraded silently.
        pipe.audit(conn, provider, 'discovery_done', found=len(saved), rejected=len(feeds) - len(saved))
        return saved


class FeedLinks(HTMLParser):
    def __init__(self, base):
        super().__init__()
        self.base, self.links = base, []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'link' and 'alternate' in values.get('rel', '').split() and values.get('type') in (
                'application/rss+xml', 'application/atom+xml') and values.get('href'):
            self.links.append(urljoin(self.base, values['href']))


def submit(data, actor):
    with store.transaction() as conn:
        value = remember(conn, data.get('url'), data.get('title', '手动提交来源'), 'manual')
        if data.get('kind') == 'page':
            # Explicit admin action queues a permitted page; no browser-time crawling.
            pipe.enqueue(conn, 'discover', 'page:' + value['id'])
        pipe.audit(conn, value['id'], 'discovery_submitted', actor=actor)
        return value


def accept(discovery_id, data, actor):
    with store.transaction() as conn:
        row = conn.execute('SELECT payload FROM podcast_discoveries WHERE id=?', (discovery_id,)).fetchone()
        if not row:
            raise PodcastError('候选来源不存在', 404)
        value = json.loads(row['payload'])
        if data.get('accepted') is False:
            value['status'] = 'rejected'
            result = value
        else:
            # Permission / host availability must be explicitly reviewed, independent of directory rank.
            if data.get('permission') not in ('public_rss', 'licensed'):
                raise PodcastError('接入前请确认来源许可')
            source = pipe.register_source({'url': value['url'], 'name': value['title'] or value['url'],
                                          'permission': data['permission']}, actor, conn)
            value.update(status='accepted', source_id=source['id'])
            result = pipe.public_source(source)
            pipe.enqueue(conn, 'fetch', source['id'])
        conn.execute('UPDATE podcast_discoveries SET payload=? WHERE id=?', (pipe.dump(value), discovery_id))
        pipe.audit(conn, discovery_id, 'discovery_reviewed', actor=actor, status=value['status'])
        return result


def subscribe(source_id, job=None):
    base = current_app.config.get('PODCAST_WEBSUB_CALLBACK_BASE')
    with store.transaction() as conn:
        value = pipe.source(conn, source_id)
        if not base or not value or not value['enabled'] or not value.get('hub_url'):
            raise PodcastError('WebSub 回调或 hub 尚未配置')
        token = secrets.token_hex(32)
        callback = _url(base.rstrip('/') + '/api/podcasts/websub/' + source_id + '/' + token, '公开回调地址', True)
        value.update(websub_token=token, websub_state='pending', websub_requested_at=now().isoformat(),
                     websub_renew_at=(now() + timedelta(hours=1)).isoformat())
        pipe.check_lease(conn, job)
        pipe.save_source(conn, value)
    hosts = {h.strip() for h in current_app.config.get('PODCAST_WEBSUB_ALLOWED_HOSTS', '').split(',') if h.strip()}
    status, _, _ = public_request(value['hub_url'], method='POST', redirects=0, allowed_hosts=hosts,
        headers={'Content-Type': 'application/x-www-form-urlencoded'}, body=urlencode({
            'hub.mode': 'subscribe', 'hub.topic': value['url'], 'hub.callback': callback,
            'hub.secret': value['websub_secret'], 'hub.lease_seconds': 86400}).encode())
    if status not in (202, 204):
        raise PodcastError(f'WebSub hub 返回 HTTP {status}', 502)
    return {'state': 'pending_verification'}


def verify_subscription(source_id, token, args):
    with store.transaction() as conn:
        value = pipe.source(conn, source_id)
        if (not value or not value['enabled'] or not hmac.compare_digest(token, value['websub_token']) or
                value.get('websub_state') not in ('pending', 'verified') or
                args.get('hub.mode') != 'subscribe' or args.get('hub.topic') != value['url'] or
                not isinstance(args.get('hub.challenge'), str) or len(args['hub.challenge']) > 1000):
            raise PodcastError('WebSub 验证无效', 404)
        try:
            lease = max(60, min(int(args.get('hub.lease_seconds', 86400)), 864000))
        except (TypeError, ValueError):
            raise PodcastError('WebSub 租约无效')
        value.update(websub_state='verified', websub_expires_at=(now() + timedelta(seconds=lease)).isoformat(),
                     websub_renew_at=(now() + timedelta(seconds=max(30, int(lease * .8)))).isoformat())
        pipe.save_source(conn, value)
        pipe.audit(conn, source_id, 'websub_verified', lease_seconds=lease)
        return args['hub.challenge']


def notification(source_id, token, body, signature):
    if len(body) > 1024 * 1024:
        raise PodcastError('通知过大', 413)
    with store.transaction() as conn:
        value = pipe.source(conn, source_id)
        if (not value or not value['enabled'] or not hmac.compare_digest(token, value['websub_token']) or
                value.get('websub_state') != 'verified' or value.get('websub_expires_at', '') < now().isoformat()):
            raise PodcastError('WebSub 订阅无效', 404)
        algorithm, _, digest = (signature or '').partition('=')
        if algorithm not in ('sha256', 'sha1') or not hmac.compare_digest(
                hmac.new(value['websub_secret'].encode(), body, getattr(hashlib, algorithm)).hexdigest(), digest):
            raise PodcastError('WebSub 签名无效', 403)
        # Notification is a signal only. Poll the pinned, approved feed through the same idempotent pipeline.
        # Coalesce signals to one fetch per source per minute, including replay after a job finishes.
        if value.get('last_push_at', '') > (now() - timedelta(minutes=1)).isoformat():
            return {'state': 'coalesced'}
        value['last_push_at'] = now().isoformat()
        pipe.save_source(conn, value)
        return {'state': 'queued', 'job_id': pipe.enqueue(conn, 'fetch', source_id)}

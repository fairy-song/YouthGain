"""RSS/Atom episode ingestion with pinned public-IP HTTPS and conditional requests."""
import hashlib
import ipaddress
import json
import re
import socket
import time
from datetime import timedelta
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
from uuid import uuid4
from xml.etree import ElementTree as ET

import requests
import urllib3
from flask import current_app

from . import podcast_store as store, podcast_pipeline as pipe
from .podcast_service import PodcastError, _url, _plain, _published, _validate_program, _vector, _cosine, now

ATOM = '{http://www.w3.org/2005/Atom}'
ITUNES = '{http://www.itunes.com/dtds/podcast-1.0.dtd}'
MAX_BODY = 1024 * 1024


def canonical_url(value):
    value = _url(value, '内容链接', True)
    parts = urlsplit(value)
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
             if not k.lower().startswith('utm_') and k.lower() not in ('fbclid', 'gclid')]
    return urlunsplit(('https', parts.netloc.lower(), parts.path or '/', urlencode(query), ''))


def public_request(url, *, headers=None, allowed_hosts=None, method='GET', body=None, redirects=3):
    """DNS is checked once then that exact IP is used with TLS hostname verification.

    Never use environment proxies, cookies, redirects carrying credentials, or arbitrary ports.
    The same validation is repeated at each feed redirect.
    """
    hosts = allowed_hosts if allowed_hosts is not None else {
        h.strip().lower() for h in current_app.config.get('PODCAST_RSS_ALLOWED_HOSTS', '').split(',') if h.strip()}
    for hop in range(redirects + 1):
        url = _url(url, '来源链接', True)
        host = urlsplit(url).hostname.lower()
        if host not in hosts:
            raise PodcastError('来源主机未加入服务端允许列表', 403)
        try:
            addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        except OSError:
            raise PodcastError('来源主机暂时无法解析', 502)
        ips = sorted({a[4][0] for a in addresses})
        if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
            raise PodcastError('来源主机不能解析到内部地址', 403)
        pool = urllib3.HTTPSConnectionPool(ips[0], port=443, server_hostname=host, assert_hostname=host,
            cert_reqs='CERT_REQUIRED', ca_certs=requests.certs.where(), maxsize=1)
        response = None
        try:
            parts = urlsplit(url)
            path = urlunsplit(('', '', parts.path or '/', parts.query, ''))
            response = pool.urlopen(method, path, body=body, headers={
                'User-Agent': 'YouthGainMetadata/2.0', 'Accept-Encoding': 'identity', **(headers or {}), 'Host': host},
                redirect=False, retries=False, preload_content=False,
                timeout=urllib3.Timeout(connect=3, read=10, total=20))
            status, response_headers = response.status, dict(response.headers)
            if status in (301, 302, 303, 307, 308):
                if hop >= redirects or method != 'GET' or headers and any(k.lower() in (
                        'authorization', 'x-listenapi-key', 'x-auth-key') for k in headers):
                    raise PodcastError('来源重定向未被允许', 502)
                url = urljoin(url, response.headers.get('Location', ''))
                continue
            if response.headers.get('Content-Encoding', 'identity').lower() not in ('', 'identity'):
                raise PodcastError('来源未按请求返回未压缩元数据', 502)
            data, start = bytearray(), time.monotonic()
            while True:
                chunk = response.read(65536, decode_content=False)
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > MAX_BODY or time.monotonic() - start > 20:
                    raise PodcastError('来源响应超过大小或时间限制', 502)
            return status, {k.lower(): v for k, v in response_headers.items()}, bytes(data)
        except urllib3.exceptions.HTTPError:
            raise PodcastError('来源网络或 TLS 连接失败', 502)
        finally:
            if response is not None:
                response.close()
            pool.close()
    raise PodcastError('来源重定向过多', 502)


def text(node, *names):
    for name in names:
        child = node.find(name)
        if child is not None:
            value = _plain(''.join(child.itertext()))
            if value:
                return value
    return ''


def duration(value):
    try:
        chunks = [int(x) for x in value.strip().split(':')]
        seconds = 0
        for chunk in chunks:
            seconds = seconds * 60 + chunk
        return seconds if 0 < seconds <= 86400 else None
    except (AttributeError, ValueError):
        return None


def parse_feed(body, feed_url):
    if len(body) > MAX_BODY or b'<!DOCTYPE' in body.upper() or b'<!ENTITY' in body.upper():
        raise PodcastError('RSS 内容过大或包含不允许的声明')
    try:
        # Parsing UTF-8 before checking declarations also blocks UTF-16 entity bypasses.
        root = ET.fromstring(body.decode('utf-8-sig'))
    except (ET.ParseError, UnicodeError):
        raise PodcastError('来源须为有效的 UTF-8 RSS/Atom')
    channel, atom = root.find('channel'), root.tag == ATOM + 'feed'
    if channel is None and not atom:
        raise PodcastError('只支持 RSS 或 Atom 来源')
    channel = root if atom else channel
    def link(node):
        if atom:
            for child in node.findall(ATOM + 'link'):
                if child.get('rel', 'alternate') == 'alternate' and child.get('href'):
                    return child.get('href')
        return text(node, 'link')
    show_link = link(channel)
    try:
        homepage = canonical_url(show_link) if show_link else canonical_url(feed_url)
    except PodcastError:
        homepage = canonical_url(feed_url)
    show = {'name': text(channel, ATOM + 'title' if atom else 'title')[:120] or '未命名节目',
            'publisher': text(channel, ITUNES + 'author', ATOM + 'author', 'managingEditor')[:120] or '待核对发布者',
            'description': text(channel, ATOM + 'subtitle' if atom else 'description')[:3000],
            'canonical_url': homepage, 'language': text(channel, 'language')[:12] or channel.get('{http://www.w3.org/XML/1998/namespace}lang', 'und')}
    if show['language'].lower().startswith('zh'):
        show['language'] = 'zh'
    episodes, skipped = [], 0
    for item in channel.findall(ATOM + 'entry' if atom else 'item')[:300]:
        title = text(item, ATOM + 'title' if atom else 'title')[:180]
        summary = text(item, ATOM + 'summary', ATOM + 'content', 'description',
                       '{http://purl.org/rss/1.0/modules/content/}encoded', ITUNES + 'summary')[:2000]
        day = _published(text(item, ATOM + 'published', ATOM + 'updated', 'pubDate'))
        raw_link = link(item)
        try:
            url = canonical_url(raw_link)
        except PodcastError:
            skipped += 1
            continue
        # Enclosures are deliberately not used: we store episode pages, never fetch audio.
        if not title or not day:
            skipped += 1
            continue
        guid = text(item, ATOM + 'id', 'guid')[:1000]
        episodes.append({'external_key': hashlib.sha256(('guid:' + guid if guid else 'url:' + url).encode()).hexdigest(),
                         'guid': guid, 'title': title, 'url': url, 'summary': summary,
                         'published_at': day.isoformat(), 'duration_seconds': duration(text(item, ITUNES + 'duration')),
                         'publisher_present': show['publisher'] != '待核对发布者',
                         'summary_present': bool(summary)})
    hubs = [c.get('href') for c in channel.findall(ATOM + 'link') if c.get('rel') == 'hub']
    return {'show': show, 'episodes': episodes, 'skipped': skipped, 'hub_url': hubs[0] if hubs else None}


def _normal(value):
    return re.sub(r'[^\w\u4e00-\u9fff]', '', value.lower())


def _hash(show, episode):
    material = {k: episode.get(k) for k in ('title', 'url', 'summary', 'published_at', 'duration_seconds')}
    material['show'] = show
    return hashlib.sha256(pipe.dump(material).encode()).hexdigest()


def ingest(conn, value, parsed):
    """One atomic source version; missing old entries never imply deletion."""
    show = parsed['show']
    found = conn.execute('SELECT id FROM podcast_shows WHERE canonical_url=?', (show['canonical_url'],)).fetchone()
    show_id = found['id'] if found else str(uuid4())
    conn.execute('INSERT INTO podcast_shows VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
                 (show_id, show['canonical_url'], pipe.dump(show)))
    added, changed, merged = 0, 0, 0
    for episode in parsed['episodes']:
        fingerprint = _hash(show, episode)
        binding = conn.execute('SELECT * FROM podcast_episode_keys WHERE source_id=? AND external_key=?',
                               (value['id'], episode['external_key'])).fetchone()
        if binding and binding['content_hash'] == fingerprint:
            continue
        rows = store.program_rows(conn)
        existing = store.program(conn, binding['program_id']) if binding else None
        if not existing:
            # Exact URL first; conservative cross-platform merge needs creator/title/date AND full text agreement.
            for other in rows:
                urls = {other.get('episode_url'), *(l['url'] for l in other.get('platform_links', []))}
                exact = episode['url'] in urls
                same_content = (len(episode['summary']) >= 80 and len(other.get('episode_summary', '')) >= 80 and
                    _normal(show['publisher']) == _normal(other.get('publisher', '')) and
                    _normal(episode['title']) == _normal(other.get('episode_title', '')) and
                    episode['published_at'] == other.get('episode_published_at') and
                    _cosine(_vector(episode['summary']), _vector(other['episode_summary'])) > .98)
                if exact or same_content:
                    existing = other
                    break
        # A second feed can add an alternate URL but cannot overwrite the primary source's editorial content.
        secondary = bool(existing and ((existing.get('source_id') and existing['source_id'] != value['id']) or
                         (not existing.get('source_id') and existing.get('rss_url') != value['url'])))
        if secondary:
            links = list(existing.get('platform_links', []))
            if episode['url'] != existing['episode_url'] and not any(l['url'] == episode['url'] for l in links):
                links.append({'platform': 'other', 'url': episode['url']})
                existing['platform_links'] = links[:5]
                store.save_program(conn, existing)
            merged += 1
            record = existing
        else:
            data = {**show, 'episode_title': episode['title'], 'episode_url': episode['url'],
                    'episode_summary': episode['summary'] or '来源未提供单集简介，等待人工补充。',
                    'description': show['description'] or '来源未提供节目简介。',
                    'episode_published_at': episode['published_at'], 'last_episode_at': episode['published_at'],
                    'topics': existing.get('topics', ['budget']) if existing else ['budget'],
                    'difficulty': existing.get('difficulty', 1) if existing else 1,
                    'quality_score': 0.0, 'source_permission': value['permission'], 'rss_url': value['url'],
                    'region': 'global', 'link_status': 'unknown'}
            record = _validate_program(data, existing)
            record.update(source_id=value['id'], source_enabled=value['enabled'], show_id=show_id, content_hash=fingerprint,
                          source_synced_at=now().isoformat(), duration_seconds=episode['duration_seconds'],
                          discovered_at=(existing or {}).get('discovered_at') or now().isoformat(),
                          source_evidence={'url': value['url'], 'guid': episode['guid'], 'method': 'rss',
                              'scope': 'publisher_metadata_only', 'publisher_present': episode['publisher_present'],
                              'summary_present': episode['summary_present'], 'fetched_at': now().isoformat()},
                          processing=None, review_blockers=['等待内容整理与审核'])
            # A withdrawal is sticky: a later source edit must not silently republish it.
            if existing and existing.get('status') == 'withdrawn':
                record['status'] = 'withdrawn'
            store.save_program(conn, record)
            pipe.enqueue(conn, 'process', record['id'] + ':' + fingerprint)
            added += not bool(existing)
            changed += bool(existing)
            pipe.audit(conn, record['id'], 'episode_changed' if existing else 'episode_discovered',
                       source_id=value['id'], content_hash=fingerprint)
        conn.execute('INSERT INTO podcast_episode_keys VALUES(?,?,?,?) ON CONFLICT(source_id,external_key) '
                     'DO UPDATE SET program_id=excluded.program_id,content_hash=excluded.content_hash',
                     (value['id'], episode['external_key'], record['id'], fingerprint))
    # Successful polling renews evidence freshness, including unchanged or truncated feeds.
    for record in store.program_rows(conn):
        if record.get('source_id') == value['id']:
            record.update(source_synced_at=now().isoformat(), source_error=None)
            store.save_program(conn, record)
    return {'added': added, 'changed': changed, 'merged': merged, 'skipped': parsed['skipped']}


def fetch_source(source_id, job=None):
    with store.transaction() as conn:
        value = pipe.source(conn, source_id)
    if not value or not value['enabled']:
        raise PodcastError('来源不存在或已停用', 404)
    headers = {'Accept': 'application/rss+xml, application/atom+xml, application/xml'}
    if value.get('etag'):
        headers['If-None-Match'] = value['etag']
    if value.get('last_modified'):
        headers['If-Modified-Since'] = value['last_modified']
    status, meta, body = public_request(value['url'], headers=headers)
    if status not in (200, 304):
        raise PodcastError(f'来源返回 HTTP {status}', 502)
    if status == 304 and not value.get('last_success_at'):
        raise PodcastError('首次读取来源不能返回 304', 502)
    parsed = parse_feed(body, value['url']) if status == 200 else None
    with store.transaction() as conn:
        pipe.check_lease(conn, job)
        latest = pipe.source(conn, source_id)
        if not latest or not latest['enabled'] or latest['url'] != value['url']:
            raise PodcastError('来源配置已改变', 409)
        result = ingest(conn, latest, parsed) if parsed else {'added': 0, 'changed': 0, 'merged': 0, 'skipped': 0}
        if parsed and parsed['hub_url']:
            try:
                latest['hub_url'] = _url(parsed['hub_url'], 'WebSub hub', True)
            except PodcastError:
                latest['hub_url'] = None
        unchanged = 0 if result['added'] or result['changed'] else min(8, latest['unchanged'] + 1)
        # 15 min for active sources, bounded backoff up to 24h for quiet sources.
        interval = min(1440, 15 * 2 ** unchanged)
        latest.update(last_success_at=now().isoformat(), last_error=None, failures=0, unchanged=unchanged,
                      next_poll_at=(now() + timedelta(minutes=interval)).isoformat(), last_result=result)
        for name, header in (('etag', 'etag'), ('last_modified', 'last-modified')):
            if status == 200:
                latest[name] = meta.get(header)
        if status == 304:
            for record in store.program_rows(conn):
                if record.get('source_id') == source_id:
                    record['source_synced_at'] = now().isoformat()
                    store.save_program(conn, record)
        pipe.save_source(conn, latest)
        pipe.audit(conn, source_id, 'source_fetched', status=status, **result)
        return result

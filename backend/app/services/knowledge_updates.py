"""Single-host, reviewed knowledge ingestion. Public content never publishes itself."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
from html import escape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sqlite3
import unicodedata
from urllib.parse import urljoin, urlsplit, parse_qs, urlencode
from uuid import uuid4

from flask import current_app

HOSTS = {'www.nfra.gov.cn', 'www.investor.org.cn', 'edu.sse.com.cn', 'www.pbc.gov.cn', 'www.ifec.org.hk', 'www.moneyhelper.org.uk', 'www.consumerfinance.gov'}
TEMPLATES = [
    ('分期消费风险提示', 'https://www.nfra.gov.cn/cn/view/pages/ItemDetail.html?docId=1251517&itemId=4100', 'page', 'CN'),
    ('支付场景信贷诱导提示', 'https://www.nfra.gov.cn/branch/hubei/view/pages/common/ItemDetail.html?docId=1272337&itemId=1414', 'page', 'CN'),
    ('中国投资者网知识普及', 'https://www.investor.org.cn/learning_center/', 'index', 'CN'),
    ('上交所投资者教育', 'https://edu.sse.com.cn/home/', 'index', 'CN'),
    ('香港投委会教育计划', 'https://www.ifec.org.hk/web/sc/other-resources/programmes/index.page', 'page', 'HK'),
]


def now():
    return datetime.now(timezone.utc)


def stamp():
    return now().isoformat()


@contextmanager
def database():
    from .podcast_store import database_path
    path = Path(current_app.config.get('KNOWLEDGE_UPDATES_DB_PATH') or database_path().with_name('knowledge_updates.db'))
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript('''
        CREATE TABLE IF NOT EXISTS ku_sources(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS ku_documents(id TEXT PRIMARY KEY, url TEXT UNIQUE NOT NULL,
          source_id TEXT NOT NULL, current_id TEXT, withdrawn INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS ku_versions(id TEXT PRIMARY KEY, document_id TEXT NOT NULL,
          fingerprint TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL,
          base_id TEXT, reviewer TEXT, reviewed_at TEXT, UNIQUE(document_id,fingerprint));
        CREATE TABLE IF NOT EXISTS ku_releases(id TEXT PRIMARY KEY, document_id TEXT NOT NULL,
          version_id TEXT, actor TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS ku_screenings(id INTEGER PRIMARY KEY AUTOINCREMENT,
          version_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS ku_screenings_version ON ku_screenings(version_id,id);
        CREATE INDEX IF NOT EXISTS ku_versions_status ON ku_versions(status);
        CREATE TRIGGER IF NOT EXISTS ku_version_content_immutable BEFORE UPDATE OF payload,fingerprint,document_id,base_id ON ku_versions
          BEGIN SELECT RAISE(ABORT,'knowledge version content is immutable'); END;
        CREATE TRIGGER IF NOT EXISTS ku_versions_no_delete BEFORE DELETE ON ku_versions
          BEGIN SELECT RAISE(ABORT,'knowledge versions cannot be deleted'); END;
        CREATE TRIGGER IF NOT EXISTS ku_release_no_update BEFORE UPDATE ON ku_releases
          BEGIN SELECT RAISE(ABORT,'knowledge releases are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS ku_release_no_delete BEFORE DELETE ON ku_releases
          BEGIN SELECT RAISE(ABORT,'knowledge releases are append-only'); END;
        ''')
        conn.execute('BEGIN IMMEDIATE')
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def dump(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False)


def safe_url(url):
    from .podcast_ingestion import canonical_url
    url = canonical_url(url)
    allowed = HOSTS | set(current_app.config.get('KNOWLEDGE_ALLOWED_HOSTS', '').split(','))
    if urlsplit(url).hostname not in allowed:
        raise ValueError('来源域名不在服务端可信列表中')
    return url


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = {'tag': 'root', 'attrs': {}, 'children': []}
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        if len(self.stack) > 128:
            raise ValueError('页面层级过深')
        node = {'tag': tag, 'attrs': dict(attrs), 'children': []}
        self.stack[-1]['children'].append(node)
        if tag not in ('area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'):
            self.stack.append(node)

    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i]['tag'] == tag:
                self.stack = self.stack[:i]
                break

    def handle_data(self, data):
        self.stack[-1]['children'].append(data)


def nodes(node):
    if isinstance(node, dict):
        yield node
        for child in node['children']:
            yield from nodes(child)


def text(node):
    if isinstance(node, str):
        return node
    if node['tag'] in ('script', 'style', 'nav', 'header', 'footer', 'noscript', 'form'):
        return ''
    body = ''.join(text(child) for child in node['children'])
    return '\n' + body + '\n' if node['tag'] in ('p', 'div', 'h1', 'h2', 'h3', 'li', 'section', 'article', 'br') else body


def extract(body):
    if re.search(br'<\?xml[^>]*encoding=["\'](?!utf-?8)', body[:150], re.I):
        raise ValueError('首版只处理UTF-8网页正文')
    encoding = 'gb18030' if re.search(br'charset\s*=\s*["\']?gb', body[:4096], re.I) else 'utf-8-sig'
    root = Page(body.decode(encoding, errors='strict')).root
    all_nodes = list(nodes(root))
    title_node = next((n for n in all_nodes if n['tag'] == 'h1'), None) or next((n for n in all_nodes if n['tag'] == 'title'), root)
    title = re.sub(r'\s+', ' ', text(title_node)).strip()[:160]
    preferred = next((n for n in all_nodes if n['attrs'].get('id', '').lower() in ('zoom', 'articlecontent')
        or any(token in n['attrs'].get('class', '').lower().split() for token in ('trs_editor', 'page-content'))), None)
    preferred = preferred or next((n for n in all_nodes if n['tag'] in ('article', 'main')), None)
    if preferred is None:
        raise ValueError('未识别到文章正文容器，保留旧版本')
    content = '\n\n'.join(line.strip() for line in text(preferred).splitlines() if line.strip())
    if not title or len(content) < 150 or len(content) > 40000 or re.search('栏目名称|验证码|访问验证|暫停服務|暂停服务|Access Denied|Just a moment|maintenance', title, re.I) or re.search(r'\{\{[^{}]+\}\}', content):
        raise ValueError('未取得完整文章正文；可能是动态页面或访问验证，保留旧内容')
    published = ''
    for node in all_nodes:
        attrs = node['attrs']
        if node['tag'] == 'meta' and (attrs.get('property') or attrs.get('name') or '').lower() in ('article:published_time', 'pubdate', 'publishdate', 'date'):
            match = re.search(r'\d{4}-\d{2}-\d{2}', attrs.get('content', ''))
            if match:
                published = match[0]
                break
    if not published:
        match = re.search(r'发布时间[：:\s]*(\d{4}-\d{2}-\d{2})', text(root))
        published = match[1] if match else ''
    if not published:
        heading = next((n for n in all_nodes if 'detail-title' in n['attrs'].get('class', '').split()), None)
        match = re.search(r'\d{4}-\d{2}-\d{2}', text(heading)) if heading else None
        published = match[0] if match else ''
    return title, content, published


def fetch_page(url, headers, allowed):
    """NFRA's own public page uses this DocInfo endpoint for article text."""
    from .podcast_ingestion import public_request
    parts = urlsplit(url)
    doc_id = parse_qs(parts.query).get('docId', [''])[0]
    if parts.hostname == 'www.nfra.gov.cn' and doc_id.isdigit() and parts.path.endswith('ItemDetail.html'):
        endpoint = 'https://www.nfra.gov.cn/cbircweb/DocInfo/SelectByDocId?' + urlencode({'docId': doc_id})
        status, response_headers, body = public_request(endpoint, allowed_hosts=allowed)
        if status != 200:
            return status, response_headers, body
        response = json.loads(body.decode('utf-8-sig'))
        article = response.get('data') or {}
        if response.get('rptCode') != 200 or str(article.get('docId')) != doc_id or not article.get('docTitle') or not article.get('docClob'):
            raise ValueError('官方正文接口返回不完整文章，保留旧内容')
        published = str(article.get('publishDate') or '')[:10]
        # JSON strings are already decoded. Word-exported inner charset tags
        # describe the old file, not the UTF-8 wrapper we construct here.
        inner = re.sub(r'<meta\b[^>]*>', '', article['docClob'], flags=re.I)
        wrapped = '<html><head><meta name="pubdate" content="' + escape(published, quote=True) + '"></head><body><article><h1>' + escape(article['docTitle']) + '</h1>' + inner + '</article></body></html>'
        return 200, {}, wrapped.encode('utf-8')
    return public_request(url, headers=headers, allowed_hosts=allowed)


def fingerprint(title, content):
    normalized = re.sub(r'\s+', '', unicodedata.normalize('NFKC', title + '\n' + content))
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()


def body_fingerprint(document):
    body = re.sub(r'\s+', '', unicodedata.normalize('NFKC', document['content']))
    title = re.sub(r'\s+', '', unicodedata.normalize('NFKC', document['title']))
    if title and body.startswith(title):
        body = body[len(title):]
    return hashlib.sha256(body.encode()).hexdigest()


def save_source(data, source_id=None):
    if not isinstance(data, dict):
        raise ValueError('来源必须为对象')
    with database() as conn:
        row = conn.execute('SELECT payload FROM ku_sources WHERE id=?', (source_id,)).fetchone() if source_id else None
        if source_id and not row:
            raise ValueError('来源不存在')
        old = json.loads(row['payload']) if row else {}
        value = {**old, **{k: v for k, v in data.items() if k in ('name', 'url', 'kind', 'region', 'enabled', 'usage_confirmed', 'publish_policy')}}
        value['url'] = safe_url(value.get('url', ''))
        if not isinstance(value.get('name'), str) or not 0 < len(value['name'].strip()) <= 160 or value.get('kind', 'page') not in ('page', 'index'):
            raise ValueError('请填写名称，来源类型须为正文或目录')
        if type(value.get('enabled', False)) is not bool or value.get('region', 'CN') not in ('CN', 'HK', 'general'):
            raise ValueError('来源启用状态或适用地区无效')
        if type(value.get('usage_confirmed', False)) is not bool or value.get('publish_policy', 'manual') not in ('manual', 'basic_auto'):
            raise ValueError('来源发布策略无效')
        if value.get('publish_policy') == 'basic_auto' and not value.get('usage_confirmed'):
            raise ValueError('启用基础内容自动发布前，须确认来源的站内使用范围')
        value.update(id=source_id or str(uuid4()), kind=value.get('kind', 'page'), region=value.get('region', 'CN'), enabled=value.get('enabled', False))
        if row and value['url'] != old['url']:
            value.update(etag=None, last_modified=None, next_check=None)
            value.update(publish_policy='manual', usage_confirmed=False)
        conn.execute('INSERT OR REPLACE INTO ku_sources VALUES(?,?)', (value['id'], dump(value)))
        return value


def seed():
    with database() as conn:
        if conn.execute('SELECT COUNT(*) FROM ku_sources').fetchone()[0]:
            return
        for name, url, kind, region in TEMPLATES:
            source = dict(id=str(uuid4()), name=name, url=url, kind=kind, region=region, enabled=False)
            conn.execute('INSERT INTO ku_sources VALUES(?,?)', (source['id'], dump(source)))


def stage(source, url, body, headers=None):
    title, content, published = extract(body)
    digest = fingerprint(title, content)
    with database() as conn:
        document = conn.execute('SELECT * FROM ku_documents WHERE url=?', (url,)).fetchone()
        doc_id = document['id'] if document else str(uuid4())
        if document is None:
            conn.execute('INSERT INTO ku_documents(id,url,source_id) VALUES(?,?,?)', (doc_id, url, source['id']))
        existing = conn.execute('SELECT id FROM ku_versions WHERE document_id=? AND fingerprint=?', (doc_id, digest)).fetchone()
        if existing:
            return False
        version = dict(id=str(uuid4()), title=title, content=content, source_url=url, source_name=source['name'],
                       region=source.get('region', 'CN'), date=published, checked_at=stamp(), fingerprint=digest)
        conn.execute('INSERT INTO ku_versions VALUES(?,?,?,?,?,?,?,?)',
                     (version['id'], doc_id, digest, dump(version), 'pending', document['current_id'] if document else None, None, None))
    screen_version(version['id'])
    return True


def screen_version(version_id):
    from .knowledge_screening import evaluate
    from .knowledge_capacity import check, current_articles
    if not current_app.config.get('KNOWLEDGE_SCREENING_ENABLED', True):
        return None
    with database() as conn:
        row = conn.execute('SELECT v.*,d.source_id,d.current_id FROM ku_versions v JOIN ku_documents d ON d.id=v.document_id WHERE v.id=?', (version_id,)).fetchone()
        if not row or row['status'] != 'pending':
            raise ValueError('只能筛选待处理版本')
        document = json.loads(row['payload'])
        source = json.loads(conn.execute('SELECT payload FROM ku_sources WHERE id=?', (row['source_id'],)).fetchone()[0])
        previous = conn.execute('SELECT payload FROM ku_versions WHERE id=?', (row['current_id'],)).fetchone()
        # Content equivalence ignores titles; syndicated titles must not defeat duplicate checks.
        others = conn.execute('SELECT payload FROM ku_versions WHERE document_id!=?', (row['document_id'],)).fetchall()
        duplicate = any(body_fingerprint(json.loads(v[0])) == body_fingerprint(document) for v in others)
        # Reserve a short lease before the external call, with no transaction held during inference.
        leased = conn.execute('SELECT payload FROM ku_screenings WHERE version_id=? ORDER BY id DESC LIMIT 1', (version_id,)).fetchone()
        if leased and json.loads(leased[0]).get('lease_until', '') > stamp():
            return {'decision': 'running'}
        conn.execute('INSERT INTO ku_screenings(version_id,payload,created_at) VALUES(?,?,?)',
                     (version_id, dump({'decision': 'running', 'lease_until': (now()+timedelta(minutes=1)).isoformat()}), stamp()))
    result = evaluate(document, source, json.loads(previous[0]) if previous else None, duplicate)
    with database() as conn:
        latest = conn.execute('SELECT current_id,source_id FROM ku_documents WHERE id=?', (row['document_id'],)).fetchone()
        latest_source = json.loads(conn.execute('SELECT payload FROM ku_sources WHERE id=?', (latest['source_id'],)).fetchone()[0])
        status = conn.execute('SELECT status FROM ku_versions WHERE id=?', (version_id,)).fetchone()[0]
        if status != 'pending' or latest['current_id'] != row['current_id'] or latest_source != source:
            result.update(auto_publish=False, decision='review')
            result['reasons'].append('筛选期间来源、发布状态或版本变化，需重新核对')
        elif result['auto_publish']:
            try:
                check(current_articles(conn, document, 'dynamic-'+row['document_id']))
                conn.execute("UPDATE ku_versions SET status='approved',reviewer=?,reviewed_at=? WHERE id=?", ('automatic:'+result['policy'], stamp(), version_id))
                conn.execute('UPDATE ku_documents SET current_id=?,withdrawn=0 WHERE id=?', (version_id, row['document_id']))
                conn.execute('INSERT INTO ku_releases VALUES(?,?,?,?,?)', (str(uuid4()), row['document_id'], version_id, 'automatic:'+result['policy'], stamp()))
                result['decision'] = 'published'
            except ValueError as error:
                result.update(auto_publish=False, decision='capacity_wait')
                result['reasons'].append(str(error))
        conn.execute('INSERT INTO ku_screenings(version_id,payload,created_at) VALUES(?,?,?)', (version_id, dump(result), stamp()))
    return result


def check_source(source_id):
    from .podcast_ingestion import public_request
    with database() as conn:
        row = conn.execute('SELECT payload FROM ku_sources WHERE id=?', (source_id,)).fetchone()
        if not row:
            raise ValueError('来源不存在')
        source = json.loads(row['payload'])
        if not source['enabled']:
            raise ValueError('请先启用来源')
        if source.get('lease_until', '') > stamp():
            raise ValueError('来源正在检查，请稍后重试')
        source['lease_until'] = (now() + timedelta(minutes=5)).isoformat()
        conn.execute('UPDATE ku_sources SET payload=? WHERE id=?', (dump(source), source_id))
    try:
        headers = {}
        if source.get('etag'):
            headers['If-None-Match'] = source['etag']
        if source.get('last_modified'):
            headers['If-Modified-Since'] = source['last_modified']
        allowed = HOSTS | set(current_app.config.get('KNOWLEDGE_ALLOWED_HOSTS', '').split(','))
        status, response_headers, body = fetch_page(source['url'], headers, allowed)
        added = 0
        if status == 200:
            if source['kind'] == 'page':
                added += stage(source, source['url'], body)
            else:
                root = Page(body.decode('utf-8-sig')).root
                links = []
                for node in nodes(root):
                    if node['tag'] != 'a' or len(text(node).strip()) < 6:
                        continue
                    url = urljoin(source['url'], node['attrs'].get('href', ''))
                    if urlsplit(url).hostname != urlsplit(source['url']).hostname or url == source['url'] or not re.search(r'\.(?:html?|shtml|page)(?:\?|$)', url):
                        continue
                    url = safe_url(url)
                    if url not in links:
                        links.append(url)
                if not links:
                    raise ValueError('目录无可采集的文章链接；动态页面需要专用适配器')
                cursor = source.get('cursor', 0) % len(links)
                batch = (links + links)[cursor:cursor+min(5, len(links))]
                source['cursor'] = (cursor + len(batch)) % len(links)
                valid_pages = 0
                for url in batch:
                    code, item_headers, item_body = fetch_page(url, {}, allowed)
                    if code != 200:
                        continue
                    try:
                        added += stage(source, url, item_body, item_headers)
                        valid_pages += 1
                    except ValueError:
                        continue  # Skip category menus; continue checking real articles.
                if not valid_pages:
                    raise ValueError('本批未取得有效正文，下轮继续检查后续链接')
            source.update(etag=response_headers.get('etag') if source['kind'] == 'page' else None,
                          last_modified=response_headers.get('last-modified') if source['kind'] == 'page' else None)
        elif status != 304:
            raise ValueError(f'来源返回HTTP {status}，保留旧版本')
        source.update(last_result='updated' if added else 'unchanged', last_error=None, failures=0,
                      last_checked=stamp(), next_check=(now()+timedelta(days=1)).isoformat())
    except Exception as error:
        failures = source.get('failures', 0)+1
        source.update(last_result='failed', last_error=str(error)[:240], failures=failures,
                      last_checked=stamp(), next_check=(now()+timedelta(minutes=min(1440, 15*2**min(failures, 7)))).isoformat())
    finally:
        with database() as conn:
            latest = json.loads(conn.execute('SELECT payload FROM ku_sources WHERE id=?', (source_id,)).fetchone()[0])
            if latest.get('lease_until') == source['lease_until']:
                # Merge only check results. Source settings can change during the request.
                if (latest['url'], latest['kind']) == (source['url'], source['kind']):
                    for key in ('cursor', 'etag', 'last_modified', 'last_result', 'last_error',
                                'failures', 'last_checked', 'next_check'):
                        if key in source:
                            latest[key] = source[key]
                latest['lease_until'] = ''
                conn.execute('UPDATE ku_sources SET payload=? WHERE id=?', (dump(latest), source_id))
    return latest


def run_due(limit=2):
    if not current_app.config.get('KNOWLEDGE_UPDATES_ENABLED', True):
        return
    seed()
    with database() as conn:
        sources = [json.loads(row[0]) for row in conn.execute('SELECT payload FROM ku_sources')]
    for source in sorted(sources, key=lambda s: s.get('next_check') or ''):
        if limit <= 0:
            break
        if source['enabled'] and (source.get('next_check') or '') <= stamp() and (source.get('lease_until') or '') <= stamp():
            check_source(source['id'])
            limit -= 1
    if current_app.config.get('KNOWLEDGE_SCREENING_ENABLED', True):
        with database() as conn:
            cutoff = (now()-timedelta(days=1)).isoformat()
            pending = conn.execute("SELECT v.id FROM ku_versions v LEFT JOIN ku_screenings s ON s.id=(SELECT MAX(id) FROM ku_screenings WHERE version_id=v.id) WHERE v.status='pending' AND (s.id IS NULL OR s.created_at<?) ORDER BY v.rowid LIMIT 2", (cutoff,)).fetchall()
        for row in pending:
            try:
                screen_version(row[0])
            except ValueError:
                pass  # Concurrent human review wins; check again on the next run.
    # Rebuild only the changed public snapshot; inference is not needed for this step.
    from .admin_service import list_kb_articles
    from .knowledge_retriever import _index, LocalModels
    articles, error = list_kb_articles()
    if not error:
        _index([a for a in articles if a.get('region', 'CN') == 'CN'], LocalModels(), False)


def release(document_id, version_id, actor):
    with database() as conn:
        doc = conn.execute('SELECT * FROM ku_documents WHERE id=?', (document_id,)).fetchone()
        version = conn.execute('SELECT * FROM ku_versions WHERE id=? AND document_id=?', (version_id, document_id)).fetchone() if version_id else None
        if not doc or (version_id and (not version or version['status'] != 'approved')):
            raise ValueError('仅能回退到同一文章已审核的版本')
        if version:
            from .knowledge_capacity import check, current_articles
            check(current_articles(conn, json.loads(version['payload']), 'dynamic-'+document_id))
        conn.execute('UPDATE ku_documents SET current_id=?,withdrawn=? WHERE id=?', (version_id, not bool(version_id), document_id))
        conn.execute('INSERT INTO ku_releases VALUES(?,?,?,?,?)', (str(uuid4()), document_id, version_id, actor, stamp()))


def review(version_id, data, actor):
    if data.get('decision') not in ('approve', 'reject'):
        raise ValueError('审核决定无效')
    with database() as conn:
        version = conn.execute('SELECT * FROM ku_versions WHERE id=?', (version_id,)).fetchone()
        if not version or version['status'] != 'pending':
            raise ValueError('版本不存在或已处理')
        if data['decision'] == 'reject':
            conn.execute('UPDATE ku_versions SET status=?,reviewer=?,reviewed_at=? WHERE id=?', ('rejected', actor, stamp(), version_id))
            return
        if data.get('confirmed') is not True:
            raise ValueError('请确认来源、适用地区、日期及内容使用范围')
        doc = conn.execute('SELECT * FROM ku_documents WHERE id=?', (version['document_id'],)).fetchone()
        if doc['current_id'] != data.get('expected_current'):
            raise ValueError('当前发布版本已变化，请重新核对差异后采集新版本')
        from .knowledge_capacity import check, current_articles
        check(current_articles(conn, json.loads(version['payload']), 'dynamic-'+version['document_id']))
        conn.execute('UPDATE ku_versions SET status=?,reviewer=?,reviewed_at=? WHERE id=?', ('approved', actor, stamp(), version_id))
        conn.execute('UPDATE ku_documents SET current_id=?,withdrawn=0 WHERE id=?', (version_id, doc['id']))
        conn.execute('INSERT INTO ku_releases VALUES(?,?,?,?,?)', (str(uuid4()), doc['id'], version_id, actor, stamp()))


def public_article(payload, document_id):
    value = dict(payload)
    value.update(version=value['id'], id='dynamic-'+document_id, category='safety',
                 tags=['动态来源', value['region']], summary=value['content'][:160], readTime=5)
    return value


def published():
    if not current_app.config.get('KNOWLEDGE_UPDATES_ENABLED', True):
        return []
    with database() as conn:
        rows = conn.execute('SELECT v.payload,d.id FROM ku_documents d JOIN ku_versions v ON d.current_id=v.id JOIN ku_sources s ON d.source_id=s.id WHERE d.withdrawn=0 AND v.status=\'approved\'').fetchall()
        result = []
        for row in rows:
            result.append(public_article(json.loads(row['payload']), row['id']))
        return result


def overview(status='all', page=1, page_size=300):
    if status not in ('all', 'pending', 'approved', 'rejected', 'excluded'):
        raise ValueError('未知的版本状态')
    try:
        page, page_size = int(page), int(page_size)
    except (ValueError, TypeError):
        raise ValueError('分页参数须为整数') from None
    if page < 1 or not 1 <= page_size <= 300:
        raise ValueError('页码须大于0，每页数量须在1至300之间')
    seed()
    with database() as conn:
        sources = [json.loads(row[0]) for row in conn.execute('SELECT payload FROM ku_sources')]
        # Filter the complete ledger before limiting payloads; latest screening wins.
        query = """FROM ku_versions v JOIN ku_documents d ON v.document_id=d.id
          LEFT JOIN ku_screenings s ON s.id=(SELECT MAX(id) FROM ku_screenings WHERE version_id=v.id)
          LEFT JOIN ku_versions old ON old.id=d.current_id"""
        params = []
        if status == 'excluded':
            query += " WHERE json_extract(s.payload,'$.decision')=?"
            params.append('exclude')
        elif status != 'all':
            query += ' WHERE v.status=?'
            params.append(status)
        total = conn.execute('SELECT COUNT(*) '+query, params).fetchone()[0]
        pages = max(1, (total + page_size - 1) // page_size)
        page = min(page, pages)
        rows = conn.execute("""SELECT v.*,d.url,d.current_id,d.withdrawn,
          old.payload AS previous_payload,s.payload AS screening_payload,s.created_at AS screened_at """
          + query + ' ORDER BY v.rowid DESC LIMIT ? OFFSET ?', [*params, page_size, (page-1)*page_size])
        versions = []
        for row in rows:
            value = {**dict(row), **json.loads(row['payload'])}
            for key in ('payload', 'previous_payload', 'screening_payload', 'screened_at'):
                value.pop(key, None)
            value['previous_content'] = json.loads(row['previous_payload'])['content'] if row['previous_payload'] else ''
            value['screening'] = dict(json.loads(row['screening_payload']), checked_at=row['screened_at']) if row['screening_payload'] else None
            versions.append(value)
        counts = dict(conn.execute('SELECT status,COUNT(*) FROM ku_versions GROUP BY status').fetchall())
        from .knowledge_capacity import current_articles, report
        articles = current_articles(conn)
    return dict(sources=sources, versions=versions, version_counts=counts, capacity=report(articles),
                pagination=dict(page=page, page_size=page_size, total=total, pages=pages))

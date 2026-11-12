import json
from concurrent.futures import ThreadPoolExecutor
import pytest
from test_learning_flow import client as base_client, call
from app.services import knowledge_updates as ku, podcast_ingestion, auth_service


@pytest.fixture
def client(base_client, tmp_path, monkeypatch):
    base_client.application.config['KNOWLEDGE_UPDATES_DB_PATH'] = str(tmp_path / 'knowledge.db')
    monkeypatch.setattr(auth_service, 'verify_firebase_token', lambda token: ({'uid': token, 'role': 'admin' if token == 'admin' else 'user'}, None))
    return base_client


def page(content='预算应当先核对必要开支，再为消费选择和储蓄目标留出位置。'*12):
    return ('<html><head><title>预算安排方法</title><meta name="pubdate" content="2026-10-01"></head><body><nav>菜单</nav><article><h1>预算安排方法</h1><p>'+content+'</p></article><footer>广告</footer></body></html>').encode()


def source(client, **extra):
    response = call(client, 'post', '/api/admin/knowledge-updates/sources', dict(name='官方教育栏目', url='https://www.investor.org.cn/lesson.html', enabled=True, kind='page', region='CN', **extra), user='admin')
    assert response.status_code == 201
    return response.json['source']


def scan(client, sid):
    return call(client, 'post', f'/api/admin/knowledge-updates/sources/{sid}/check', {}, user='admin').json['source']


def versions(client):
    return call(client, 'get', '/api/admin/knowledge-updates', user='admin').json['versions']


def approve(client, version, **extra):
    return call(client, 'post', f'/api/admin/knowledge-updates/versions/{version["id"]}/review', dict(decision='approve', confirmed=True, expected_current=version['current_id'], **extra), user='admin')


def test_admin_only_and_source_allowlist(client):
    assert client.get('/api/admin/knowledge-updates').status_code == 401
    assert call(client, 'get', '/api/admin/knowledge-updates').status_code == 403
    for url in ('https://127.0.0.1/private', 'https://untrusted.example/a', 'http://www.investor.org.cn/a'):
        assert call(client, 'post', '/api/admin/knowledge-updates/sources', dict(name='bad', url=url), user='admin').status_code == 400


def test_fingerprint_ignores_layout_whitespace_but_detects_meaningful_change():
    assert ku.fingerprint('预算', '留出 空间\n') == ku.fingerprint('预算', '留出空间')
    assert ku.fingerprint('预算', '额度100') != ku.fingerprint('预算', '额度200')
    title, content, date = ku.extract(page())
    assert title == '预算安排方法' and date == '2026-10-01'
    assert '广告' not in content and '菜单' not in content


def test_rejects_dynamic_shell_and_maintenance_pages():
    for body in (page('{{data.docTitle}}' * 30), page().replace('预算安排方法'.encode(), '投委會網站 - 暫停服務'.encode())):
        with pytest.raises(ValueError):
            ku.extract(body)


def test_sse_body_selector_and_real_header_date():
    html = '<html><title>投诉指南</title><div class="detail-title">2026-05-18 来源：官方</div><div class="page-content">' + '核对投诉材料和业务办理信息。'*30 + '</div><div>导航菜单</div></html>'
    title, content, date = ku.extract(html.encode())
    assert '导航菜单' not in content and date == '2026-05-18'


def test_nfra_public_json_adapter_preserves_real_date(client, monkeypatch):
    def request(url, **kwargs):
        assert url == 'https://www.nfra.gov.cn/cbircweb/DocInfo/SelectByDocId?docId=1251517'
        return 200, {}, json.dumps({'rptCode': 200, 'data': {'docId': 1251517, 'docTitle': '理性分期', 'publishDate': '2026-03-13 19:48:25', 'docClob': '<meta charset="gb2312"><p>' + '核对分期融资成本，认真阅读合同条款。'*20 + '</p>'}}, ensure_ascii=False).encode()
    monkeypatch.setattr(podcast_ingestion, 'public_request', request)
    code, _, body = ku.fetch_page('https://www.nfra.gov.cn/cn/view/pages/ItemDetail.html?docId=1251517', {}, ku.HOSTS)
    assert code == 200
    assert ku.extract(body)[2] == '2026-03-13'


def test_review_gate_dedup_publish_withdraw_rollback_and_old_content_survives_failure(client, monkeypatch):
    item = source(client)
    responses = [page()]
    monkeypatch.setattr(podcast_ingestion, 'public_request', lambda *a, **k: (200, {'etag': 'one'}, responses[0]))
    assert scan(client, item['id'])['last_result'] == 'updated'
    initial = versions(client)[0]
    assert scan(client, item['id'])['last_result'] == 'unchanged'
    assert len(versions(client)) == 1
    assert not any(a.get('source_url') for a in client.get('/api/knowledge').json['articles'])
    assert call(client, 'post', f'/api/admin/knowledge-updates/versions/{initial["id"]}/review', {'decision': 'approve'}, user='admin').status_code == 400
    assert approve(client, initial).status_code == 200
    article = next(a for a in client.get('/api/knowledge').json['articles'] if a.get('source_url'))
    assert article['version'] == initial['id'] and article['date'] == '2026-10-01'
    responses[0] = page('更新后的方法需要重新核对每一项支出，并认真预留未来安排。'*12)
    scan(client, item['id'])
    second = versions(client)[0]
    assert second['previous_content'] == initial['content']
    assert approve(client, second).status_code == 200
    monkeypatch.setattr(podcast_ingestion, 'public_request', lambda *a, **k: (503, {}, b''))
    assert scan(client, item['id'])['last_result'] == 'failed'
    assert next(a for a in client.get('/api/knowledge').json['articles'] if a.get('source_url'))['version'] == second['id']
    path = f'/api/admin/knowledge-updates/documents/{initial["document_id"]}/release'
    assert call(client, 'post', path, {'version_id': initial['id']}, user='admin').status_code == 200
    assert next(a for a in client.get('/api/knowledge').json['articles'] if a.get('source_url'))['version'] == initial['id']
    assert call(client, 'post', path, {}, user='admin').status_code == 200
    assert not any(a.get('source_url') for a in client.get('/api/knowledge').json['articles'])


def test_304_preserves_content_and_sends_conditional_headers(client, monkeypatch):
    item = source(client)
    monkeypatch.setattr(podcast_ingestion, 'public_request', lambda *a, **k: (200, {'etag': 'tag'}, page()))
    scan(client, item['id'])
    def unchanged(url, **kwargs):
        assert kwargs['headers']['If-None-Match'] == 'tag'
        return 304, {}, b''
    monkeypatch.setattr(podcast_ingestion, 'public_request', unchanged)
    assert scan(client, item['id'])['last_result'] == 'unchanged'
    assert len(versions(client)) == 1


def test_source_disabled_and_bad_html_do_not_publish(client, monkeypatch):
    item = source(client)
    monkeypatch.setattr(podcast_ingestion, 'public_request', lambda *a, **k: (200, {}, b'<html><title>Access Denied</title></html>'))
    assert scan(client, item['id'])['last_result'] == 'failed'
    call(client, 'put', f'/api/admin/knowledge-updates/sources/{item["id"]}', {'enabled': False}, user='admin')
    assert call(client, 'post', f'/api/admin/knowledge-updates/sources/{item["id"]}/check', {}, user='admin').status_code == 400
    assert not versions(client)


def test_stale_review_conflict_and_immutable_history(client, monkeypatch):
    item = source(client)
    monkeypatch.setattr(podcast_ingestion, 'public_request', lambda *a, **k: (200, {}, page()))
    scan(client, item['id'])
    old_view = versions(client)[0]
    assert approve(client, old_view).status_code == 200
    with client.application.app_context(), ku.database() as conn:
        with pytest.raises(Exception):
            conn.execute('UPDATE ku_versions SET payload=?', ('{}',))
    assert approve(client, old_view).status_code == 400


def test_due_polling_only_checks_enabled_due_sources(client, monkeypatch):
    item = source(client)
    called = []
    monkeypatch.setattr(podcast_ingestion, 'public_request', lambda *a, **k: (called.append(a[0]) or 200, {}, page()))
    with client.application.app_context():
        ku.run_due()
        ku.run_due()
    assert called == [item['url']]


def test_changed_passage_only_reembeds_new_text(client):
    import numpy as np
    from app.services import knowledge_retriever as retriever
    calls = []
    class Models:
        signature = 'incremental-test-only'
        def encode(self, texts, **kwargs):
            calls.append(list(texts))
            return np.ones((len(texts), 3), dtype=np.float32)
    articles = [dict(id='a', title='预算', content='先记录必要生活开支，再安排下一步的消费计划。'),
                dict(id='b', title='备用金', content='备用金用于应对未来可能发生的临时开支。')]
    retriever._index(articles, Models(), True)
    retriever._index([articles[0], dict(articles[1], content='备用金需要根据个人实际情况重新核验和安排。')], Models(), True)
    assert [len(items) for items in calls] == [2, 1]


def test_competing_pending_versions_need_current_review_view(client, monkeypatch):
    item = source(client)
    current = [page()]
    monkeypatch.setattr(podcast_ingestion, 'public_request', lambda *a, **k: (200, {}, current[0]))
    scan(client, item['id'])
    first = versions(client)[0]
    current[0] = page('应该认真检查备用金与未来开支安排，避免重复计算资金。'*12)
    scan(client, item['id'])
    stale_view = versions(client)[0]
    approve(client, first)
    assert approve(client, stale_view).status_code == 400
    assert approve(client, versions(client)[0]).status_code == 200


def test_concurrent_checks_create_one_version(client, monkeypatch):
    item = source(client)
    monkeypatch.setattr(podcast_ingestion, 'public_request', lambda *a, **k: (200, {}, page()))
    app = client.application
    def run(_):
        with app.app_context():
            try:
                return ku.check_source(item['id'])
            except ValueError:
                return None
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(run, range(3)))
    assert len(versions(client)) == 1


def test_overview_filters_before_pagination_and_reaches_old_pending(client):
    with client.application.app_context(), ku.database() as conn:
        conn.execute("INSERT INTO ku_documents(id,url,source_id) VALUES('history','https://www.investor.org.cn/history','fixture')")
        for index in range(305):
            body = ku.dump(dict(id=f'h{index}', title=f'预算方法{index}', content='预算安排', region='CN'))
            conn.execute('INSERT INTO ku_versions(id,document_id,fingerprint,payload,status) VALUES(?,?,?,?,?)',
                         (f'h{index}', 'history', str(index), body, 'pending' if index < 3 else 'approved'))
        # Only the latest screening should decide which queue includes a version.
        for decision in ('exclude', 'review'):
            conn.execute('INSERT INTO ku_screenings(version_id,payload,created_at) VALUES(?,?,?)',
                         ('h1', ku.dump(dict(decision=decision)), ku.stamp()))
        conn.execute('INSERT INTO ku_screenings(version_id,payload,created_at) VALUES(?,?,?)',
                     ('h2', ku.dump(dict(decision='exclude')), ku.stamp()))
    root = '/api/admin/knowledge-updates'
    response = call(client, 'get', root+'?status=pending&page_size=2', user='admin')
    assert response.status_code == 200
    assert [v['id'] for v in response.json['versions']] == ['h2', 'h1']
    assert response.json['pagination'] == dict(page=1, page_size=2, total=3, pages=2)
    second = call(client, 'get', root+'?status=pending&page_size=2&page=2', user='admin').json
    assert [v['id'] for v in second['versions']] == ['h0']
    assert second['version_counts'] == dict(pending=3, approved=302)
    excluded = call(client, 'get', root+'?status=excluded', user='admin').json
    assert [v['id'] for v in excluded['versions']] == ['h2']
    approved = call(client, 'get', root+'?status=approved&page_size=100&page=999', user='admin').json
    assert approved['pagination'] == dict(page=4, page_size=100, total=302, pages=4)
    assert [v['id'] for v in approved['versions']] == ['h4','h3']
    assert call(client, 'get', root+'?status=pending').status_code == 403


@pytest.mark.parametrize('query', ['status=unknown', 'page=0', 'page=-1', 'page=abc', 'page_size=0', 'page_size=301', 'page_size=1.5'])
def test_overview_rejects_invalid_pagination(client, query):
    assert call(client, 'get', '/api/admin/knowledge-updates?'+query, user='admin').status_code == 400


def test_overview_empty_queue_has_explicit_pagination(client):
    result = call(client, 'get', '/api/admin/knowledge-updates?status=rejected&page=2', user='admin').json
    assert result['versions'] == []
    assert result['pagination'] == dict(page=1, page_size=300, total=0, pages=1)


def test_check_source_preserves_settings_changed_during_request(client, monkeypatch):
    item = source(client, publish_policy='basic_auto', usage_confirmed=True)

    def fetch(*args, **kwargs):
        ku.save_source(dict(publish_policy='manual', usage_confirmed=False, enabled=False),
                       item['id'])
        return 304, {}, b''

    monkeypatch.setattr(ku, 'fetch_page', fetch)
    result = scan(client, item['id'])
    assert result['last_result'] == 'unchanged'
    assert result['publish_policy'] == 'manual'
    assert result['usage_confirmed'] is False
    assert result['enabled'] is False
    with client.application.app_context():
        saved = next(s for s in ku.overview()['sources'] if s['id'] == item['id'])
        assert saved == result


def test_expired_source_check_does_not_overwrite_new_check(client, monkeypatch):
    from datetime import timedelta

    item = source(client)
    start = ku.now()
    monkeypatch.setattr(ku, 'now', lambda: start)

    def slow_fetch(*args, **kwargs):
        monkeypatch.setattr(ku, 'now', lambda: start + timedelta(minutes=6))
        monkeypatch.setattr(ku, 'fetch_page', lambda *args: (304, {}, b''))
        newer = ku.check_source(item['id'])
        assert newer['last_result'] == 'unchanged'
        return 503, {}, b''

    monkeypatch.setattr(ku, 'fetch_page', slow_fetch)
    result = scan(client, item['id'])
    assert result['last_result'] == 'unchanged'
    assert not result['last_error']

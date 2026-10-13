"""B1 integration tests use synthetic programmes and never contact podcast platforms."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import pytest

from test_learning_flow import client as base_client, call
from app.services import podcast_service as service


@pytest.fixture
def client(base_client, monkeypatch, tmp_path):
    from app.services import auth_service
    monkeypatch.setattr(auth_service, 'verify_firebase_token', lambda token: (
        {'uid': token, 'email': f'{token}@example.org', 'role': 'admin' if token == 'admin' else 'user'}, None))
    monkeypatch.setattr(service, 'now', lambda: datetime.fromisoformat('2026-10-11T12:00:00+08:00'))
    base_client.application.config.update(PODCAST_DB_PATH=str(tmp_path / 'podcasts.db'),
                                          PODCAST_RSS_ALLOWED_HOSTS='feed.example',
                                          PODCAST_STARTER_CATALOG_ENABLED=False)
    return base_client


def payload(name='收支慢聊', topic='budget', **updates):
    result = {'name': name, 'publisher': '示例编辑部', 'description': '用学生可以理解的故事，长期讨论预算和生活中的金融选择。',
              'canonical_url': f'https://podcasts.example/{name}',
              'episode_title': f'{name}：如何看待预算', 'episode_url': f'https://podcasts.example/episode/{name}',
              'episode_summary': '讨论如何安排一笔生活费。', 'episode_published_at': '2026-10-10',
              'platform_links': [{'platform': 'xiaoyuzhou', 'url': f'https://xiaoyuzhoufm.com/episode/{name}'}],
              'topics': [topic], 'difficulty': 1, 'quality_score': 0.9, 'last_episode_at': '2026-10-10',
              'source_permission': 'manual', 'rss_url': '', 'promotion_flag': False, 'product_pitch': False,
              'language': 'zh', 'region': 'CN'}
    return {**result, **updates}


def add(client, name='收支慢聊', topic='budget', approved=True, **updates):
    response = call(client, 'post', '/api/podcasts/admin/programs', payload(name, topic, **updates), user='admin')
    assert response.status_code == 201, response.json
    program = response.json['program']
    if approved:
        response = call(client, 'post', f"/api/podcasts/admin/programs/{program['id']}/review",
                        {'approved': True}, user='admin')
        assert response.status_code == 200, response.json
    return program['id']


def test_auth_daily_stability_feedback_and_account_isolation(client, monkeypatch):
    assert client.get('/api/podcasts/today').status_code == 401
    assert call(client, 'get', '/api/podcasts/admin/programs').status_code == 403
    first = add(client)
    today = call(client, 'get', '/api/podcasts/today').json
    assert today['program']['id'] == first
    assert '/episode/' in today['program']['episode_url']
    assert today['reason'].startswith('适合从收支安排开始了解')
    assert call(client, 'get', '/api/podcasts/today').json == today
    assert call(client, 'get', '/api/podcasts/today', user='bob').json['program']['id'] == first
    assert call(client, 'post', '/api/podcasts/feedback', {'program_id': first, 'kind': 'follow'}).status_code == 200
    assert call(client, 'get', '/api/podcasts/today').json['followed'] is True
    assert call(client, 'post', '/api/podcasts/feedback', {'program_id': first, 'kind': 'dislike'}).status_code == 200
    assert call(client, 'get', '/api/podcasts/today').json['status'] == 'dismissed'
    assert call(client, 'get', '/api/podcasts/today', user='bob').json['status'] == 'ready'
    assert call(client, 'post', '/api/podcasts/feedback', {'program_id': first, 'kind': 'follow'}, user='eve').status_code == 404
    monkeypatch.setattr(service, 'now', lambda: datetime.fromisoformat('2026-10-12T12:00:00+08:00'))
    assert call(client, 'get', '/api/podcasts/today').json['status'] == 'none'  # Explicit dislike remains respected.


def test_review_quality_duplicate_platforms_and_no_forced_candidate(client):
    empty = call(client, 'get', '/api/podcasts/today').json
    assert empty['status'] == 'none'
    add(client, approved=False)
    add(client, name='不合格', quality_score=0.4, approved=False)
    add(client, name='推广节目', promotion_flag=True, approved=False)
    assert call(client, 'get', '/api/podcasts/today', user='bob').json['status'] == 'none'
    duplicate = call(client, 'post', '/api/podcasts/admin/programs',
                     payload('另一档', episode_url='https://xiaoyuzhoufm.com/episode/收支慢聊'), user='admin')
    assert duplicate.status_code == 409
    bad = call(client, 'post', '/api/podcasts/admin/programs',
               payload('内部链接', canonical_url='https://127.0.0.1/private'), user='admin')
    assert bad.status_code == 400
    program = add(client, name='优质节目')
    assert call(client, 'get', '/api/podcasts/today').json['program']['id'] == program
    assert call(client, 'get', '/api/podcasts/today', user='carol').json['program']['id'] == program
    assert call(client, 'post', f'/api/podcasts/admin/programs/{program}/review',
                {'approved': False}, user='admin').status_code == 200
    assert call(client, 'get', '/api/podcasts/today', user='carol').json['status'] == 'unavailable'


def test_interest_and_timezone_change_recommendation_day(client, monkeypatch):
    add(client, name='预算节目', topic='budget')
    choice = add(client, name='选择节目', topic='choice')
    call(client, 'put', '/api/learning/profile', {'topic': 'choice', 'timezone': 'UTC'})
    monkeypatch.setattr(service, 'now', lambda: datetime.fromisoformat('2026-10-12T00:30:00+08:00'))
    first = call(client, 'get', '/api/podcasts/today').json
    assert first['date'] == '2026-10-11'
    assert first['program']['id'] == choice
    monkeypatch.setattr(service, 'now', lambda: datetime.fromisoformat('2026-10-12T20:00:00+08:00'))
    assert call(client, 'get', '/api/podcasts/today').json['date'] == '2026-10-12'
    # The previous episode is excluded by the new 30-day cooldown.
    assert call(client, 'get', '/api/podcasts/today').json['status'] == 'none'


def test_starter_catalog_populates_empty_db_and_repairs_cached_empty(client):
    empty = call(client, 'get', '/api/podcasts/today').json
    assert empty['status'] == 'none'
    client.application.config['PODCAST_STARTER_CATALOG_ENABLED'] = True
    ready = call(client, 'get', '/api/podcasts/today').json
    assert ready['status'] == 'ready'
    assert ready['program']['episode_url'].startswith('https://www.xiaoyuzhoufm.com/episode/')
    assert call(client, 'get', '/api/podcasts/today').json == ready
    programs = call(client, 'get', '/api/podcasts/admin/programs', user='admin').json['programs']
    assert len(programs) == 8
    assert all(program['status'] == 'approved' for program in programs)


def test_recent_programme_is_deprioritized_when_another_matches(client, monkeypatch):
    first = add(client, name='收支甲')
    second = add(client, name='收支乙')
    picked = call(client, 'get', '/api/podcasts/today').json['program']['id']
    assert picked in (first, second)
    monkeypatch.setattr(service, 'now', lambda: datetime.fromisoformat('2026-10-12T12:00:00+08:00'))
    assert call(client, 'get', '/api/podcasts/today').json['program']['id'] != picked


def test_multiple_episodes_can_share_show_homepage(client):
    first = add(client, name='共同节目', episode_title='第一期',
                episode_url='https://podcasts.example/episode/first')
    second = add(client, name='共同节目', episode_title='第二期',
                 episode_url='https://podcasts.example/episode/second',
                 platform_links=[{'platform': 'xiaoyuzhou', 'url': 'https://xiaoyuzhoufm.com/episode/second'}])
    assert first != second
    result = call(client, 'get', '/api/podcasts/today').json
    assert result['program']['episode_url'] in (
        'https://podcasts.example/episode/first', 'https://podcasts.example/episode/second')


def test_old_starter_pick_is_migrated_to_a_direct_episode(client):
    from app.services import podcast_store
    from app.services.podcast_starter_catalog import FINANCE

    old = {**payload(), 'id': 'legacy-pick', 'canonical_url': FINANCE[2],
           'status': 'approved', 'reviewed_by': 'starter-catalog-2026-10-11',
           'reviewed_at': '2026-10-11T10:00:00+08:00', 'updated_at': '2026-10-11T10:00:00+08:00'}
    for field in ('episode_title', 'episode_url', 'episode_summary', 'episode_published_at'):
        old.pop(field)
    with client.application.app_context(), podcast_store.transaction() as connection:
        podcast_store.save_program(connection, old)
        podcast_store.save_pick(connection, 'alice', '2026-10-11', {
            'date': '2026-10-11', 'status': 'ready', 'program_id': old['id'],
            'created_at': '2026-10-11T10:30:00+08:00'})
    client.application.config['PODCAST_STARTER_CATALOG_ENABLED'] = True
    migrated = call(client, 'get', '/api/podcasts/today').json
    assert migrated['program']['id'] == 'legacy-pick'
    assert migrated['program']['episode_url'].startswith('https://www.xiaoyuzhoufm.com/episode/')
    assert len(call(client, 'get', '/api/podcasts/admin/programs', user='admin').json['programs']) == 8


def test_concurrent_requests_persist_one_pick(client):
    add(client)
    app = client.application

    def get():
        with app.app_context():
            return service.today_for('alice')

    with ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(lambda _: get(), range(5)))
    assert all(result == results[0] for result in results)
    from app.services import podcast_store
    with app.app_context(), podcast_store.transaction() as connection:
        assert connection.execute('SELECT COUNT(*) FROM daily_picks WHERE user_id=?', ('alice',)).fetchone()[0] == 1


def test_rss_sync_reads_metadata_only_and_preserves_last_good_record(client, monkeypatch):
    rss = 'https://feed.example/show.xml'
    program_id = add(client, name='RSS 节目', source_permission='public_rss', rss_url=rss)
    monkeypatch.setattr(service.socket, 'getaddrinfo', lambda *args, **kwargs: [(None, None, None, None, ('8.8.8.8', 443))])

    class Response:
        status_code = 200
        def iter_content(self, size):
            yield (b'<rss><channel><description>Publisher description of budgeting</description>'
                   b'<item><title>Planning books</title><description>Study costs</description>'
                   b'<pubDate>Sat, 10 Oct 2026 12:00:00 +0800</pubDate></item></channel></rss>')
        def close(self):
            pass

    monkeypatch.setattr(service.requests, 'get', lambda *args, **kwargs: Response())
    synced = call(client, 'post', f'/api/podcasts/admin/programs/{program_id}/sync', user='admin')
    assert synced.status_code == 200, synced.json
    assert synced.json['program']['description'] == 'Publisher description of budgeting'
    assert synced.json['program']['source_synced_at']
    assert synced.json['program']['status'] == 'draft'  # Changed publisher description needs review.
    assert call(client, 'post', f'/api/podcasts/admin/programs/{program_id}/review',
                {'approved': True}, user='admin').status_code == 200
    assert call(client, 'get', '/api/podcasts/today').json['program']['id'] == program_id
    monkeypatch.setattr(service.requests, 'get', lambda *args, **kwargs: (_ for _ in ()).throw(service.requests.ConnectionError('offline')))
    failed = call(client, 'post', f'/api/podcasts/admin/programs/{program_id}/sync', user='admin')
    assert failed.status_code == 502
    stored = call(client, 'get', '/api/podcasts/admin/programs', user='admin').json['programs'][0]
    assert stored['description'] == 'Publisher description of budgeting'
    assert stored['source_error']
    monkeypatch.setattr(service, 'now', lambda: datetime.fromisoformat('2026-11-15T12:00:00+08:00'))
    assert call(client, 'get', '/api/podcasts/today', user='bob').json['status'] == 'none'  # Stale sync.


def test_sparse_description_uses_reviewed_topic_and_forbids_xml_entities(client):
    program_id = add(client, name='简短节目', description='短')
    assert call(client, 'get', '/api/podcasts/today').json['program']['id'] == program_id
    with pytest.raises(service.PodcastError):
        service.parse_rss(b'<!DOCTYPE rss [<!ENTITY x "bad">]><rss><channel/></rss>')

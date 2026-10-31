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
    from app.services import finance_context_service, finance_funds_service, learning_store
    monkeypatch.setattr(finance_context_service, 'now', lambda: service.now())
    monkeypatch.setattr(finance_funds_service, 'now', lambda: service.now().astimezone(__import__('datetime').timezone.utc))
    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return service.now().astimezone(tz) if tz else service.now()
    monkeypatch.setattr(learning_store, 'datetime', FixedDatetime)
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


def test_review_quality_and_empty_pick_recovers_when_catalog_is_ready(client):
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


def test_restoring_keeps_the_same_daily_pick_and_appends_history(client):
    import sqlite3
    from app.services import podcast_store as store
    pid = add(client)
    first = call(client, 'get', '/api/podcasts/today').json
    data = {'program_id': pid, 'recommendation_id': first['recommendation_id']}
    assert call(client, 'post', '/api/podcasts/feedback', {**data, 'kind': 'dislike', 'event_id': 'dismiss-1'}).status_code == 200
    dismissed = call(client, 'get', '/api/podcasts/today').json
    assert dismissed['program_id'] == pid and dismissed['program'] is None
    restore = {**data, 'kind': 'undislike', 'event_id': 'restore-1'}
    assert call(client, 'post', '/api/podcasts/feedback', restore, user='bob').status_code == 404
    for _ in range(2):
        assert call(client, 'post', '/api/podcasts/feedback', restore).status_code == 200
    restored = call(client, 'get', '/api/podcasts/today').json
    assert restored['status'] == 'ready' and restored['recommendation_id'] == first['recommendation_id']
    assert restored['program']['id'] == pid
    with client.application.app_context(), store.transaction() as conn:
        rows = conn.execute("SELECT event_type FROM recommendation_events WHERE user_id='alice' ORDER BY rowid").fetchall()
        assert [row['event_type'] for row in rows] == ['served', 'dislike', 'undislike']
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("DELETE FROM recommendation_events WHERE event_type='dislike'")


def test_legacy_event_schema_migrates_without_losing_rows_or_guards(client):
    import sqlite3
    from pathlib import Path
    from app.services import podcast_store as store
    schema = Path(store.__file__).resolve().parent.parent / 'sql' / 'podcast_recommendations.sql'
    legacy = schema.read_text(encoding='utf-8').replace("'dislike','undislike'", "'dislike'")
    with sqlite3.connect(client.application.config['PODCAST_DB_PATH']) as conn:
        conn.executescript(legacy)
        conn.execute("INSERT INTO recommendation_events VALUES(?,?,?,?,?,?,?,?,?,?)", (
            'alice', 'original', 'rec-1', '2026-10-11', 'show-1', 'dislike',
            '2026-10-11T10:00:00+08:00', None, 'legacy', '{"kept":true}'))
        original = conn.execute('SELECT rowid,* FROM recommendation_events').fetchall()
    with client.application.app_context():
        for _ in range(2):
            with store.transaction() as conn:
                assert [tuple(row) for row in conn.execute('SELECT rowid,* FROM recommendation_events')] == original
                assert "'undislike'" in conn.execute("SELECT sql FROM sqlite_master WHERE name='recommendation_events'").fetchone()['sql']
                assert conn.execute("SELECT name FROM sqlite_master WHERE name='recommendation_events_single_served'").fetchone()
                with pytest.raises(sqlite3.IntegrityError):
                    conn.execute("UPDATE recommendation_events SET payload='{}'")
        with store.transaction() as conn:
            record = {'recommendation_id': 'rec-1', 'date': '2026-10-11', 'program_id': 'show-1'}
            store.append_event(conn, 'alice', record, 'restored', 'undislike', '2026-10-11T11:00:00+08:00')
            assert conn.execute('SELECT COUNT(*) FROM recommendation_events').fetchone()[0] == 2
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
    # Try a new adjacent topic before repeating the previous choice episode.
    result = call(client, 'get', '/api/podcasts/today').json
    assert result['status'] == 'ready' and result['program']['id'] != choice
    assert result['selection_tier'] == 'explore'


def test_starter_catalog_recovers_cached_empty_on_same_local_day(client, monkeypatch):
    empty = call(client, 'get', '/api/podcasts/today').json
    assert empty['status'] == 'none'
    client.application.config['PODCAST_STARTER_CATALOG_ENABLED'] = True
    assert call(client, 'get', '/api/podcasts/today').json['status'] == 'ready'
    monkeypatch.setattr(service, 'now', lambda: datetime.fromisoformat('2026-10-12T12:00:00+08:00'))
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


def test_single_episode_repeats_after_a_gap_instead_of_going_empty(client, monkeypatch):
    pid = add(client)
    first = call(client, 'get', '/api/podcasts/today').json
    monkeypatch.setattr(service, 'now', lambda: datetime.fromisoformat('2026-10-16T12:00:00+08:00'))
    result = call(client, 'get', '/api/podcasts/today').json
    assert result['program']['id'] == pid
    assert result['selection_tier'] == 'revisit'
    assert '不代表你已经听过' in result['reason']
    assert result['recommendation_id'] != first['recommendation_id']
    assert call(client, 'get', '/api/podcasts/today').json == result


def test_explores_a_new_topic_when_no_episode_matches(client):
    pid = add(client, topic='risk')
    result = call(client, 'get', '/api/podcasts/today').json
    assert result['program']['id'] == pid and result['selection_tier'] == 'explore'
    assert '拓展' in result['reason']
    assert not result['evidence']


def test_evergreen_fallback_keeps_real_publication_dates_and_feedback_works(client):
    pid = add(client, episode_published_at='2025-01-01', last_episode_at='2025-01-01')
    result = call(client, 'get', '/api/podcasts/today').json
    assert result['program']['id'] == pid and result['selection_tier'] == 'evergreen'
    assert result['program']['episode_published_at'] == '2025-01-01'
    assert call(client, 'post', '/api/podcasts/feedback', {
        'program_id': pid, 'recommendation_id': result['recommendation_id'],
        'kind': 'impression', 'event_id': 'evergreen-impression'}).status_code == 200


def test_fallback_still_respects_dislikes_and_disabled_or_invalid_sources(client, monkeypatch):
    pid = add(client)
    add(client, name='未发布', episode_published_at='2026-12-01', last_episode_at='2026-12-01')
    add(client, name='未审核', approved=False)
    add(client, name='停用来源', source_enabled=False)
    add(client, name='失效链接', link_status='invalid')
    # Persist source metadata directly because editorial payload validation strips these fields.
    from app.services import podcast_store
    with client.application.app_context(), podcast_store.transaction() as conn:
        for program in podcast_store.program_rows(conn):
            if program['name'] == '停用来源':
                program['source_enabled'] = False
            elif program['name'] == '失效链接':
                program['link_status'] = 'invalid'
            podcast_store.save_program(conn, program)
    assert call(client, 'get', '/api/podcasts/today').json['program']['id'] == pid
    call(client, 'post', '/api/podcasts/feedback', {'program_id': pid, 'kind': 'dislike'})
    monkeypatch.setattr(service, 'now', lambda: datetime.fromisoformat('2026-10-12T12:00:00+08:00'))
    assert call(client, 'get', '/api/podcasts/today').json['status'] == 'none'


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

    from app.services import podcast_ingestion
    monkeypatch.setattr(podcast_ingestion, 'public_request', lambda *args, **kwargs:
                        (200, {}, b''.join(Response().iter_content(65536))))
    synced = call(client, 'post', f'/api/podcasts/admin/programs/{program_id}/sync', user='admin')
    assert synced.status_code == 200, synced.json
    assert synced.json['program']['description'] == 'Publisher description of budgeting'
    assert synced.json['program']['source_synced_at']
    assert synced.json['program']['status'] == 'draft'  # Changed publisher description needs review.
    assert call(client, 'post', f'/api/podcasts/admin/programs/{program_id}/review',
                {'approved': True}, user='admin').status_code == 200
    assert call(client, 'get', '/api/podcasts/today').json['program']['id'] == program_id
    monkeypatch.setattr(podcast_ingestion, 'public_request', lambda *args, **kwargs:
                        (_ for _ in ()).throw(service.PodcastError('来源离线', 502)))
    failed = call(client, 'post', f'/api/podcasts/admin/programs/{program_id}/sync', user='admin')
    assert failed.status_code == 502
    stored = call(client, 'get', '/api/podcasts/admin/programs', user='admin').json['programs'][0]
    assert stored['description'] == 'Publisher description of budgeting'
    assert stored['source_error']
    monkeypatch.setattr(service, 'now', lambda: datetime.fromisoformat('2026-11-15T12:00:00+08:00'))
    fallback = call(client, 'get', '/api/podcasts/today', user='bob').json
    assert fallback['program']['id'] == program_id
    assert fallback['selection_tier'] == 'evergreen'  # Last reviewed metadata remains usable.


def test_sparse_description_uses_reviewed_topic_and_forbids_xml_entities(client):
    program_id = add(client, name='简短节目', description='短')
    assert call(client, 'get', '/api/podcasts/today').json['program']['id'] == program_id
    with pytest.raises(service.PodcastError):
        service.parse_rss(b'<!DOCTYPE rss [<!ENTITY x "bad">]><rss><channel/></rss>')

"""Synthetic snapshots and stub inference only; no real accounts or HTTP calls."""
import json
import math
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from threading import Barrier

import pytest
import requests

from test_podcasts import base_client, client, add, call
from app.services import finance_context_service as finance, podcast_ranker as ranker
from app.services import podcast_service as service, podcast_store as store

STAMP = datetime.fromisoformat('2026-10-11T12:00:00+08:00')


def test_snapshot_income_refunds_transfers_future_and_scaling():
    rows = [{'date': '2026-10-10', 'amount': 1000, 'transaction_type': 'income'},
            {'date': '2026-10-10', 'amount': 100, 'transaction_type': 'expense', 'merchant': 'PRIVATE'},
            {'date': '2026-10-11', 'amount': 20, 'transaction_type': 'refund'},
            {'date': '2026-10-10', 'amount': 8000, 'transaction_type': 'transfer'},
            {'date': '2026-10-10', 'amount': 9000, 'transaction_type': 'income', 'receipt_kind': 'internal_transfer'},
            {'date': '2026-10-20', 'amount': 3000, 'transaction_type': 'income'}]
    entries = [{'id': 'profile', 'monthly_income': 2000, 'income_day': 15, 'timezone': 'Asia/Shanghai'},
               {'kind': 'upcoming', 'due_date': '2026-10-12', 'amount': 500, 'handled': False},
               {'kind': 'upcoming', 'due_date': '2026-10-12', 'amount': 900, 'handled': True}]
    goals = [{'target_amount': 2000, 'current_amount': 1200, 'deadline': '2026-10-20'}]
    result = finance.from_records(rows, goals, entries, STAMP)
    f = result['features']
    assert f['actual_income_month'] == 1000 and f['expected_income_30d'] == 2000
    assert f['net_expense_month'] == 80 and f['recorded_surplus_month'] == 920
    assert f['goal_remaining'] == 800 and f['upcoming_7d'] == 500
    assert result['missing_mask']['confirmed_balance'] == 1
    assert result['scaled_features']['confirmed_balance'] == 0
    assert result['scaled_features']['actual_income_month'] == pytest.approx(math.log1p(1000))
    assert 'PRIVATE' not in json.dumps(result)


@pytest.mark.parametrize('amount', [True, 'NaN', 'Infinity', -1, 'bad'])
def test_invalid_money_is_missing_not_zero(amount):
    snapshot = finance.from_records([{'date': '2026-10-10', 'amount': amount}], [], [], STAMP)
    assert snapshot['features']['net_expense_month'] is None
    assert snapshot['missing_mask']['net_expense_month'] == 1


def test_empty_and_truncated_records_are_not_complete_cashflow():
    assert finance.from_records([], [], [], STAMP)['missing_mask']['actual_income_month'] == 1
    snapshot = finance.from_records([{'date': '2026-10-10', 'amount': 100}], [], [], STAMP,
                                    transactions_complete=False)
    assert snapshot['features']['net_expense_month'] is None
    assert snapshot['coverage']['transactions_complete'] is False


def test_same_day_future_timestamp_is_not_actual_income():
    snapshot = finance.from_records([
        {'date': '2026-10-11T08:00:00+08:00', 'amount': 100, 'transaction_type': 'income'},
        {'date': '2026-10-11T14:00:00+08:00', 'amount': 900, 'transaction_type': 'income'},
    ], [], [], STAMP)
    assert snapshot['features']['actual_income_month'] == 100


def test_failed_sources_do_not_claim_zero_cashflow_or_goals(client, monkeypatch):
    monkeypatch.setattr(finance.user_data_service, 'get_user_data', lambda *a, **k: ([], 'offline'))
    monkeypatch.setattr(finance.learning_store, 'read_entries', lambda uid: (_ for _ in ()).throw(RuntimeError('offline')))
    with client.application.app_context():
        snapshot = finance.build_snapshot('alice')
    for key in ('actual_income_month', 'goal_remaining', 'upcoming_30d', 'confirmed_balance'):
        assert snapshot['missing_mask'][key] == 1


def test_snapshot_reads_manual_and_committed_import_ledger(client, monkeypatch):
    from datetime import timezone
    monkeypatch.setattr(finance, 'now', lambda: datetime.now(timezone.utc))
    assert call(client, 'put', '/api/learning/profile', {'monthly_income': 2500, 'income_day': 15}).status_code == 200
    assert call(client, 'post', '/api/decision/transactions', {
        'amount': 20, 'category': '学习', 'date': '2026-10-10'}).status_code in (200, 201)
    with client.application.app_context():
        finance.learning_store.write_entry('alice', 'import:synthetic', {
            'kind': 'import_batch', 'status': 'committed', 'source': 'standard',
            'rows': [
                {'row_id': 1, 'date': '2026-10-10', 'amount': '1000', 'transaction_type': 'income',
                 'receipt_kind': 'other_income', 'source_transaction_id': 'I1'},
                {'row_id': 2, 'date': '2026-10-10', 'amount': '5000', 'transaction_type': 'transfer',
                 'receipt_kind': 'internal_transfer', 'source_transaction_id': 'T1'},
                {'row_id': 3, 'date': '2026-10-10', 'amount': '200', 'transaction_type': 'expense',
                 'category': '房租', 'source_transaction_id': 'P1'},
                {'row_id': 4, 'date': '2026-10-10', 'amount': '50', 'transaction_type': 'refund',
                 'related_source': 'standard', 'related_source_id': 'P1', 'source_transaction_id': 'R1'},
            ]})
        snapshot = finance.build_snapshot('alice')
        other = finance.build_snapshot('bob')
    assert snapshot['features']['actual_income_month'] == 1000
    assert snapshot['features']['expected_income_30d'] == 2500
    assert snapshot['features']['net_expense_month'] == 170
    assert snapshot['category_net_30d']['房租'] == 150
    assert other['missing_mask']['actual_income_month'] == 1


def test_legacy_database_migration_does_not_invent_historical_snapshot(client):
    pid = add(client)
    app = client.application
    with app.app_context(), store.transaction() as conn:
        program = store.program(conn, pid)
    path = Path(app.config['PODCAST_DB_PATH']).with_name('legacy.db')
    old = {'date': '2026-10-11', 'status': 'ready', 'program_id': pid,
           'created_at': '2026-10-11T10:00:00+08:00', 'reason': '原推荐理由'}
    with sqlite3.connect(path) as conn:
        conn.execute('CREATE TABLE programs (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)')
        conn.execute('CREATE TABLE daily_picks (user_id TEXT NOT NULL, local_date TEXT NOT NULL, program_id TEXT, '
                     'payload TEXT NOT NULL, PRIMARY KEY(user_id,local_date))')
        conn.execute('INSERT INTO programs VALUES(?,?,?)', (pid, json.dumps(program), program['updated_at']))
        conn.execute('INSERT INTO daily_picks VALUES(?,?,?,?)', ('alice', old['date'], pid, json.dumps(old)))
    app.config['PODCAST_DB_PATH'] = str(path)
    today = call(client, 'get', '/api/podcasts/today').json
    assert today['recommendation_id'] and today['as_of'] == old['created_at']
    assert today['evidence'] == [] and today['reason'] == old['reason']
    assert call(client, 'get', '/api/podcasts/today').json == today
    with app.app_context(), store.transaction() as conn:
        assert conn.execute('SELECT COUNT(*) FROM finance_snapshots').fetchone()[0] == 0


def test_cooldown_empty_and_helpful_is_scoped_to_recommendation(client, monkeypatch):
    pid = add(client)
    today = call(client, 'get', '/api/podcasts/today').json
    assert call(client, 'post', '/api/podcasts/feedback', {
        'program_id': pid, 'kind': 'helpful', 'recommendation_id': today['recommendation_id']}).status_code == 200
    monkeypatch.setattr(service, 'now', lambda: datetime.fromisoformat('2026-10-12T12:00:00+08:00'))
    assert call(client, 'get', '/api/podcasts/today').json['status'] == 'none'
    monkeypatch.setattr(service, 'now', lambda: datetime.fromisoformat('2026-11-12T12:00:00+08:00'))
    later = call(client, 'get', '/api/podcasts/today').json
    assert later['program']['id'] == pid and later['recommendation_id'] != today['recommendation_id']
    assert later['helpful'] is False


def test_events_snapshot_ownership_and_idempotency(client):
    pid = add(client)
    today = call(client, 'get', '/api/podcasts/today').json
    rid = today['recommendation_id']
    body = {'program_id': pid, 'recommendation_id': rid, 'kind': 'impression', 'event_id': 'visible-1'}
    assert call(client, 'post', '/api/podcasts/events', body).status_code == 200
    assert call(client, 'post', '/api/podcasts/events', body).status_code == 200
    duplicate = call(client, 'post', '/api/podcasts/events', {**body, 'event_id': 'visible-2'})
    assert duplicate.json['event']['event_id'] == 'visible-2'
    assert call(client, 'post', '/api/podcasts/events', body, user='bob').status_code == 404
    positive = {**body, 'kind': 'helpful', 'event_id': 'helpful-1'}
    assert call(client, 'post', '/api/podcasts/feedback', positive).status_code == 200
    assert call(client, 'post', '/api/podcasts/feedback', {**positive, 'value': False, 'event_id': 'helpful-2'}).status_code == 200
    # A retried previous event cannot revert the latest feedback state.
    assert call(client, 'post', '/api/podcasts/feedback', positive).status_code == 200
    assert call(client, 'get', '/api/podcasts/today').json['helpful'] is False
    assert call(client, 'post', '/api/podcasts/feedback', {**positive, 'kind': 'dislike'}).status_code == 409
    with client.application.app_context(), store.transaction() as conn:
        rows = conn.execute('SELECT * FROM recommendation_events WHERE user_id=?', ('alice',)).fetchall()
        assert sorted(r['event_type'] for r in rows) == ['helpful_no', 'helpful_yes', 'impression', 'impression', 'served']
        snapshot = conn.execute('SELECT payload FROM finance_snapshots WHERE snapshot_id=?', (rows[0]['snapshot_id'],)).fetchone()
        assert json.loads(snapshot[0])['as_of'] == today['as_of']
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("UPDATE recommendation_events SET event_type='click'")


class Response:
    status_code = 200
    def __init__(self, data):
        self.data = data
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False
    def iter_content(self, size):
        yield json.dumps(self.data).encode()


def ready_finance():
    from app.services.firestore_service import _dev_db
    _dev_db['users'].setdefault('alice', {})['transactions'] = [
        {'id': 'synthetic-cashflow', 'date': '2026-10-10', 'amount': 10, 'category': '学习'}]


def test_hstu_inference_releases_lock_and_applies_scores(client, monkeypatch):
    ready_finance()
    first, second = add(client, name='预算甲'), add(client, name='预算乙')
    app = client.application
    app.config.update(PODCAST_RANKER_MODE='hstu', PODCAST_HSTU_URL='http://localhost:9090/rank')
    def predict(url, **kwargs):
        with sqlite3.connect(app.config['PODCAST_DB_PATH'], timeout=0.1) as conn:
            conn.execute('BEGIN IMMEDIATE')  # Fails if the caller holds a writer lock.
            conn.rollback()
        assert 'user_id' not in kwargs['json']
        assert kwargs['allow_redirects'] is False
        return Response({'model_version': 'test-hstu', 'scores': [
            {'program_id': first, 'score': 0}, {'program_id': second, 'score': 10}]})
    monkeypatch.setattr(ranker.requests, 'post', predict)
    result = call(client, 'get', '/api/podcasts/today').json
    assert result['program']['id'] == second
    with app.app_context(), store.transaction() as conn:
        assert store.daily_pick(conn, 'alice', result['date'])['ranking']['used'] == 'hstu'


@pytest.mark.parametrize('mode', ['baseline', 'shadow', 'hstu'])
def test_modes_and_timeout_fallback(client, monkeypatch, mode):
    ready_finance()
    pid = add(client)
    app = client.application
    app.config.update(PODCAST_RANKER_MODE=mode, PODCAST_HSTU_URL='http://localhost:9090/rank')
    called = []
    def timeout(*args, **kwargs):
        called.append(True)
        raise requests.Timeout()
    monkeypatch.setattr(ranker.requests, 'post', timeout)
    result = call(client, 'get', '/api/podcasts/today').json
    assert result['program']['id'] == pid
    assert bool(called) == (mode != 'baseline')
    with app.app_context(), store.transaction() as conn:
        ranking = store.daily_pick(conn, 'alice', result['date'])['ranking']
        assert ranking['used'] == 'baseline'
        assert ranking['fallback'] == (mode != 'baseline')


def test_shadow_preserves_baseline_and_stores_comparison(client, monkeypatch):
    ready_finance()
    pid = add(client)
    client.application.config.update(PODCAST_RANKER_MODE='shadow', PODCAST_HSTU_URL='http://localhost/rank')
    monkeypatch.setattr(ranker.requests, 'post', lambda *a, **k: Response({
        'model_version': 'shadow-1', 'scores': [{'program_id': pid, 'score': 900}]}))
    result = call(client, 'get', '/api/podcasts/today').json
    with client.application.app_context(), store.transaction() as conn:
        ranking = store.daily_pick(conn, 'alice', result['date'])['ranking']
        assert ranking['used'] == 'baseline'
        assert ranking['shadow']['model_version'] == 'shadow-1'


@pytest.mark.parametrize('scores', [[], [{'program_id': 'invented', 'score': 1}],
                                  [{'program_id': 'a', 'score': float('nan')}],
                                  [{'program_id': 'a', 'score': True}]])
def test_invalid_inference_response_falls_back(client, monkeypatch, scores):
    client.application.config.update(PODCAST_RANKER_MODE='hstu', PODCAST_HSTU_URL='http://localhost/rank')
    monkeypatch.setattr(ranker.requests, 'post', lambda *a, **k: Response({'model_version': 'hstu', 'scores': scores}))
    with client.application.app_context():
        snapshot = finance.from_records([{'date': '2026-10-10', 'amount': 10}], [], [], STAMP)
        result = ranker.rank([{'program': {'id': 'a', 'topics': ['budget'], 'episode_title': '预算', 'episode_summary': '内容'}, 'score': 0.5}], snapshot, [])
    assert result['scores'] == {'a': 0.5} and result['fallback'] is True


def test_concurrent_inference_commits_one_snapshot_and_served_event(client, monkeypatch):
    add(client)
    barrier = Barrier(4)
    def rank(candidates, snapshot, history):
        barrier.wait(timeout=10)
        return {'scores': {c['program']['id']: c['score'] for c in candidates}, 'model_version': 'barrier'}
    monkeypatch.setattr(ranker, 'rank', rank)
    app = client.application
    def today(_):
        with app.app_context():
            return service.today_for('alice')
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(today, range(4)))
    assert all(r == results[0] for r in results)
    with app.app_context(), store.transaction() as conn:
        for table in ('daily_picks', 'finance_snapshots', 'recommendation_events'):
            assert conn.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0] == 1


def test_withdrawn_candidate_is_not_committed_after_inference(client, monkeypatch):
    pid = add(client)
    def withdraw(candidates, snapshot, history):
        with store.transaction() as conn:
            record = store.program(conn, pid)
            record['status'] = 'draft'
            store.save_program(conn, record)
        return {'scores': {pid: 1}, 'model_version': 'withdraw-test'}
    monkeypatch.setattr(ranker, 'rank', withdraw)
    result = call(client, 'get', '/api/podcasts/today').json
    assert result['status'] == 'none' and result['program'] is None


def test_new_user_and_source_errors_skip_external_inference_and_report_reason(client, monkeypatch):
    add(client)
    client.application.config.update(PODCAST_RANKER_MODE='hstu', PODCAST_HSTU_URL='http://localhost/rank')
    monkeypatch.setattr(ranker.requests, 'post', lambda *a, **k: pytest.fail('must not call HSTU'))
    result = call(client, 'get', '/api/podcasts/today').json
    assert result['fallback'] is True and result['fallback_reason'] == 'insufficient_finance_data'
    with client.application.app_context():
        snapshot = finance.from_records([], [], [], STAMP, transactions_complete=False)
        ranked = ranker.rank([{'program': {'id': 'x'}, 'score': 1}], snapshot, [])
    assert ranked['fallback_reason'] == 'finance_source_unavailable'


def test_invalid_link_and_unbound_helpful_are_rejected(client):
    add(client, link_status='invalid')
    assert call(client, 'get', '/api/podcasts/today').json['status'] == 'none'
    assert call(client, 'post', '/api/podcasts/feedback', {'program_id': 'x', 'kind': 'helpful'}).status_code == 400

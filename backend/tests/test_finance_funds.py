"""Synthetic internal transfers, opening carryover and immutable as-of snapshots."""
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pytest
from test_learning_flow import client as base_client, call
from app.services import finance_funds_service as funds, finance_context_service as finance, learning_store, podcast_store
from app.services.user_data_service import user_data_service
from app.services.firestore_service import _dev_db


@pytest.fixture
def clock(monkeypatch):
    clock = [datetime.fromisoformat('2026-10-13T12:00:00+08:00')]
    monkeypatch.setattr(funds, 'now', lambda: clock[0].astimezone(timezone.utc))
    monkeypatch.setattr(finance, 'now', lambda: clock[0])
    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return clock[0].astimezone(tz) if tz else clock[0]
    monkeypatch.setattr(learning_store, 'datetime', FixedDatetime)
    return clock


@pytest.fixture
def client(base_client, clock, tmp_path):
    base_client.application.config['PODCAST_DB_PATH'] = str(tmp_path / 'funds.db')
    return base_client


def opening(client, amount=1000, month='2026-10', event='opening'):
    response = call(client, 'post', '/api/decision/funds/carryover', {'month': month, 'amount': amount, 'event_id': event})
    assert response.status_code == 200, response.json
    return response.json


def goal(client, saved=200):
    response = call(client, 'post', '/api/dashboard/goals', {
        'title': '合成储蓄目标', 'target_amount': 1000, 'current_amount': saved, 'deadline': '2026-11-20'})
    assert response.status_code == 201, response.json
    return response.json['data']['id']


def context(client):
    response = call(client, 'get', '/api/decision/funds')
    assert response.status_code == 200, response.json
    return response.json['data']


def test_transfer_release_and_deletion_never_become_income_or_expense(client):
    opening(client)
    gid = goal(client)
    c = context(client)
    assert c['available_remaining_month'] == 800 and c['savings_locked_total'] == 200
    # Absolute-amount retry is idempotent for funds, even without a new-API event ID.
    for _ in range(2):
        assert call(client, 'put', f'/api/dashboard/goals/{gid}', {'current_amount': 300}).status_code == 200
    assert context(client)['available_remaining_month'] == 700
    ledger = call(client, 'get', '/api/decision/transactions').json['data']
    assert ledger['monthly_cashflow']['spent'] == 0 and ledger['monthly_cashflow']['income'] == 0
    assert call(client, 'delete', f'/api/dashboard/goals/{gid}').status_code == 200
    c = context(client)
    assert c['available_remaining_month'] == 1000 and c['savings_locked_total'] == 0
    with client.application.app_context(), podcast_store.transaction() as conn:
        deltas = [r[0] for r in conn.execute('SELECT locked_delta_cents FROM savings_transfers ORDER BY rowid')]
        assert deltas == [20000, 10000, -30000]
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute('DELETE FROM savings_transfers')


def test_month_rollover_carries_disposable_funds_without_subtracting_locked_total_again(client, clock):
    opening(client, 1000, '2026-09')
    clock[0] = datetime.fromisoformat('2026-09-30T12:00:00+08:00')
    gid = goal(client, 200)
    clock[0] = datetime.fromisoformat('2026-10-13T12:00:00+08:00')
    # Opening was confirmed in October: choose an as-of after that confirmation.
    _dev_db['users'].setdefault('alice', {})['transactions'] = [
        {'date': '2026-09-30', 'amount': 100, 'transaction_type': 'income'},
        {'date': '2026-09-30', 'amount': 50, 'transaction_type': 'expense'},
        {'date': '2026-10-10', 'amount': 20, 'transaction_type': 'expense'}]
    c = context(client)
    assert c['carryover_month'] == 850 and c['available_remaining_month'] == 830
    assert c['savings_locked_total'] == 200 and c['savings_net_transfer_month'] == 0
    call(client, 'put', f'/api/dashboard/goals/{gid}', {'status': 'cancelled'})
    assert context(client)['available_remaining_month'] == 1030


def test_unknown_carryover_is_missing_and_actual_income_does_not_use_expected_income(client):
    _dev_db['users'].setdefault('alice', {})['transactions'] = [
        {'date': '2026-10-10', 'amount': 200, 'transaction_type': 'income'},
        {'date': '2026-10-10', 'amount': 10, 'transaction_type': 'expense'},
        {'date': '2026-10-10', 'amount': 9000, 'transaction_type': 'transfer'},
        {'date': '2026-10-13T14:00:00+08:00', 'amount': 10000, 'transaction_type': 'income'}]
    call(client, 'put', '/api/learning/profile', {'monthly_income': 3000, 'income_day': 15})
    estimate = context(client)
    assert estimate['available_remaining_month'] == 190
    assert estimate['available_complete'] is False and estimate['complete'] is False
    with client.application.app_context():
        unconfirmed = finance.build_snapshot('alice')
    assert unconfirmed['features']['available_remaining_month'] is None
    assert unconfirmed['missing_mask']['available_remaining_month'] == 1
    assert unconfirmed['features']['planned_free_now'] is None
    opening(client, 100)
    assert context(client)['available_remaining_month'] == 290
    with client.application.app_context():
        snapshot = finance.build_snapshot('alice')
    assert snapshot['features']['actual_income_month'] == 200
    assert snapshot['features']['expected_income_30d'] == 3000
    assert snapshot['features']['available_remaining_month'] == 290


def test_snapshot_cannot_change_after_later_goal_edits_and_is_account_scoped(client, clock):
    opening(client)
    gid = goal(client)
    with client.application.app_context():
        snapshot = finance.build_snapshot('alice')
        with podcast_store.transaction() as conn:
            podcast_store.save_snapshot(conn, 'alice', snapshot)
    clock[0] += timedelta(hours=1)
    call(client, 'put', f'/api/dashboard/goals/{gid}', {'current_amount': 900})
    with client.application.app_context():
        assert finance.load_snapshot('alice', snapshot['snapshot_id']) == snapshot
        with pytest.raises(ValueError):
            finance.load_snapshot('bob', snapshot['snapshot_id'])
        with pytest.raises(ValueError):
            finance.build_snapshot('alice', snapshot['as_of'] and datetime.fromisoformat(snapshot['as_of']))
        historical = funds.context_at('alice', [], datetime.fromisoformat(snapshot['as_of']), timezone.utc)
    assert snapshot['features']['savings_locked_total'] == 200
    assert historical['savings_locked_total'] == 200
    assert context(client)['savings_locked_total'] == 900


def test_legacy_locked_balances_are_not_new_month_transfers(client):
    _dev_db['users']['alice'] = {'goals': [{'id': 'old', 'title': '旧目标', 'target_amount': 500,
        'current_amount': 200, 'deadline': '2026-11-20', 'status': 'active'}]}
    opening(client)
    c = context(client)
    assert c['savings_locked_total'] == 200
    assert c['available_remaining_month'] == 1000 and c['savings_net_transfer_month'] == 0


def test_carryover_retry_validation_and_user_isolation(client):
    assert opening(client) == opening(client)
    assert call(client, 'post', '/api/decision/funds/carryover', {'month': '2026-10', 'amount': 500, 'event_id': 'opening'}).status_code == 400
    for amount in (True, 'NaN', 'Infinity'):
        assert call(client, 'post', '/api/decision/funds/carryover', {'month': '2026-10', 'amount': amount}).status_code == 400
    assert call(client, 'post', '/api/decision/funds/carryover', {'month': '2026-11', 'amount': 1}).status_code == 400
    other = call(client, 'get', '/api/decision/funds', user='bob').json['data']
    assert other['available_remaining_month'] == 0 and other['available_complete'] is False


def test_concurrent_absolute_goal_updates_create_one_funds_delta(client):
    opening(client)
    gid = goal(client, 0)
    app = client.application
    def reserve(_):
        with app.app_context():
            return user_data_service.update_user_data('alice', 'goals', gid, {'current_amount': 300})
    with ThreadPoolExecutor(max_workers=4) as executor:
        assert all(result[0] for result in executor.map(reserve, range(4)))
    assert context(client)['available_remaining_month'] == 700
    with app.app_context(), podcast_store.transaction() as conn:
        assert conn.execute('SELECT COUNT(*) FROM savings_transfers').fetchone()[0] == 1


def test_freeze_time_is_after_source_reads_and_planner_does_not_lock_twice(client, clock, monkeypatch):
    opening(client)
    goal(client, 200)
    call(client, 'put', '/api/learning/profile', {'monthly_income': 0, 'income_day': 1,
        'essential_monthly': 0, 'emergency_buffer': 0})
    original = funds.context_at
    def delayed(*args, **kwargs):
        result = original(*args, **kwargs)
        clock[0] += timedelta(seconds=1)
        return result
    monkeypatch.setattr(funds, 'context_at', delayed)
    with client.application.app_context():
        snapshot = finance.build_snapshot('alice')
    assert datetime.fromisoformat(snapshot['as_of']) == clock[0]
    assert snapshot['features']['available_remaining_month'] == 800
    assert snapshot['features']['goal_plan_shortfall'] == 0
    assert snapshot['features']['planned_free_now'] == 0  # 800 remaining is allocated once to the target.


def test_future_updates_are_masked_instead_of_rebuilt_as_old_goal_state():
    as_of = datetime.fromisoformat('2026-10-13T12:00:00+08:00')
    snapshot = finance.from_records([{'date': '2026-10-12', 'amount': 10}],
        [{'target_amount': 1000, 'current_amount': 900, 'deadline': '2026-11-20',
          'updated_at': '2026-10-13T13:00:00+08:00'}], [], as_of)
    assert snapshot['missing_mask']['goal_remaining'] == 1
    assert snapshot['missing_mask']['savings_locked_total'] == 1


def test_completed_goal_money_remains_locked_until_explicit_release(client):
    opening(client)
    gid = goal(client, 200)
    call(client, 'put', f'/api/dashboard/goals/{gid}', {'status': 'completed'})
    call(client, 'put', '/api/learning/profile', {'monthly_income': 0, 'income_day': 1,
        'essential_monthly': 0, 'emergency_buffer': 0})
    with client.application.app_context():
        snapshot = finance.build_snapshot('alice')
    assert snapshot['features']['savings_locked_total'] == 200
    assert snapshot['features']['available_remaining_month'] == 800
    assert snapshot['features']['planned_free_now'] == 800

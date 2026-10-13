"""Synthetic manual receipts, legacy expenses and balance reconciliation."""
from datetime import datetime, timedelta
from unittest.mock import MagicMock

import pytest
from test_learning_flow import client as base_client, call
from app.services.checkin_service import BEIJING


@pytest.fixture
def client(base_client, tmp_path):
    base_client.application.config['PODCAST_DB_PATH'] = str(tmp_path / 'manual-funds.db')
    return base_client


def record(client, amount=200, kind='income', **extra):
    return call(client, 'post', '/api/decision/transactions', {
        'amount': amount, 'category': '兼职', 'date': datetime.now(BEIJING).date().isoformat(),
        'transaction_type': kind, **extra})


def test_receipt_is_actual_income_in_ledger_funds_and_snapshot(client):
    from app.services import finance_context_service as finance, user_data_service as uds
    today = datetime.now(BEIJING).date()
    assert call(client, 'post', '/api/decision/funds/carryover', {
        'month': today.isoformat()[:7], 'amount': 1000, 'event_id': 'opening'}).status_code == 200
    call(client, 'put', '/api/learning/profile', {'monthly_income': 5000})
    saved = record(client, items='合成兼职工资', planned='planned', purpose='忽略收入消费意图')
    assert saved.status_code == 201, saved.json
    assert saved.json['data']['receipt_kind'] == 'other_income'
    assert saved.json['data']['planned'] is None and saved.json['data']['purpose'] == ''
    legacy = call(client, 'post', '/api/decision/transactions', {
        'amount': 50, 'category': '餐饮', 'date': today.isoformat()})
    assert legacy.status_code == 201
    assert legacy.json['data']['transaction_type'] == 'expense'
    ledger = call(client, 'get', '/api/decision/transactions').json['data']
    assert ledger['monthly_cashflow']['income'] == 200
    assert ledger['monthly_cashflow']['spent'] == 50
    assert ledger['funds']['available_remaining_month'] == 1150
    assert ledger['funds']['savings_locked_total'] == 0
    with client.application.app_context():
        snap = finance.build_snapshot('alice')['features']
        assert snap['actual_income_month'] == 200
        assert snap['expected_monthly_income'] == 5000
        purchases = uds.user_data_service.manual_purchase_rows('alice')
        assert [p['id'] for p in purchases] == [legacy.json['data']['id']]
    other = call(client, 'get', '/api/decision/transactions', user='bob').json['data']
    assert other['transactions'] == [] and other['monthly_cashflow']['income'] == 0
    report = call(client, 'get', '/api/decision/report').json['data']
    assert report['basis']['record_count'] == 1
    receipt_id = saved.json['data']['id']
    assert call(client, 'delete', f'/api/decision/transactions/{receipt_id}', user='bob').status_code == 404
    assert call(client, 'delete', f'/api/decision/transactions/{receipt_id}').status_code == 200
    assert call(client, 'get', '/api/decision/transactions').json['data']['monthly_cashflow']['income'] == 0


@pytest.mark.parametrize('kind', ['red_packet', 'external_transfer', 'other_income'])
def test_income_breakdown(client, kind):
    assert record(client, receipt_kind=kind).status_code == 201
    summary = call(client, 'get', '/api/decision/transactions').json['data']['monthly_cashflow']
    assert summary['income_breakdown'][kind] == 200
    assert summary['spent'] == 0 and summary['category_breakdown'] == []


def test_legacy_optional_null_text_is_accepted(client):
    response = record(client, kind='expense', merchant=None, items=None, note=None)
    assert response.status_code == 201
    assert response.json['data']['merchant'] == response.json['data']['items'] == response.json['data']['note'] == ''


@pytest.mark.parametrize('extra', [
    {'amount': True}, {'amount': 0}, {'amount': -1}, {'amount': 'NaN'},
    {'amount': 'Infinity'}, {'amount': 100000001}, {'category': []},
    {'merchant': []}, {'transaction_type': 'transfer'}, {'transaction_type': 'refund'},
    {'receipt_kind': 'internal_transfer'}, {'receipt_kind': 'unknown'},
    {'date': (datetime.now(BEIJING).date() + timedelta(days=1)).isoformat()},
])
def test_invalid_manual_income_rejected_without_writing(client, extra):
    assert record(client, **extra).status_code == 400
    assert call(client, 'get', '/api/decision/transactions').json['data']['transactions'] == []


def test_income_updates_balance_once_and_reconfirmation_anchors_existing_income(client):
    profile = {'current_balance': 1000, 'essential_monthly': 0,
               'emergency_buffer': 100, 'monthly_income': 5000}
    assert call(client, 'put', '/api/learning/profile', profile).status_code == 200
    assert record(client).status_code == 201
    value = call(client, 'get', '/api/learning/profile').json['profile']
    assert value['estimated_balance'] == 1200
    assert call(client, 'get', '/api/decision/goal-plan').json['plan']['balance'] == 1200
    assert call(client, 'put', '/api/learning/profile', {'current_balance': 1200}).json['profile']['estimated_balance'] == 1200
    # Updating a preference keeps the receipt anchor.
    assert call(client, 'put', '/api/learning/profile', {'topic': 'risk'}).json['profile']['estimated_balance'] == 1200
    assert record(client, 50).status_code == 201
    assert call(client, 'get', '/api/learning/profile').json['profile']['estimated_balance'] == 1250


def test_legacy_balance_with_unanchored_income_requires_confirmation(client):
    from app.services import learning_store
    with client.application.app_context():
        learning_store.write_entry('alice', 'profile', {
            'kind': 'profile', 'current_balance': 1000, 'balance_recorded_total': 0,
            'essential_monthly': 0, 'emergency_buffer': 0,
            'balance_confirmed_on': datetime.now(BEIJING).date().isoformat()})
    assert record(client).status_code == 201
    assert call(client, 'get', '/api/learning/profile').json['profile']['estimated_balance'] is None
    result = call(client, 'get', '/api/decision/goal-plan').json
    assert result['stale'] and result['result'] is None
    assert '重新确认' in result['message']
    assert call(client, 'put', '/api/learning/profile', {'current_balance': 1200}).json['profile']['estimated_balance'] == 1200


def test_mysql_income_round_trip_summary_and_refund_candidates(monkeypatch):
    from app.services import bill_import, user_data_service as uds
    today = datetime.now(BEIJING).date()
    row = {'id': 'receipt', 'spent_at': today, 'amount': 200, 'category': '红包',
           'transaction_type': 'income', 'receipt_kind': 'red_packet', 'merchant': '',
           'items': '', 'note': '', 'hour': None, 'regret': None, 'timestamp': datetime.now(BEIJING)}
    writes = []
    queries = []
    monkeypatch.setattr(uds, 'is_mysql_mode', lambda: True)
    monkeypatch.setattr(uds, 'ensure_mysql_user_exists', lambda *args: None)
    monkeypatch.setattr(bill_import, 'active_rows', lambda uid: [])
    monkeypatch.setattr(uds.MySQLHelper, 'execute_update', lambda sql, params: writes.append((sql, params)))
    def query(sql, params):
        queries.append(sql)
        return [row] if params[0] == 'alice' else []
    monkeypatch.setattr(uds.MySQLHelper, 'execute_query', query)
    service = uds.UserDataService()
    ok, error = service.save_user_data('alice', 'transactions', {
        'amount': 200, 'category': '红包', 'date': today.isoformat(),
        'transaction_type': 'income', 'receipt_kind': 'red_packet'})
    assert ok, error
    sql, params = writes[0]
    assert 'transaction_type, receipt_kind' in sql and params[-2:] == ('income', 'red_packet')
    rows, error = service.get_user_data('alice', 'transactions', limit=50)
    assert not error and rows[0]['transaction_type'] == 'income' and rows[0]['receipt_kind'] == 'red_packet'
    summary, error = service.get_monthly_cashflow('alice', today)
    assert not error and summary['income'] == 200 and summary['spent'] == 0
    assert any('category, transaction_type, receipt_kind FROM' in sql for sql in queries)
    assert service.manual_purchase_rows('alice') == []


def test_mysql_column_migration_is_idempotent_and_preserves_legacy_expenses(monkeypatch):
    from app.utils.db_mysql import MySQLHelper
    columns = {'planned', 'purpose', 'items'}
    updates = []
    monkeypatch.setattr(MySQLHelper, 'get_connection', lambda **kwargs: MagicMock())
    def query(sql):
        if sql == 'SHOW TABLES;':
            return [{'table': 'users'}, {'table': 'assessments'}, {'table': 'transactions'}]
        if sql.startswith('SHOW COLUMNS'):
            return [{'Field': sql.split("'")[1]}] if sql.split("'")[1] in columns else []
        return [{'table': 'transactions'}]
    def update(sql):
        updates.append(sql)
        if sql.startswith('ALTER TABLE transactions ADD COLUMN '):
            columns.add(sql.split()[5])
    monkeypatch.setattr(MySQLHelper, 'execute_query', query)
    monkeypatch.setattr(MySQLHelper, 'execute_update', update)
    assert MySQLHelper.init_database()
    assert MySQLHelper.init_database()
    alters = [sql for sql in updates if sql.startswith('ALTER')]
    assert len(alters) == 2
    assert any("transaction_type VARCHAR(20) NOT NULL DEFAULT 'expense'" in sql for sql in alters)

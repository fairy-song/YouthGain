"""The monthly amount and chart data must come from one complete ledger window."""
from datetime import datetime, timedelta

from test_learning_flow import client, call  # isolated in-memory app fixture


def test_monthly_categories_ignore_last_fifty_limit_previous_month_and_future(client):
    from app.services.checkin_service import BEIJING
    from app.services.firestore_service import _dev_db

    today = datetime.now(BEIJING).date()
    last_month = today.replace(day=1) - timedelta(days=1)
    rows = [{'id': f'm-{index}', 'date': today.isoformat(), 'amount': 1,
             'category': '餐饮', 'timestamp': f'{today}T10:00:00+08:00'}
            for index in range(60)]
    rows += [{'id': 'old', 'date': last_month.isoformat(), 'amount': 100, 'category': '购物'},
             {'id': 'future', 'date': (today + timedelta(days=1)).isoformat(),
              'amount': 500, 'category': '娱乐'}]
    _dev_db['users']['alice'] = {'transactions': rows}

    ledger = call(client, 'get', '/api/decision/transactions?limit=50').json['data']
    cashflow = ledger['monthly_cashflow']
    assert len(ledger['transactions']) == 50
    assert cashflow['spent'] == ledger['monthly_budget']['spent'] == 60
    assert cashflow['category_breakdown'] == [
        {'category': '餐饮', 'gross_expense': 60, 'refunds': 0, 'net': 60}]
    assert sum(part['net'] for part in cashflow['category_breakdown']) == cashflow['spent']
    assert cashflow['daily_spending'][-1] == {'date': today.isoformat(), 'spent': 60}
    assert call(client, 'get', '/api/decision/transactions?limit=50', user='bob').json['data'][
        'monthly_cashflow']['spent'] == 0


def test_mysql_recent_transactions_include_imports_but_assessments_do_not(monkeypatch):
    from app.services import bill_import, user_data_service as uds
    from app.services.checkin_service import BEIJING

    today = datetime.now(BEIJING).date()
    imported = {'id': 'import-1', 'source': 'wechat', 'source_transaction_id': 'W-1',
                'transaction_type': 'expense', 'date': today.isoformat(),
                'amount': '10.00', 'category': '学习'}
    manual = {'id': 1, 'spent_at': today - timedelta(days=1), 'amount': 5,
              'category': '餐饮', 'merchant': '', 'items': '', 'note': '',
              'hour': None, 'regret': None, 'planned': None, 'purpose': '',
              'timestamp': datetime.now(BEIJING)}
    monkeypatch.setattr(uds, 'is_mysql_mode', lambda: True)
    monkeypatch.setattr(uds, 'ensure_mysql_user_exists', lambda *args: None)
    monkeypatch.setattr(bill_import, 'active_rows', lambda uid: [imported] if uid == 'alice' else [])
    monkeypatch.setattr(uds.MySQLHelper, 'execute_query',
                        lambda sql, args: [manual] if 'FROM transactions' in sql else [])
    service = uds.UserDataService()

    recent, error = service.get_user_data('alice', 'transactions', limit=1)
    assert error is None
    assert [row['id'] for row in recent] == ['import-1']
    assessments, error = service.get_user_data('alice', 'assessments', limit=1)
    assert error is None
    assert assessments == []
    cashflow, error = service.get_monthly_cashflow('alice', today)
    assert error is None
    assert cashflow['spent'] == (15 if today.day > 1 else 10)
    assert sum(part['net'] for part in cashflow['category_breakdown']) == cashflow['spent']


def test_firestore_recent_transactions_sort_by_transaction_date_before_limit(monkeypatch):
    from app.services import bill_import, user_data_service as uds

    class Doc:
        def __init__(self, data):
            self.data = data

        def to_dict(self):
            return self.data

    class Collection:
        def stream(self):
            return [Doc({'id': 'old', 'date': '2026-09-30', 'timestamp': '2026-10-12',
                         'amount': 5, 'category': '餐饮'}),
                    Doc({'id': 'new', 'date': '2026-10-12', 'timestamp': '2026-09-01',
                         'amount': 7, 'category': '学习'})]

        def order_by(self, *args, **kwargs):
            raise AssertionError('交易列表不能先按写入时间截取')

    class DB:
        def collection(self, path):
            return Collection()

    monkeypatch.setattr(uds, 'is_mysql_mode', lambda: False)
    monkeypatch.setattr(uds, 'is_dev_mode', lambda: False)
    monkeypatch.setattr(uds.UserDataService, 'db', property(lambda self: DB()))
    monkeypatch.setattr(bill_import, 'active_rows', lambda uid: [])
    recent, error = uds.UserDataService().get_user_data('alice', 'transactions', limit=1)
    assert error is None
    assert [row['id'] for row in recent] == ['new']

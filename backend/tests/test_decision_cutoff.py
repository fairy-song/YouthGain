"""Decision inputs use occurred dates; all rows and accounts here are synthetic."""
from datetime import date, datetime, timedelta

import pytest
from test_learning_flow import client, call
from app.routes import decision_routes
from app.services.coach_evidence import compute_facts

TODAY = date(2026, 11, 19)


def set_day(monkeypatch, day):
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(day.year, day.month, day.day, 12, tzinfo=tz)
    monkeypatch.setattr(decision_routes, 'datetime', Clock)


def expense(day=TODAY, amount=100, **extra):
    return dict(date=day.isoformat(), amount=amount, category='学习',
                source='standard', source_transaction_id='purchase', **extra)


@pytest.fixture
def rows(monkeypatch):
    set_day(monkeypatch, TODAY)
    records = [expense()]
    def load(uid, kind, **kwargs):
        return (list(records) if uid == 'alice' and kind == 'transactions' else [], None)
    monkeypatch.setattr(decision_routes.user_data_service, 'get_user_data', load)
    return records


@pytest.mark.parametrize('method,path,payload', [
    ('get', '/api/decision/report?monthly_income=2000', None),
    ('post', '/api/decision/assess', dict(amount=50, category='学习', monthly_income=2000)),
    ('post', '/api/decision/opportunity-cost', dict(amount=50, monthly_income=2000)),
])
def test_future_expenses_and_refunds_cannot_change_current_decision(client, rows, method, path, payload):
    before = call(client, method, path, payload)
    assert before.status_code == 200, before.json
    rows.extend([
        expense(TODAY + timedelta(days=1), 500),
        expense(date(2026, 12, 1), 700),
        expense(TODAY + timedelta(days=1), 20, transaction_type='refund',
                related_source='standard', related_source_id='purchase'),
    ])
    after = call(client, method, path, payload)
    assert after.status_code == 200, after.json
    assert after.json == before.json


def test_future_only_report_is_empty_and_other_account_remains_isolated(client, rows):
    rows[:] = [expense(TODAY + timedelta(days=1))]
    for uid in ('alice', 'bob'):
        response = call(client, 'get', '/api/decision/report?monthly_income=2000', user=uid)
        assert response.status_code == 200
        assert response.json['data']['has_data'] is False
        assert response.json['data']['transaction_count'] == 0


def test_refund_reduces_original_expense_only_from_its_occurred_date(rows, monkeypatch):
    tomorrow = TODAY + timedelta(days=1)
    rows.append(expense(tomorrow, 20, transaction_type='refund',
                        related_source='standard', related_source_id='purchase'))
    for day, expected in ((TODAY, 100), (tomorrow, 80)):
        set_day(monkeypatch, day)
        transactions, _, skipped = decision_routes._load_engine_inputs('alice')
        assert [t.amount for t in transactions] == [expected]
        assert skipped == 0
        assert compute_facts(transactions, 2000, today=day)['spent_this_month'] == expected


def test_invalid_dates_are_reported_and_receipts_remain_excluded(rows):
    rows.extend([
        {**expense(), 'date': 'invalid'},
        expense(transaction_type='income'),
        expense(transaction_type='transfer'),
        {**expense(amount=20, transaction_type='refund', related_source_id='purchase'), 'date': 'invalid'},
    ])
    transactions, goals, skipped = decision_routes._load_engine_inputs('alice')
    assert [t.amount for t in transactions] == [100]
    assert skipped == 2
    assert goals == []


def test_saved_future_expense_remains_in_ledger_but_outside_current_analysis(client, monkeypatch):
    set_day(monkeypatch, TODAY)
    for day, amount in ((TODAY, 100), (TODAY + timedelta(days=1), 500)):
        saved = call(client, 'post', '/api/decision/transactions',
                     dict(date=day.isoformat(), amount=amount, category='学习'))
        assert saved.status_code == 201, saved.json
    ledger = call(client, 'get', '/api/decision/transactions').json['data']
    assert len(ledger['transactions']) == 2
    assert ledger['monthly_cashflow']['spent'] == 100
    report = call(client, 'get', '/api/decision/report?monthly_income=2000').json['data']
    assert report['transaction_count'] == 1
    assert report['report']['spending']['total'] == 100
    assert report['report']['monthly_surplus'] == 1900


def test_cross_month_refund_example_matches_cashflow_and_purchase_analysis(client, monkeypatch):
    from test_bill_import import HEADER, prepare, commit
    set_day(monkeypatch, TODAY)
    last_month = TODAY.replace(day=1) - timedelta(days=1)
    content = (HEADER + f'{last_month},expense,100,学习,书店,,P,,completed,CNY\n'
               f'{TODAY},refund,20,,书店,,R,P,completed,CNY\n').encode()
    preview = prepare(client, content)
    saved = commit(client, content, preview)
    assert saved.status_code == 201, saved.json
    ledger = call(client, 'get', '/api/decision/transactions').json['data']['monthly_cashflow']
    assert (ledger['spent'], ledger['income'], ledger['remaining']) == (-20, 0, 20)
    report = call(client, 'get', '/api/decision/report?monthly_income=2000').json['data']
    assert report['report']['spending']['total'] == 80
    assert report['basis']['start'] == last_month.isoformat()
    assessment = call(client, 'post', '/api/decision/assess',
                      dict(amount=50, category='学习', monthly_income=2000)).json['data']
    assert assessment['budget']['spent_this_month'] == 0

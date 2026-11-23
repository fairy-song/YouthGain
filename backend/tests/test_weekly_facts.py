from datetime import datetime, timedelta
import pytest
from test_learning_flow import client, call


def records(monkeypatch, rows):
    from app.routes.learning_routes import user_data_service
    monkeypatch.setattr(user_data_service, 'get_user_data', lambda uid, kind, limit: (rows if uid == 'alice' else [], None))


def today():
    from app.services.checkin_service import BEIJING
    return datetime.now(BEIJING).date()


@pytest.mark.parametrize('bad', [{}, {'amount': 'bad'}, {'amount': 'NaN'}, {'amount': True}, {'amount': -1}, {'amount': '100000001'}])
def test_bad_legacy_amount_does_not_hide_valid_spending(client, monkeypatch, bad):
    day = today().isoformat()
    records(monkeypatch, [{'date': day, 'amount': '18.50'}, {'date': day, **bad}])
    response = call(client, 'get', '/api/learning/weekly-facts')
    assert response.status_code == 200
    assert response.json['total'] == 18.5
    assert response.json['count'] == 1
    assert response.json['skipped'] == 1
    assert response.json['complete'] is False


def test_weekly_cents_refunds_dates_and_account_scope(client, monkeypatch):
    day = today()
    records(monkeypatch, [
        {'date': day.isoformat(), 'amount': '0.105'},
        {'date': day.isoformat(), 'amount': '0.105'},
        {'date': day.isoformat(), 'amount': '1.00', 'transaction_type': 'refund'},
        {'date': (day + timedelta(days=1)).isoformat(), 'amount': 99},
        {'date': (day - timedelta(days=7)).isoformat(), 'amount': 99},
        {'date': 'not-a-date', 'amount': 99},
        {'date': day.isoformat(), 'amount': 99, 'transaction_type': 'income'},
    ])
    body = call(client, 'get', '/api/learning/weekly-facts').json
    assert body['gross_expense'] == .22
    assert body['refunds'] == 1
    assert body['total'] == -.78
    assert body['count'] == 3
    assert body['skipped'] == 1
    assert call(client, 'get', '/api/learning/weekly-facts', user='bob').json['count'] == 0


def test_limit_is_disclosed_even_with_valid_rows(client, monkeypatch):
    records(monkeypatch, [{'date': today().isoformat(), 'amount': '.01'}] * 2000)
    body = call(client, 'get', '/api/learning/weekly-facts').json
    assert body['total'] == 20
    assert body['limited'] is True
    assert body['complete'] is False

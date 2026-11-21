from datetime import datetime, timedelta
import pytest
from test_learning_flow import client, call
from app.services.checkin_service import BEIJING


def setup_entry(client):
    today = datetime.now(BEIJING).date().isoformat()
    response = call(client, 'post', '/api/learning/entries/upcoming', dict(title='合成待付', amount=800, due_date=today))
    return response.json['entry']


def details(e, **extra):
    return dict(title=e['title'], amount=500, due_date=e['due_date'], expected_updated_at=e['updated_at'], **extra)


def test_edit_recalculates_reserve_without_changing_transactions(client):
    e = setup_entry(client)
    call(client, 'put', '/api/learning/profile', dict(current_balance=1000, essential_monthly=0, emergency_buffer=0, monthly_income=0))
    path = f"/api/learning/upcoming/{e['id']}/details"
    assert client.put(path, json=details(e)).status_code == 401
    assert call(client, 'put', path, details(e), user='bob').status_code == 404
    assert call(client, 'put', path, details(e)).status_code == 200
    result = call(client, 'get', '/api/decision/goal-plan').json
    assert result['result']['free_now'] == 500
    assert call(client, 'get', '/api/decision/transactions').json['data']['transactions'] == []
    assert call(client, 'put', path, details(e)).status_code == 409


@pytest.mark.parametrize('patch', [dict(amount='NaN'), dict(amount=True), dict(amount='0.004'), dict(amount='100000000.000000001'), dict(due_date='invalid'), dict(title=''), dict(handled=True)])
def test_invalid_edits_preserve_saved_arrangement(client, patch):
    e = setup_entry(client)
    response = call(client, 'put', f"/api/learning/upcoming/{e['id']}/details", {**details(e), **patch})
    assert response.status_code == 400
    current = next(row for row in call(client, 'get', '/api/learning').json['entries'] if row['id'] == e['id'])
    assert current == e


def test_handled_and_stale_items_cannot_be_silently_reopened(client):
    e = setup_entry(client)
    assert call(client, 'put', f"/api/learning/upcoming/{e['id']}", dict(handled=True)).status_code == 200
    assert call(client, 'put', f"/api/learning/upcoming/{e['id']}/details", details(e)).status_code == 409


def test_decimal_edit_and_date_change_preserve_identity_and_created_time(client):
    e = setup_entry(client)
    tomorrow = (datetime.now(BEIJING).date()+timedelta(days=1)).isoformat()
    response = call(client, 'put', f"/api/learning/upcoming/{e['id']}/details", {**details(e), 'amount':'1.005', 'due_date':tomorrow})
    assert response.status_code == 200
    assert response.json['entry']['amount'] == 1.01
    assert response.json['entry']['due_date'] == tomorrow
    assert response.json['entry']['id'] == e['id']
    assert response.json['entry']['created_at'] == e['created_at']
    assert response.json['entry']['handled'] is False

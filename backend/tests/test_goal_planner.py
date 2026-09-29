from datetime import date
import pytest
from app.services.goal_planner import validate_plan, build_plan
from app.services.goal_planner import draft_plan
from test_learning_flow import client, call

TODAY = date(2026, 9, 28)


def test_draft_reuses_profile_and_unhandled_upcoming_without_inventing_balance():
    draft = draft_plan(TODAY, [goal()], {'monthly_income': 2000, 'income_day': 31}, [
        {'kind': 'upcoming', 'due_date': '2026-10-10', 'amount': 100, 'handled': False},
        {'kind': 'upcoming', 'due_date': '2026-10-11', 'amount': 300, 'handled': True}])
    assert draft['balance'] == ''
    assert {'date': '2026-09-30', 'amount': 2000, 'kind': 'income'} in draft['events']
    assert len([e for e in draft['events'] if e['kind'] == 'expense']) == 1
    assert date.fromisoformat(draft['end_date']) > date(2026, 11, 20)


def test_draft_does_not_assume_income_without_arrival_day():
    assert draft_plan(TODAY, [], {'monthly_income': 2000}, [])['events'] == []


def plan(balance=0, events=None, buffer=0):
    return validate_plan({'balance': balance, 'buffer': buffer, 'end_date': '2026-12-01',
                          'events': events or []}, TODAY)


def goal(amount=580, saved=0, deadline='2026-11-20', gid='a'):
    return dict(id=gid, title='音乐节', target_amount=amount, current_amount=saved,
                deadline=deadline, status='active')


def event(day, amount, kind='income'):
    return dict(date=day, amount=amount, kind=kind)


def test_two_arrivals_and_no_future_money_in_current_balance():
    result = build_plan(plan(events=[event('2026-10-01', 500), event('2026-11-01', 500)]), [goal()])
    assert result['free_now'] == 0
    assert result['reserve_now'] == 0
    assert [s['amount'] for s in result['goals'][0]['schedule']] == [290, 290]


def test_essentials_and_buffer_before_goals():
    result = build_plan(plan(1000, [event('2026-10-10', 300, 'expense')], 100), [goal()])
    assert result['reserve_now'] == 580
    assert result['free_now'] == 20


def test_saved_funds_not_deducted_twice():
    result = build_plan(plan(1000), [goal(saved=200)])
    assert result['reserved'] == 200
    assert result['reserve_now'] == 380
    assert result['free_now'] == 420


def test_deadline_income_is_too_late():
    result = build_plan(plan(events=[event('2026-11-20', 1000)]), [goal()])
    assert result['goals'][0]['shortfall'] == 580


def test_shared_capacity_deadline_priority_and_cents():
    result = build_plan(plan(600.01), [goal(gid='b'), goal(deadline='2026-10-01', gid='a')])
    assert result['goals'][0]['shortfall'] == 0
    assert result['goals'][1]['shortfall'] == 559.99
    assert result['reserve_now'] == 600.01
    assert result['free_now'] == 0


def test_early_essential_deficit_not_hidden_by_later_income():
    result = build_plan(plan(100, [event('2026-10-01', 300, 'expense'), event('2026-11-01', 2000)]), [goal()])
    assert result['basic_shortfall'] == 200
    assert result['reserve_now'] == 0
    assert result['goals'][0]['shortfall'] == 580


def test_later_bills_protect_current_cash():
    result = build_plan(plan(1000, [event('2026-10-01', 200), event('2026-11-01', 900, 'expense')]), [goal()])
    assert result['reserve_now'] == 300
    assert result['goals'][0]['shortfall'] == 280


def test_completed_and_cancelled_goals_release_envelopes():
    goals = [{**goal(saved=580), 'status': 'completed'}, {**goal(gid='b'), 'status': 'cancelled'}]
    assert build_plan(plan(420), goals)['free_now'] == 420


@pytest.mark.parametrize('amount', [True, -1, 'nan', 'Infinity', None])
def test_invalid_money(amount):
    with pytest.raises(ValueError):
        plan(amount)


def test_goal_plan_http_persistence_and_isolation(client):
    from datetime import datetime
    from app.services.checkin_service import BEIJING
    today = datetime.now(BEIJING).date().isoformat()
    payload = {'balance': 1000, 'buffer': 100, 'end_date': today, 'events': []}
    assert client.get('/api/decision/goal-plan').status_code == 401
    result = call(client, 'put', '/api/decision/goal-plan', payload)
    assert result.status_code == 200
    assert result.json['result']['free_now'] == 900
    assert call(client, 'get', '/api/decision/goal-plan').json['plan']['balance'] == 1000
    assert call(client, 'get', '/api/decision/goal-plan', user='bob').json['plan'] is None
    assert call(client, 'put', '/api/decision/goal-plan', {**payload, 'balance': -1}).status_code == 400


def test_goal_changes_require_balance_reconfirmation(client, monkeypatch):
    from datetime import datetime
    from app.services.checkin_service import BEIJING
    from app.routes import decision_routes
    today = datetime.now(BEIJING).date().isoformat()
    rows = [{**goal(saved=580, deadline=today)}]
    monkeypatch.setattr(decision_routes.user_data_service, 'get_user_data', lambda *args, **kwargs: (rows, None))
    payload = {'balance': 1000, 'buffer': 0, 'end_date': today, 'events': []}
    assert call(client, 'put', '/api/decision/goal-plan', payload).json['result']['free_now'] == 420
    rows[0]['status'] = 'completed'
    response = call(client, 'get', '/api/decision/goal-plan').json
    assert response['stale'] is True
    assert response['result'] is None
    assert call(client, 'put', '/api/decision/goal-plan', {**payload, 'balance': 420}).json['result']['free_now'] == 420

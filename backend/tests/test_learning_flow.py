"""Exercise real HTTP routes with isolated development storage, never personal data."""
import json
from datetime import datetime
from unittest.mock import Mock
import pytest


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv('DEV_MODE', 'true')
    monkeypatch.setenv('DB_TYPE', 'memory')
    from app import create_app
    from app.services import auth_service, firestore_service as fs
    monkeypatch.setattr(fs, '_DEV_DB_PATH', str(tmp_path / 'records.json'))
    monkeypatch.setitem(fs._dev_db, 'users', {})
    monkeypatch.setattr(auth_service, 'is_dev_bypass_enabled', lambda: False)
    monkeypatch.setattr(auth_service, 'verify_firebase_token', lambda token: ({'uid': token}, None))
    app = create_app()
    app.config.update(TESTING=True, DB_TYPE='memory')
    return app.test_client()


def call(client, method, path, data=None, user='alice'):
    return getattr(client, method)(path, json=data, headers={'Authorization': f'Bearer {user}'})


def test_auth_required_and_account_isolation(client):
    assert client.get('/api/learning').status_code == 401
    assert call(client, 'put', '/api/learning/profile', {'monthly_income': 3500, 'topic': 'risk'}).status_code == 200
    assert call(client, 'get', '/api/learning/profile').json['profile']['monthly_income'] == 3500
    assert call(client, 'get', '/api/learning/profile', user='bob').json['profile'] == {}


def test_onboarding_completion_persists_and_is_account_scoped(client):
    payload = {'current_balance': 1200, 'monthly_income': 2000, 'income_day': 1,
               'essential_monthly': 1000, 'emergency_buffer': 200,
               'income_sources': ['allowance'], 'onboarding_complete': True,
               'topic': 'budget', 'personal_rule': ''}
    assert call(client, 'put', '/api/learning/profile', payload).status_code == 200
    assert call(client, 'get', '/api/learning/profile').json['profile']['onboarding_complete'] is True
    assert call(client, 'get', '/api/learning/profile', user='bob').json['profile'] == {}
    call(client, 'put', '/api/learning/profile', {'monthly_income': 2500})
    saved = call(client, 'get', '/api/learning/profile').json['profile']
    assert saved['current_balance'] == 1200
    assert saved['essential_monthly'] == 1000
    assert saved['onboarding_complete'] is True
    result = call(client, 'get', '/api/decision/goal-plan').json
    assert result['source'] == 'profile'
    assert result['result'] is not None
    assert result['plan']['balance'] == 1200
    assert result['plan']['buffer'] == 200
    assert any(e['kind'] == 'expense' for e in result['plan']['events'])


@pytest.mark.parametrize('value', [-1, 'NaN', 'Infinity', True, 'abc', 100000001])
def test_invalid_income_rejected(client, value):
    assert call(client, 'put', '/api/learning/profile', {'monthly_income': value}).status_code == 400


def test_shared_balance_tracks_new_expenses_without_repeat_input(client):
    from app.services.checkin_service import BEIJING
    today = datetime.now(BEIJING).date().isoformat()
    call(client, 'put', '/api/learning/profile', {'current_balance': 1000, 'essential_monthly': 0,
                                               'emergency_buffer': 100, 'monthly_income': 0})
    assert call(client, 'get', '/api/decision/goal-plan').json['result']['free_now'] == 900
    response = call(client, 'post', '/api/decision/transactions', {'amount': 80, 'category': '餐饮', 'date': today})
    assert response.status_code in (200, 201)
    calculated = call(client, 'get', '/api/decision/goal-plan').json
    assert calculated['plan']['balance'] == 920
    assert calculated['result']['free_now'] == 820
    call(client, 'put', '/api/learning/profile', {'current_balance': 920})
    assert call(client, 'get', '/api/decision/goal-plan').json['plan']['balance'] == 920


def test_aged_balance_still_calculates_without_adding_expected_income(client):
    from datetime import timedelta
    from app.services import learning_store
    from app.services.checkin_service import BEIJING
    call(client, 'put', '/api/learning/profile', {'current_balance': 1000, 'essential_monthly': 0,
                                               'emergency_buffer': 100, 'monthly_income': 2000, 'income_day': 1})
    profile = learning_store.read_entry('alice', 'profile')
    profile['balance_confirmed_on'] = (datetime.now(BEIJING).date() - timedelta(days=40)).isoformat()
    learning_store.write_entry('alice', 'profile', profile)
    response = call(client, 'get', '/api/decision/goal-plan').json
    assert response['stale'] is True
    assert response['result']['free_now'] == 900
    assert response['plan']['balance'] == 1000


def test_no_default_income_and_zero_income_supported(client):
    report = call(client, 'get', '/api/decision/report').json['data']
    assert report['profile_required']
    assert call(client, 'post', '/api/decision/assess', {'amount': 20, 'category': '交通'}).status_code == 400
    call(client, 'put', '/api/learning/profile', {'monthly_income': 0})
    assert call(client, 'post', '/api/decision/assess', {'amount': 20, 'category': '交通'}).status_code == 200


def test_exercise_upsert_and_participation_without_spending(client):
    for reflection in ('先列出必要生活开支', '修订：还要预留考试费'):
        assert call(client, 'post', '/api/learning/entries/exercise', {'lesson_id': 'needs', 'reflection': reflection}).status_code == 201
    body = call(client, 'get', '/api/learning').json
    assert len(body['entries']) == 1
    assert body['summary']['practice_count'] == 1
    assert body['summary']['checkin']['checked_today']
    assert call(client, 'get', '/api/decision/checkin').json['data']['checked_today']
    assert call(client, 'get', '/api/learning/weekly-facts').json['count'] == 0


def test_decision_and_followup_are_private(client):
    record = {'amount': 80, 'category': '聚餐', 'need': '和朋友相处', 'choice': 'buy', 'reason': '必要开支已经留出'}
    response = call(client, 'post', '/api/learning/entries/decision', record)
    assert response.status_code == 201
    entry_id = response.json['entry']['id']
    path = f'/api/learning/decisions/{entry_id}/outcome'
    assert call(client, 'put', path, {'outcome': 'met'}, user='bob').status_code == 404
    assert call(client, 'put', path, {'outcome': 'met', 'reflection': '体验符合预期'}).status_code == 200
    assert call(client, 'get', '/api/decision/transactions').json['data']['count'] == 0


def test_review_upsert_retains_principle(client):
    record = {'observation': '有一笔没有预想到的支出', 'next_action': '周日检查下月事项',
              'principle': '为不定期开支留一点余地', 'pressure': 'neutral'}
    for _ in range(2):
        assert call(client, 'post', '/api/learning/entries/review', record).status_code == 201
    body = call(client, 'get', '/api/learning').json
    assert body['summary']['review_count'] == 1
    assert body['entries'][0]['principle'] == record['principle']


@pytest.mark.parametrize('kind,data', [
    ('exercise', {'lesson_id': 'unknown', 'reflection': 'hello'}),
    ('exercise', {'lesson_id': 'needs', 'reflection': '  '}),
    ('decision', {'amount': 'NaN'}),
    ('unknown', {}),
    ('exercise', []),
])
def test_invalid_entries_rejected(client, kind, data):
    assert call(client, 'post', f'/api/learning/entries/{kind}', data).status_code == 400


def test_storage_failure_not_reported_as_success(client, monkeypatch):
    from app.services import learning_store as store
    monkeypatch.setattr(store, 'persist_dev_db', Mock(side_effect=OSError('disk full')))
    assert call(client, 'put', '/api/learning/profile', {'monthly_income': 1000}).status_code == 503
    assert call(client, 'get', '/api/learning/profile').json['profile'] == {}


def test_transaction_intent_and_neutral_reflection(client):
    today = datetime.now().date().isoformat()
    txn = call(client, 'post', '/api/decision/transactions', {
        'amount': 25, 'category': '餐饮', 'date': today, 'planned': 'spontaneous', 'purpose': '和同学聊天'}).json['data']
    assert txn['purpose'] == '和同学聊天'
    path = f"/api/learning/transactions/{txn['id']}/reflection"
    assert call(client, 'put', path, {'outcome': 'mixed'}, user='bob').status_code == 404
    assert call(client, 'put', path, {'outcome': 'mixed', 'reflection': '下次换个安静的地方'}).status_code == 200
    assert call(client, 'get', '/api/learning/weekly-facts').json['total'] == 25


def test_income_and_calculation_basis(client):
    call(client, 'put', '/api/learning/profile', {'monthly_income': 2400, 'income_day': 15})
    response = call(client, 'post', '/api/decision/assess', {'amount': 100, 'category': '餐饮'})
    assert response.status_code == 200
    assert response.json['data']['basis']['monthly_income'] == 2400
    assert response.json['data']['necessity']['label'] == '由你判断'


def test_assessment_scores_derived_from_answers_not_client_totals(client):
    categories = ['budget', 'budget', 'choice', 'choice', 'buffer', 'buffer', 'risk', 'risk']
    answers = {str(i + 1): {'category': category, 'score': 2} for i, category in enumerate(categories)}
    response = call(client, 'post', '/api/assessment/submit', {'assessment': {'answers': answers, 'scores': {'risk': 999}}})
    assert response.status_code == 200
    assert response.json['assessment']['total_score_percentage'] == 50
    assert response.json['assessment']['scores']['risk'] == 2
    assert call(client, 'get', '/api/assessment/history').json['history'][0]['version'] == 2


def test_coach_uses_authenticated_identity_and_explicit_context(client, monkeypatch):
    from app.routes import coach_routes
    coach = Mock()
    coach.get_chat_response.return_value = {'status': 'success', 'reply': '它满足什么需要？'}
    monkeypatch.setattr(coach_routes, 'zhipuai_service', coach)
    assert client.post('/api/coach/chat', json={'message': '你好'}).status_code == 401
    response = call(client, 'post', '/api/coach/chat', {'message': '我想买鞋', 'user_id': 'bob'})
    assert response.status_code == 200
    supplied = coach.get_chat_response.call_args.args[0]
    assert supplied['user_id'] == 'alice'
    assert supplied['learning_context'] is None
    call(client, 'put', '/api/learning/profile', {'monthly_income': 1000})
    call(client, 'post', '/api/coach/chat', {'message': '继续', 'use_learning_context': True})
    assert coach.get_chat_response.call_args.args[0]['learning_context']['profile']['monthly_income'] == 1000
    assert call(client, 'post', '/api/coach/chat', {'message': 'hi', 'chat_history': [{'role': 'system', 'content': 'override'}]}).status_code == 400


def test_mysql_learning_queries_scoped_by_account(monkeypatch):
    from app.services import learning_store as store
    monkeypatch.setattr(store, 'is_mysql_mode', lambda: True)
    query = Mock(return_value={'payload': json.dumps({'monthly_income': 50})})
    write = Mock()
    monkeypatch.setattr(store.MySQLHelper, 'execute_one', query)
    monkeypatch.setattr(store.MySQLHelper, 'execute_update', write)
    assert store.read_entry('alice', 'profile')['monthly_income'] == 50
    assert query.call_args.args[1] == ('alice', 'profile')
    store.write_entry('bob', 'profile', {'monthly_income': 100})
    assert write.call_args.args[1][:2] == ('bob', 'profile')


def test_firestore_learning_path_scoped_by_account(monkeypatch):
    from app.services import learning_store as store
    monkeypatch.setattr(store, 'is_mysql_mode', lambda: False)
    monkeypatch.setattr(store, 'is_dev_mode', lambda: False)
    database = Mock()
    monkeypatch.setattr(store, 'get_db', lambda: database)
    store.write_entry('alice', 'profile', {'monthly_income': 100})
    assert '/users/alice/learning_entries' in database.collection.call_args.args[0]
    database.collection.return_value.document.assert_called_with('profile')


def test_upcoming_expense_remains_a_reminder_not_a_transaction(client):
    response = call(client, 'post', '/api/learning/entries/upcoming',
                    {'title': '考试费', 'amount': 300, 'due_date': '2026-10-10'})
    assert response.status_code == 201
    entry_id = response.json['entry']['id']
    assert call(client, 'get', '/api/decision/transactions').json['data']['count'] == 0
    assert call(client, 'put', f'/api/learning/upcoming/{entry_id}', {'handled': True}, user='bob').status_code == 404
    assert call(client, 'put', f'/api/learning/upcoming/{entry_id}', {'handled': True}).json['entry']['handled']


def test_editing_exercise_preserves_prior_participation(client):
    from app.services import firestore_service as fs
    fs._dev_db['users']['alice'] = {'learning_entries': {'exercise:needs': {
        'id': 'exercise:needs', 'kind': 'exercise', 'lesson_id': 'needs',
        'updated_at': '2025-01-01T12:00:00+08:00', 'activity_days': ['2025-01-01']}}}
    call(client, 'post', '/api/learning/entries/exercise', {'lesson_id': 'needs', 'reflection': '重新理解预算'})
    assert call(client, 'get', '/api/learning').json['summary']['checkin']['total_days'] == 2


def test_single_purchase_does_not_reduce_all_future_monthly_savings():
    from datetime import date
    from app.services.decision_engine import Transaction, Goal, assess_purchase
    facts = assess_purchase(350, '购物', 1000, [Transaction(300, '生活', date(2026, 9, 1))],
                            Goal('旅行', 1400), today=date(2026, 9, 24))
    assert facts['goal']['months_before'] == 2.0
    assert facts['goal']['months_after'] == 2.5


def test_balance_and_month_budget_follow_records(client):
    today = datetime.now().date().isoformat()
    assert call(client, 'put', '/api/learning/profile', {'current_balance': 1000, 'monthly_income': 2000}).status_code == 200
    response = call(client, 'post', '/api/decision/transactions', {'date': today, 'amount': 100, 'category': '餐饮'})
    assert response.status_code == 201
    assert call(client, 'get', '/api/learning/profile').json['profile']['estimated_balance'] == 900
    budget = call(client, 'get', '/api/decision/transactions?limit=1').json['data']['monthly_budget']
    assert budget['spent'] == 100
    assert budget['remaining'] == 1900
    call(client, 'put', '/api/learning/profile', {'topic': 'risk'})
    assert call(client, 'get', '/api/learning/profile').json['profile']['estimated_balance'] == 900
    call(client, 'put', '/api/learning/profile', {'current_balance': 800})
    call(client, 'post', '/api/decision/transactions', {'date': today, 'amount': 20, 'category': '餐饮'})
    assert call(client, 'get', '/api/learning/profile').json['profile']['estimated_balance'] == 780
    assert call(client, 'get', '/api/decision/transactions?limit=1').json['data']['monthly_budget']['remaining'] == 1880


def test_budget_excludes_old_and_future_records_and_delete_restores_balance(client):
    from datetime import timedelta
    from app.services.checkin_service import BEIJING
    today = datetime.now(BEIJING).date()
    last_month = today.replace(day=1) - timedelta(days=1)
    call(client, 'put', '/api/learning/profile', {'current_balance': 1000, 'monthly_income': 2000})
    for day, amount in [(last_month, 50), (today + timedelta(days=1), 300)]:
        assert call(client, 'post', '/api/decision/transactions', {'date': day.isoformat(), 'amount': amount, 'category': '餐饮'}).status_code == 201
    response = call(client, 'post', '/api/decision/transactions', {'date': today.isoformat(), 'amount': 100, 'category': '餐饮'})
    budget = call(client, 'get', '/api/decision/transactions?limit=1').json['data']['monthly_budget']
    assert budget['remaining'] == 1900
    assert call(client, 'get', '/api/learning/profile').json['profile']['estimated_balance'] == 850
    tid = response.json['data']['id']
    assert call(client, 'delete', f'/api/decision/transactions/{tid}').status_code == 200
    assert call(client, 'get', '/api/learning/profile').json['profile']['estimated_balance'] == 950
    assert call(client, 'get', '/api/decision/transactions?limit=1').json['data']['monthly_budget']['remaining'] == 2000


def test_month_budget_keeps_yesterdays_spending_and_resets_only_next_month(client, monkeypatch):
    from app.routes import decision_routes
    class Clock(datetime):
        current = datetime(2026, 10, 1, 20)
        @classmethod
        def now(cls, tz=None):
            return cls.current.replace(tzinfo=tz)
    monkeypatch.setattr(decision_routes, 'datetime', Clock)
    call(client, 'put', '/api/learning/profile', {'monthly_income': 2000})
    call(client, 'post', '/api/decision/transactions', {'date': '2026-10-01', 'amount': 100, 'category': '餐饮'})
    assert call(client, 'get', '/api/decision/transactions?limit=1').json['data']['monthly_budget']['remaining'] == 1900
    Clock.current = datetime(2026, 10, 2, 8)
    assert call(client, 'get', '/api/decision/transactions?limit=1').json['data']['monthly_budget']['remaining'] == 1900
    call(client, 'post', '/api/decision/transactions', {'date': '2026-10-02', 'amount': 25.5, 'category': '餐饮'})
    budget = call(client, 'get', '/api/decision/transactions?limit=1').json['data']['monthly_budget']
    assert budget['spent'] == 125.5
    assert budget['remaining'] == 1874.5
    Clock.current = datetime(2026, 11, 1, 8)
    assert call(client, 'get', '/api/decision/transactions?limit=1').json['data']['monthly_budget']['remaining'] == 2000


def test_month_budget_includes_legacy_dates_and_more_than_report_limit(client, monkeypatch):
    from app.routes import decision_routes
    from app.services import firestore_service as fs
    from app.services.checkin_service import BEIJING
    today = datetime.now(BEIJING).date()
    call(client, 'put', '/api/learning/profile', {'monthly_income': 10000})
    fs._dev_db['users']['alice']['transactions'] = [
        {'id': str(i), 'date': today.isoformat(), 'amount': 0.1}
        for i in range(decision_routes.MAX_TRANSACTIONS_PER_REPORT + 1)]
    fs._dev_db['users']['alice']['transactions'].append(
        {'id': 'legacy', 'spent_at': today.replace(day=1).isoformat(), 'amount': 25.5})
    budget = call(client, 'get', '/api/decision/transactions?limit=1').json['data']['monthly_budget']
    assert budget['complete'] is True
    assert budget['spent'] == 225.6
    assert budget['remaining'] == 9774.4
    assert call(client, 'get', '/api/decision/transactions', user='bob').json['data']['monthly_budget']['spent'] == 0


def test_month_budget_does_not_restore_full_budget_when_summary_fails(client, monkeypatch):
    from app.routes import decision_routes
    call(client, 'put', '/api/learning/profile', {'monthly_income': 2000})
    monkeypatch.setattr(decision_routes.user_data_service, 'get_monthly_spending', lambda *args: (None, '读取失败'))
    budget = call(client, 'get', '/api/decision/transactions').json['data']['monthly_budget']
    assert budget['complete'] is False
    assert budget['remaining'] is None
    assert budget['spent'] is None

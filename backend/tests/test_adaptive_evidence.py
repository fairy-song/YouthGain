from datetime import date, timedelta
from unittest.mock import Mock
import pytest
from app.services.adaptive_learning import grade, recommend, ITEMS
from app.services.coach_evidence import retrieve, compute_facts, validate_explanation, render_evidence
from app.services.decision_engine import Transaction
from test_learning_flow import client, call


def test_recommendation_changes_and_repeat_is_not_new_evidence():
    today = date(2026, 1, 2)
    assert recommend([], 'risk', today=today)['next_item']['id'] == 'credit-total'
    wrong = dict(grade('risk-basic', 0), updated_at='2026-01-01', id='a')
    assert recommend([wrong], 'risk', today=today)['states'][3]['status'] == '建议复习'
    right = dict(grade('risk-basic', 1), updated_at='2026-01-02', id='b')
    result = recommend([wrong, right, right], 'risk', today=today)
    assert result['next_item']['id'] == 'credit-total'
    assert result['states'][3]['observed'] == 1
    assert result['states'][3]['correct'] == 1
    assert 'answer' not in result['next_item']
    assert 'answer' not in result['items'][0]
    assert result['attempts']['risk-basic']['evidence'] == '核实损失、费用和退出限制，信息不足时暂不决定'
    assert 'answer' not in result['attempts']['risk-basic']


def test_all_complete_and_old_version_ignored():
    rows = [grade(i['id'], i['answer']) for i in ITEMS]
    assert recommend(rows)['next_item'] is None
    rows[0]['version'] = 'old'
    assert recommend(rows)['next_item']['id'] == 'budget-basic'


def test_recommendation_uses_gap_goal_context_and_spaced_review():
    today = date(2026, 10, 9)
    wrong = dict(grade('choice-basic', 1), updated_at=today.isoformat(), id='wrong')
    result = recommend([wrong], 'budget', today=today)
    assert result['next_item']['id'] == 'refund-net'
    assert result['recommendation_mode'] == 'new'
    assert '答题证据' in result['reason']
    assert recommend([], 'risk', today=today)['next_item']['id'] == 'credit-total'

    answered = [dict(grade(i['id'], i['answer']), updated_at=today.isoformat(), id=i['id']) for i in ITEMS]
    assert recommend(answered, today=today)['next_item'] is None
    answered[0]['updated_at'] = (today - timedelta(days=8)).isoformat()
    review = recommend(answered, today=today)
    assert review['next_item']['id'] == 'budget-basic'
    assert review['recommendation_mode'] == 'review'
    assert review['states'][0]['observed'] == sum(i['topic'] == 'budget' for i in ITEMS)

    answered[0]['updated_at'] = today.isoformat()
    answered[0]['correct'] = False
    lesson = recommend(answered, today=today)
    assert lesson['next_item'] is None
    assert lesson['lesson_id'] == 'needs'
    assert '回看需要巩固的主题' in lesson['reason']


def test_context_changes_priority_without_using_amount_or_raw_text():
    today = date(2026, 10, 9)
    rows = [dict(date=today.isoformat(), amount=999999, regret=True, note='private note')]
    completed = [dict(grade(i['id'], i['answer']), updated_at=today.isoformat(), id=i['id'])
                 for i in ITEMS if i['id'] != 'choice-basic' and i['id'] != 'budget-basic']
    plain = recommend(completed, 'risk', today=today)
    contextual = recommend(completed, 'risk', rows, today=today)
    assert plain['next_item']['id'] == 'budget-basic'
    assert contextual['next_item']['id'] == 'choice-basic'
    assert '标记为值得回看' in contextual['reason']
    assert '999999' not in str(contextual)
    assert 'private note' not in str(contextual)


def test_adaptive_uses_recorded_transactions_without_opt_in_and_stays_account_scoped(client, monkeypatch):
    from app.routes import learning_routes

    loader = Mock(side_effect=lambda uid, kind, limit: (
        ([{'date': date.today().isoformat(), 'regret': True, 'amount': 20}], None)
        if uid == 'alice' else ([], None)
    ))
    monkeypatch.setattr(learning_routes.user_data_service, 'get_user_data', loader)
    result = call(client, 'get', '/api/learning/adaptive').json
    loader.assert_called_once_with('alice', 'transactions', limit=2000)
    assert result['next_item'] is not None
    assert call(client, 'get', '/api/learning/adaptive', user='bob').status_code == 200
    assert loader.call_args_list[1].args == ('bob', 'transactions')
    assert loader.call_args_list[1].kwargs == {'limit': 2000}

    # Old profiles with the former switch off still use their own recorded spending.
    assert call(client, 'put', '/api/learning/profile', {'use_spending_for_learning': False}).status_code == 200
    assert call(client, 'get', '/api/learning/adaptive').status_code == 200
    assert loader.call_args_list[-1].args == ('alice', 'transactions')

    loader.side_effect = None
    loader.return_value = ([], 'offline')
    offline = call(client, 'get', '/api/learning/adaptive').json
    loader.return_value = ([{'date': date.today().isoformat(), 'regret': True}] * 2000, None)
    truncated = call(client, 'get', '/api/learning/adaptive').json
    loader.return_value = ([], None)
    empty = call(client, 'get', '/api/learning/adaptive').json
    assert offline['next_item'] == truncated['next_item'] == empty['next_item']


@pytest.mark.parametrize('choice', [True, -1, 3, '1', None, {}, []])
def test_invalid_answer(choice):
    with pytest.raises(ValueError):
        grade('budget-basic', choice)


def test_original_multistep_scenario_unlocks_in_order_and_grades_by_type():
    assert len(ITEMS) == 32
    assert len({item['id'] for item in ITEMS}) == len(ITEMS)
    assert all(item.get('review_status') == 'pilot' for item in ITEMS[8:])
    first = recommend([], 'budget')
    assert 'phone-gap' not in {item['id'] for item in first['items']}
    assert 'answer' not in next(item for item in first['items'] if item['id'] == 'phone-total')
    assert grade('phone-total', 140)['correct'] is True
    assert grade('phone-total', 139)['correct'] is False
    assert grade('credit-total', 3960)['score'] == 0.5
    assert grade('statement-balance', 1390)['score'] == 0.5
    for item_id, expected in [('refund-net', 30), ('repair-gap', 300), ('saving-original', 250),
                              ('saving-revise', 325), ('subscription-year', 720),
                              ('subscription-save', 348), ('statement-balance', 1388)]:
        assert grade(item_id, expected)['correct'] is True
    with pytest.raises(ValueError):
        grade('phone-total', True)
    with pytest.raises(ValueError):
        grade('phone-reflect', '短')

    start = dict(grade('phone-total', 140), id='one', updated_at='2026-10-09')
    second = recommend([start], 'budget', today=date(2026, 10, 9))
    assert second['next_item']['id'] == 'phone-gap'
    assert 'phone-reflect' not in {item['id'] for item in second['items']}
    assert second['attempts']['phone-total']['evidence'] == '140 元'
    assert 'answer' not in second['attempts']['phone-total']
    gap = dict(grade('phone-gap', 800), id='two', updated_at='2026-10-09')
    third = recommend([start, gap], 'budget', today=date(2026, 10, 9))
    assert third['next_item']['id'] == 'phone-reflect'
    switched = dict(grade('refund-net', 30), id='three', updated_at='2026-10-10')
    assert recommend([start, gap, switched], 'budget', today=date(2026, 10, 10))['next_item']['id'] == 'refund-record'
    reflection = grade('phone-reflect', '我会核对未来每月必要开支。')
    assert reflection['correct'] is None
    assert reflection['answer'] is None


def test_scenario_api_rejects_skipping_steps(client):
    assert call(client, 'post', '/api/learning/adaptive/answer', {'item_id': 'phone-gap', 'choice': 800}).status_code == 400
    assert call(client, 'post', '/api/learning/adaptive/answer', {'item_id': 'phone-total', 'choice': 140}).status_code == 201
    assert call(client, 'post', '/api/learning/adaptive/answer', {'item_id': 'phone-gap', 'choice': 800}).status_code == 201


def test_diagnostic_http_isolation_and_server_grading(client):
    assert client.get('/api/learning/adaptive').status_code == 401
    response = call(client, 'post', '/api/learning/adaptive/answer', {'item_id': 'budget-basic', 'choice': 0, 'correct': True})
    assert response.status_code == 201
    assert response.json['entry']['correct'] is False
    assert call(client, 'get', '/api/decision/checkin').json['data']['checked_today']
    alice = call(client, 'get', '/api/learning/adaptive').json
    bob = call(client, 'get', '/api/learning/adaptive', user='bob').json
    assert alice['states'][0]['observed'] == 1
    assert alice['attempts']['budget-basic']['evidence'] == '800 元'
    assert 'answer' not in alice['attempts']['budget-basic']
    assert bob['states'][0]['observed'] == 0
    assert bob['attempts'] == {}
    assert call(client, 'post', '/api/learning/adaptive/answer', {'item_id': 'no', 'choice': 0}).status_code == 400


def test_retrieval_abstains_and_preserves_actual_passage():
    articles = [{'id': 'a', 'title': '预算安排', 'content': '预算安排需要预留必要开支。', 'date': '2026-09-28'}]
    assert retrieve('预算安排', articles)[0]['excerpt'] == articles[0]['content']
    assert retrieve('天气预报', articles) == []
    assert retrieve('预算', []) == []


def test_calculation_insufficient_data_and_explicit_amount():
    today = date(2026, 9, 28)
    assert 'remaining_estimate' not in compute_facts([], 2000, 100, today)
    short = compute_facts([Transaction(500, '生活', today)], 2000, 100, today)
    assert short['after_purchase_estimate'] == 1400
    assert 'delay_days' not in short
    txns = [Transaction(500, '生活', date(2026, 8, 29)), Transaction(500, '生活', today)]
    complete = compute_facts(txns, 2000, 100, today)
    assert complete['delay_days'] > 0
    assert 'delay_days' not in compute_facts(txns, 2000, 100, today, limited=True)
    assert 'delay_days' not in compute_facts(txns, 2000, 100, today, skipped=1)
    assert 'delay_days' not in compute_facts(txns, 0, 100, today)
    assert 'remaining_estimate' not in compute_facts(txns, None, 100, today)
    assert complete['coverage'] == 'unknown'


@pytest.mark.parametrize('raw', ['hello', '{}', '[]', '{"explanation":"余额500元","source_ids":[]}', '{"explanation":"推迟十天","source_ids":[]}', '{"explanation":"见 https://fake.test","source_ids":[]}', '{"explanation":"请比较选择","source_ids":["K99"]}'])
def test_model_invalid_output_fails_closed(raw):
    assert validate_explanation(raw, [{'source_id': 'K1'}]) is None


def test_model_valid_output():
    assert validate_explanation('{"explanation":"请比较需要和未来安排。","source_ids":["K1"]}', [{'source_id': 'K1'}]) == '请比较需要和未来安排。'
    assert validate_explanation('```json\n{"explanation":"请比较需要。","source_ids":[]}\n```', []) == '请比较需要。'
    assert validate_explanation('```json\n{"explanation":"余额999元","source_ids":[]}\n```', []) is None


def test_title_only_match_does_not_return_unrelated_passage():
    assert retrieve('预算安排', [{'id': 'a', 'title': '预算安排', 'content': '这是一段完全无关的天气预报说明。'}]) == []


def test_coach_consent_and_account_scoping(client, monkeypatch):
    from app.routes import coach_routes, decision_routes
    from app.services import admin_service
    coach = Mock()
    coach.get_chat_response.return_value = {'status': 'success', 'reply': 'ok'}
    monkeypatch.setattr(coach_routes, 'zhipuai_service', coach)
    monkeypatch.setattr(admin_service, 'list_kb_articles', lambda: ([], None))
    loader = Mock(return_value=([Transaction(300, '生活', date(2026, 9, 1))], [], 0))
    monkeypatch.setattr(decision_routes, '_load_engine_inputs', loader)
    assert call(client, 'post', '/api/coach/chat', {'message': '预算'}).status_code == 200
    loader.assert_not_called()
    assert coach.get_chat_response.call_args.args[0]['evidence']['calculation'] is None
    assert call(client, 'post', '/api/coach/chat', {'message': '预算', 'purchase_amount': 100}).status_code == 400
    call(client, 'put', '/api/learning/profile', {'monthly_income': 2000})
    assert call(client, 'post', '/api/coach/chat', {'message': '预算', 'purchase_amount': 100, 'use_learning_context': True, 'user_id': 'bob'}).status_code == 200
    loader.assert_called_once_with('alice')
    assert coach.get_chat_response.call_args.args[0]['evidence']['calculation']['monthly_income'] == 2000
    loader.side_effect = RuntimeError('offline')
    assert call(client, 'post', '/api/coach/chat', {'message': '预算', 'use_learning_context': True}).status_code == 503


def test_provider_response_integration_without_network(monkeypatch):
    from app.services.zhipuai_service import ZhipuAIService
    monkeypatch.delenv('ZHIPUAI_API_KEY', raising=False)
    service = ZhipuAIService()
    service.client = Mock()
    service.client.chat.completions.create.return_value.choices = [Mock(message=Mock(content='[K1] 预算资料'))]
    evidence = {'sources': [], 'calculation': None, 'knowledge_status': 'available'}
    result = service.get_chat_response({'message': '预算', 'evidence': evidence})
    assert result['status'] == 'error'
    assert 'reply' not in result

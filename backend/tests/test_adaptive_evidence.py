from datetime import date
from unittest.mock import Mock
import pytest
from app.services.adaptive_learning import grade, recommend, ITEMS
from app.services.coach_evidence import retrieve, compute_facts, validate_explanation, render_evidence
from app.services.decision_engine import Transaction
from test_learning_flow import client, call


def test_recommendation_changes_and_repeat_is_not_new_evidence():
    assert recommend([], 'risk')['next_item']['id'] == 'risk-basic'
    wrong = dict(grade('risk-basic', 0), updated_at='2026-01-01', id='a')
    assert recommend([wrong], 'risk')['states'][3]['status'] == '建议复习'
    right = dict(grade('risk-basic', 1), updated_at='2026-01-02', id='b')
    result = recommend([wrong, right, right], 'risk')
    assert result['next_item']['id'] == 'risk-transfer'
    assert result['states'][3]['observed'] == 1
    assert result['states'][3]['correct'] == 1
    assert 'answer' not in result['next_item']
    assert 'answer' not in result['items'][0]


def test_all_complete_and_old_version_ignored():
    rows = [grade(i['id'], i['answer']) for i in ITEMS]
    assert recommend(rows)['next_item'] is None
    rows[0]['version'] = 'old'
    assert recommend(rows)['next_item']['id'] == 'budget-basic'


@pytest.mark.parametrize('choice', [True, -1, 3, '1', None, {}, []])
def test_invalid_answer(choice):
    with pytest.raises(ValueError):
        grade('budget-basic', choice)


def test_diagnostic_http_isolation_and_server_grading(client):
    assert client.get('/api/learning/adaptive').status_code == 401
    response = call(client, 'post', '/api/learning/adaptive/answer', {'item_id': 'budget-basic', 'choice': 0, 'correct': True})
    assert response.status_code == 201
    assert response.json['entry']['correct'] is False
    assert call(client, 'get', '/api/decision/checkin').json['data']['checked_today']
    assert call(client, 'get', '/api/learning/adaptive').json['states'][0]['observed'] == 1
    assert call(client, 'get', '/api/learning/adaptive', user='bob').json['states'][0]['observed'] == 0
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

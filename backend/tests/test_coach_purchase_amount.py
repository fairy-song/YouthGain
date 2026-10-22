"""Exercise natural-language purchase inputs without model/network or real account data."""
import json
from datetime import date
from unittest.mock import Mock

import pytest

from app.services.coach_tools import extract_purchase_amount, fact_catalog
from app.services.coach_evidence import compute_facts
from app.services.coach_validator import validate_reply
from app.services.zhipuai_service import ZhipuAIService
from app.services.decision_engine import Transaction
from test_learning_flow import client, call


@pytest.mark.parametrize('message,expected', [
    ('我想花300元买耳机。请结合我已记录的收支、储蓄目标和未来开支分析取舍。', 300),
    ('我准备花299.90元买耳机', 299.9),
    ('打算用1,200元买电脑', 1200),
    ('我想买300元的耳机', 300),
    ('买耳机预算300元，够吗', 300),
    ('预算是300块钱', 300),
    ('月收入2000元，必要开支1200元，想花300元买耳机', 300),
    ('月收入2000元，必要开支1200元', None),
    ('每月预算2000元', None),
    ('每月生活预算2000元', None),
    ('我不想花300元买耳机', None),
    ('我想花300元买耳机，不过现在不买了', None),
    ('我想买300元或150元的耳机，选哪个', None),
    ('我想花300元买耳机，或者买150元的，比较一下', None),
    ('想花300.123元买东西', None),
    ('我想花100000001元买房', None),
])
def test_explicit_shopping_amounts_and_ambiguity(message, expected):
    assert extract_purchase_amount(message) == expected


def test_followups_use_user_input_and_apply_corrections():
    history = [{'role': 'user', 'content': '我想花300元买耳机'},
               {'role': 'assistant', 'content': '我想花999元买耳机'}]
    assert extract_purchase_amount('这笔消费的计算依据是什么？', history) == 300
    assert extract_purchase_amount('如果改成150元，和300元相比呢？', history) == 150
    assert extract_purchase_amount('取消，不买了', history) is None
    assert extract_purchase_amount('介绍预算是什么', history) is None


def test_purchase_is_still_a_known_input_with_missing_account_data():
    calculated = compute_facts([], None, 300, date(2026, 10, 22))
    assert calculated['purchase_amount'] == 300
    assert 'after_purchase_estimate' not in calculated
    facts = fact_catalog(calculated, purchase_amount=300)
    assert len([f for f in facts if f['id'] == 'F:purchase_amount']) == 1


def test_provider_receives_bound_purchase_not_missing_placeholder():
    evidence = {'facts': fact_catalog(purchase_amount=300), 'sources': []}
    bound = ZhipuAIService._bind_message('我想花300元买耳机。月收入300元。', evidence)
    assert '花{{F:purchase_amount}}买耳机' in bound
    assert '月收入{{F:purchase_amount}}' not in bound
    assert '{{F:purchase_amount}}' in ZhipuAIService._bind_message('如果改成300元呢', evidence)


def test_validators_reject_known_amount_as_missing_and_negative_spendable_balance():
    evidence = {'facts': fact_catalog(purchase_amount=300), 'sources': []}
    reply, validation = validate_reply('您想购买耳机的预算金额目前尚未提供，因此无法具体计算。', evidence)
    assert reply is None
    assert 'known_purchase_amount_claimed_missing' in validation['errors']
    evidence['facts'] = fact_catalog({'remaining_estimate': -323.47}, purchase_amount=300)
    raw = json.dumps({'explanation': '收入减本月支出为{{F:remaining_estimate}}，这将是您可用于额外支出的资金。',
                      'fact_ids': ['F:remaining_estimate'], 'source_ids': [], 'claims': []}, ensure_ascii=False)
    reply, validation = validate_reply(raw, evidence)
    assert reply is None and 'negative_surplus_is_not_spendable' in validation['errors']


def test_failed_missing_amount_response_falls_back_to_known_purchase(monkeypatch):
    monkeypatch.delenv('ZHIPUAI_API_KEY', raising=False)
    service = ZhipuAIService()
    service.client = Mock()
    service.client.chat.completions.create.return_value.choices = [Mock(message=Mock(content='预算金额尚未提供。'))]
    response = service.get_chat_response({'message': '我想花300元买耳机',
                                         'evidence': {'facts': fact_catalog(purchase_amount=300), 'sources': []}})
    assert response['validation']['fallback'] is True
    assert '300.00元' in response['reply'] and '尚未提供' not in response['reply']
    assert service.client.chat.completions.create.call_count == 2


@pytest.mark.parametrize('refusal', [
    '我无法直接计算您想购买耳机的具体金额。',
    '无法读取本次消费的具体金额。',
    '先核对收支，再考虑这笔购买。',
])
def test_known_purchase_cannot_be_refused_or_silently_dropped(refusal):
    reply, validation = validate_reply(refusal, {'facts': fact_catalog(purchase_amount=300), 'sources': []})
    assert reply is None
    assert 'known_purchase_amount_not_acknowledged' in validation['errors']


def test_known_purchase_allows_honest_missing_downstream_calculation():
    raw = json.dumps({'explanation': '您计划花{{F:purchase_amount}}买耳机。缺少完整收入与支出记录，暂时无法计算等价结余天数。',
                      'fact_ids': ['F:purchase_amount'], 'source_ids': [], 'claims': []}, ensure_ascii=False)
    reply, validation = validate_reply(raw, {'facts': fact_catalog(purchase_amount=300), 'sources': []})
    assert validation['errors'] == []
    assert '300.00元' in reply


def test_chat_extracts_amount_and_preserves_account_permission(client, monkeypatch):
    from app.routes import coach_routes, decision_routes
    from app.services import admin_service
    provider = Mock()
    provider.get_chat_response.return_value = {'status': 'success', 'reply': 'ok'}
    monkeypatch.setattr(coach_routes, 'zhipuai_service', provider)
    monkeypatch.setattr(admin_service, 'list_kb_articles', lambda: ([], None))
    loader = Mock(return_value=([Transaction(100, '餐饮', date.today())], [], 0))
    monkeypatch.setattr(decision_routes, '_load_engine_inputs', loader)
    message = '我想花300元买耳机，请结合收支分析。'
    assert call(client, 'post', '/api/coach/chat', {'message': message}).status_code == 200
    loader.assert_not_called()
    evidence = provider.get_chat_response.call_args.args[0]['evidence']
    assert evidence['calculation'] is None
    assert next(f['value'] for f in evidence['facts'] if f['id'] == 'F:purchase_amount') == 300
    call(client, 'put', '/api/learning/profile', {'monthly_income': 2000})
    assert call(client, 'post', '/api/coach/chat', {'message': message, 'use_learning_context': True}).status_code == 200
    loader.assert_called_once_with('alice')
    calculation = provider.get_chat_response.call_args.args[0]['evidence']['calculation']
    assert calculation['purchase_amount'] == 300
    assert calculation['after_purchase_estimate'] == 1600
    call(client, 'post', '/api/coach/chat', {'message': '如果改成150元呢', 'use_learning_context': True,
                                          'chat_history': [{'role': 'user', 'content': message}]})
    assert provider.get_chat_response.call_args.args[0]['evidence']['calculation']['purchase_amount'] == 150
    call(client, 'post', '/api/coach/chat', {'message': '如果改成150元呢', 'purchase_amount': 300,
                                          'use_learning_context': True,
                                          'chat_history': [{'role': 'user', 'content': message}]})
    assert provider.get_chat_response.call_args.args[0]['evidence']['calculation']['purchase_amount'] == 150

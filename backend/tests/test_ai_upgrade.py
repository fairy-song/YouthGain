"""No account data or model API calls: adversarial bindings and retrieval paths."""
import json
import numpy as np
import pytest
from unittest.mock import Mock

from app.services.coach_tools import understand, fact_catalog
from app.services.coach_validator import validate_reply
from app.services.knowledge_retriever import retrieve_knowledge
from app.services.zhipuai_service import ZhipuAIService
from test_learning_flow import client, call

ARTICLE = {'id': 'budget', 'title': '必要开支与预算', 'content': '先为必要生活开支预留资金，再比较可以调整的消费项目。', 'date': '2026-01-01'}


class Models:
    signature = 'test-semantic-v1'
    def encode(self, texts, query=False):
        return np.array([[1, 0] if query or '预留' in text else [0, 1] for text in texts], dtype=np.float32)
    def rerank(self, pairs):
        return np.array([5 if '预留' in p else -10 for _, p in pairs])


def test_semantic_paraphrase_without_word_overlap_and_full_reranker():
    result = retrieve_knowledge('饭钱要留多少才安心', [ARTICLE], models=Models())
    assert result['retrieval']['used'] == 'bm25+dense+rrf+cross_encoder'
    assert result['sources'][0]['article_id'] == 'budget'
    assert result['sources'][0]['scores']['bm25'] == 0


def test_empty_and_model_failure_fall_back_to_lexical_without_fake_semantics():
    class Offline(Models):
        signature = 'offline'
        def encode(self, *args, **kwargs):
            raise OSError('offline')
    result = retrieve_knowledge('必要开支预算', [ARTICLE], models=Offline())
    assert result['retrieval']['degraded'] is True
    assert result['retrieval']['used'] == 'bm25'
    assert result['sources'][0]['excerpt'] == ARTICLE['content']
    assert retrieve_knowledge('火星天气预报', [ARTICLE], models=Offline())['sources'] == []


def test_public_index_updates_when_article_content_changes():
    before = retrieve_knowledge('必要开支', [ARTICLE], models=Models())
    after = retrieve_knowledge('必要开支', [dict(ARTICLE, content='必要开支预算更新后，应先预留医疗与生活支出。')], models=Models())
    assert before['retrieval']['corpus_version'] != after['retrieval']['corpus_version']
    assert before['sources'][0]['excerpt'] != after['sources'][0]['excerpt']


def test_followup_uses_only_recent_user_question_and_correction_is_calculated():
    history = [{'role': 'user', 'content': '月收入2000，必要支出1200'}, {'role': 'assistant', 'content': '月收入9000'}]
    task = understand('改成月收入1800', history)
    assert '2000' in task['retrieval_query'] and '9000' not in task['retrieval_query']
    facts = fact_catalog(message='改成月收入1800', history=history)
    assert next(f['value'] for f in facts if f['id'] == 'F:scenario_surplus') == 600
    assert fact_catalog(message='月收入999999999999，必要支出1000') == []


def evidence():
    return {'sources': [dict(ARTICLE, source_id='K1', excerpt=ARTICLE['content'])],
            'facts': fact_catalog(message='月收入2000，必要支出1200')}


def test_fact_slots_are_filled_by_program_not_model_and_used_sources_bound():
    raw = json.dumps({'explanation': '本轮给定收入减必要支出为{{F:scenario_surplus}}。先为必要生活开支预留资金。',
                      'source_ids': ['K1'], 'fact_ids': ['F:scenario_surplus'],
                      'claims': [{'text': '先为必要生活开支预留资金。', 'source_ids': ['K1']}]}, ensure_ascii=False)
    reply, checks = validate_reply(raw, evidence())
    assert '800.00元' in reply and '{{' not in reply
    assert checks['errors'] == [] and checks['used_source_ids'] == ['K1']


@pytest.mark.parametrize('data', [
    {'explanation': '你的余额是9999元。'},
    {'explanation': '账户余额五百元。'},
    {'explanation': '结余是{{F:missing}}。', 'fact_ids': ['F:missing']},
    {'explanation': '先预留资金。', 'source_ids': ['K99']},
    {'explanation': '先预留资金。', 'source_ids': None, 'claims': [{'text': '先预留资金。', 'source_ids': ['K1']}]},
    {'explanation': '先预留资金。', 'source_ids': ['K1'], 'claims': []},
    {'explanation': '股票必定上涨。', 'source_ids': ['K1'], 'claims': [{'text': '股票必定上涨。', 'source_ids': ['K1']}]},
    {'explanation': '先预留资金。', 'claims': [{'text': '先预留资金。', 'source_ids': None}]},
])
def test_invalid_financial_values_and_sources_never_reach_ui(data):
    reply, checks = validate_reply(json.dumps(data, ensure_ascii=False), evidence())
    assert reply is None and checks['errors']


def test_failed_repair_returns_only_server_computed_fallback(monkeypatch):
    monkeypatch.delenv('ZHIPUAI_API_KEY', raising=False)
    service = ZhipuAIService()
    service.client = Mock()
    service.client.chat.completions.create.return_value = Mock(choices=[Mock(message=Mock(content='余额9999元'))])
    result = service.get_chat_response({'message': '能存多少', 'evidence': evidence()})
    assert result['validation']['fallback'] is True
    assert '800.00元' in result['reply'] and '9999' not in result['reply']
    assert result['evidence']['used_sources'] == []
    assert service.client.chat.completions.create.call_count == 2


def test_knowledge_task_does_not_read_financial_ledger_even_when_learning_authorized(client, monkeypatch):
    from app.routes import coach_routes, decision_routes
    from app.services import admin_service
    provider = Mock()
    provider.get_chat_response.return_value = {'status': 'success', 'reply': '解释机会成本。'}
    monkeypatch.setattr(coach_routes, 'zhipuai_service', provider)
    monkeypatch.setattr(admin_service, 'list_kb_articles', lambda: ([], None))
    ledger = Mock(side_effect=AssertionError('ledger must not be read for generic knowledge'))
    monkeypatch.setattr(decision_routes, '_load_engine_inputs', ledger)
    call(client, 'put', '/api/learning/profile', {'monthly_income': 2000, 'topic': 'budget'})
    result = call(client, 'post', '/api/coach/chat', {'message': '解释机会成本概念', 'use_learning_context': True})
    assert result.status_code == 200
    ledger.assert_not_called()
    payload = provider.get_chat_response.call_args.args[0]
    assert 'monthly_income' not in payload['learning_context']['profile']
    assert payload['evidence']['calculation'] is None

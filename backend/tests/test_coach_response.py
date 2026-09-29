"""Exercise provider repair and continuity without external model calls."""
from unittest.mock import Mock

from app.services.zhipuai_service import ZhipuAIService


def response(content):
    return Mock(choices=[Mock(message=Mock(content=content))])


def test_repairs_invalid_reply_and_keeps_original_question(monkeypatch):
    monkeypatch.delenv('ZHIPUAI_API_KEY', raising=False)
    service = ZhipuAIService()
    service.client = Mock()
    create = service.client.chat.completions.create
    create.side_effect = [response('[K1] 订阅管理'), response(
        '{"explanation":"先把必要开支与可调整开支分开记录，再检查哪些订阅已经不用。","source_ids":[]}')]
    history = [{'role': 'user', 'content': '我想控制订阅支出'},
               {'role': 'assistant', 'content': '可以先整理订阅。'}]
    result = service.get_chat_response({'message': '具体怎么做？', 'chat_history': history,
                                       'evidence': {'sources': [], 'calculation': None}})
    assert result['validation']['repaired'] is True
    assert result['validation']['fallback'] is False
    assert '必要开支' in result['reply']
    messages = create.call_args.kwargs['messages']
    assert messages[1:3] == history
    assert messages[3]['content'] == '具体怎么做？'
    assert create.call_count == 2


def test_repair_outage_returns_error(monkeypatch):
    monkeypatch.delenv('ZHIPUAI_API_KEY', raising=False)
    service = ZhipuAIService()
    service.client = Mock()
    service.client.chat.completions.create.side_effect = [
        response('[K1] 预算'), RuntimeError('offline')]
    result = service.get_chat_response({'message': '预算', 'evidence': {'sources': []}})
    assert result['status'] == 'error'
    assert 'reply' not in result
    assert 'offline' not in result['message']


def test_valid_response_does_not_retry(monkeypatch):
    monkeypatch.delenv('ZHIPUAI_API_KEY', raising=False)
    service = ZhipuAIService()
    service.client = Mock()
    service.client.chat.completions.create.return_value = response(
        '{"explanation":"先检查自动续费项目，取消已经不用的订阅。","source_ids":[]}')
    result = service.get_chat_response({'message': '怎么减少订阅支出', 'evidence': {'sources': []}})
    assert result['validation']['fallback'] is False
    service.client.chat.completions.create.assert_called_once()


def test_numbers_and_no_automatic_reference_append(monkeypatch):
    monkeypatch.delenv('ZHIPUAI_API_KEY', raising=False)
    service = ZhipuAIService()
    service.client = Mock()
    answer = '建议攒钱，但先保证必要开销。假设每月存200元，3个月就是600元。'
    service.client.chat.completions.create.return_value = response(answer)
    result = service.get_chat_response({'message': '大学生应该攒钱吗', 'evidence': {
        'sources': [{'source_id': 'K1', 'title': '储蓄资料标题', 'excerpt': '原始资料'}],
        'knowledge_status': 'available'}})
    assert result['reply'] == answer
    assert '储蓄资料标题' not in result['reply']
    assert result['evidence']['sources'][0]['source_id'] == 'K1'
    service.client.chat.completions.create.assert_called_once()


def test_empty_answer_never_becomes_success(monkeypatch):
    monkeypatch.delenv('ZHIPUAI_API_KEY', raising=False)
    service = ZhipuAIService()
    service.client = Mock()
    service.client.chat.completions.create.return_value = response(None)
    result = service.get_chat_response({'message': '机会成本是什么？'})
    assert result['status'] == 'error'
    assert 'reply' not in result
    assert service.client.chat.completions.create.call_count == 2


def test_presentation_validation_allows_examples_and_removes_thinking():
    from app.services.coach_evidence import prepare_coach_answer
    assert prepare_coach_answer('<think>内部分析</think>每月200元，三个月600元。') == '每月200元，三个月600元。'
    assert prepare_coach_answer('<think>未完成分析') is None
    assert prepare_coach_answer('[K1] 标题') is None
    assert prepare_coach_answer('请核对下方资料与计算依据') is None
    assert prepare_coach_answer('1. 先记录必要开支。') == '1. 先记录必要开支。'

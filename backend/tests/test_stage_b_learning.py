"""Stage B: explainable personal learning loop and content release gate."""
from datetime import date, timedelta

import pytest

from app.services.adaptive_learning import ITEMS, VERSION, audit_bank, grade, is_publishable, recommend
from test_learning_flow import client, call


def test_spending_context_and_answer_evidence_stay_separate():
    today = date(2026, 10, 11)
    rows = [{'date': (today - timedelta(days=index)).isoformat(), 'category': '购物',
             'amount': 999999, 'merchant': 'private merchant', 'note': 'private note'} for index in range(3)]
    result = recommend([], 'risk', rows, today=today)
    assert result['context_profile']['coverage'] == 'recorded_only'
    assert any(signal['source'] == 'transaction_category' and signal['topic'] == 'choice'
               for signal in result['context_profile']['signals'])
    assert result['states'][1]['source'] == 'scenario_answers'
    assert result['states'][1]['observed'] == 0
    assert '999999' not in str(result)
    assert 'private merchant' not in str(result)
    assert 'private note' not in str(result)
    assert result['next_item']['review_status'] == 'pilot'


def test_incomplete_ledger_does_not_reuse_spending_reason():
    today = date(2026, 10, 11)
    rows = [{'date': today.isoformat(), 'regret': True}]
    first = recommend([], 'choice', rows, today=today)
    missing = recommend([], 'choice', None, today=today)
    assert first['context_profile']['signals']
    assert missing['context_profile']['coverage'] == 'unavailable'
    assert missing['context_profile']['signals'] == []
    assert missing['reason_basis'] != 'transaction_reflection'


def test_review_is_scheduled_and_feedback_remains_small():
    today = date(2026, 10, 11)
    entry = dict(grade('budget-basic', 0), id='one', updated_at=(today - timedelta(days=3)).isoformat())
    result = recommend([entry], 'budget', today=today)
    assert any(row['item_id'] == 'budget-basic' and row['due_on'] == (today - timedelta(days=1)).isoformat()
               for row in result['review_schedule'])
    assert result['states'][0]['status'] == '建议复习'
    assert result['states'][0]['evidence_sufficient'] is False
    assert result['next_item']['id'] == 'budget-basic'
    assert result['recommendation_mode'] == 'review'
    assert grade('budget-basic', 1)['micro_action']
    assert grade('phone-total', 140)['micro_action'] is None
    assert grade('phone-reflect', '我会核对未来费用')['micro_action']


def test_draft_content_is_not_recommended_or_gradeable():
    draft = {**ITEMS[0], 'id': 'draft-for-test', 'review_status': 'draft'}
    ITEMS.append(draft)
    try:
        assert 'draft-for-test' not in {item['id'] for item in recommend([])['items']}
        with pytest.raises(ValueError):
            grade('draft-for-test', 1)
    finally:
        ITEMS.pop()
    assert audit_bank()['pilot'] == len(ITEMS)
    with pytest.raises(ValueError):
        audit_bank([{**ITEMS[0], 'duration_minutes': 0}])
    with pytest.raises(ValueError, match='正式发布审核记录'):
        audit_bank([{**ITEMS[0], 'review_status': 'approved'}])
    assert not is_publishable({**ITEMS[0], 'review_status': 'approved'})


def test_calculated_answers_and_content_version_are_saved():
    expected = {
        'phone-total': 6 * 290 - 1600,
        'phone-gap': 1600 - (2800 - 1700 - 300),
        'refund-net': 260 - 230,
        'credit-total': 12 * 330 + 120,
        'credit-extra': 12 * 330 + 120 - 3600,
        'repair-gap': 900 + 600 - 1200,
        'saving-original': (900 - 150) / 3,
        'saving-revise': (900 - 150 - 100) / 2,
        'subscription-year': (19 + 29 + 12) * 12,
        'subscription-save': 29 * 12,
        'statement-balance': 1120 + 800 - 650 - 2 + 120,
    }
    for item_id, answer in expected.items():
        result = grade(item_id, answer)
        assert result['correct'] is True, item_id
        assert result['content_version'] >= 1
        assert result['knowledge_point']


def test_questionnaire_direction_is_used_when_profile_has_no_topic(client):
    from app.services import learning_store
    with client.application.app_context():
        learning_store.write_entry('alice', 'questionnaire:stage-b-test', {
            'kind': 'onboarding_questionnaire', 'version': 2,
            'summary': {'topic': 'risk'}, 'answers': {},
        })
    result = call(client, 'get', '/api/learning/adaptive').json
    assert result['next_item']['topic'] == 'risk'
    assert result['reason_basis'] == 'questionnaire'
    assert result['version'] == VERSION

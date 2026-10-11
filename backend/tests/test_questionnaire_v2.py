"""First-visit questionnaire remains account scoped and does not replace legacy data."""
from uuid import uuid4

from test_learning_flow import client, call


def submission(**changes):
    answers = {f'q{i}': None for i in range(1, 13)}
    answers.update(changes)
    return {'version': 2, 'submission_id': str(uuid4()), 'answers': answers}


def test_save_before_profile_and_keep_history_and_legacy(client):
    legacy = {'monthly_income': 2100, 'onboarding_complete': True, 'topic': 'budget'}
    assert call(client, 'put', '/api/learning/profile', legacy).status_code == 200
    first = submission(q1='beginner', q2='none', q4='rarely', q10=2000, q11=1800, q12=0)
    saved = call(client, 'post', '/api/learning/questionnaires', first)
    assert saved.status_code == 201
    assert saved.json['questionnaire']['summary']['focus'] == '留有余地'
    assert saved.json['questionnaire']['answers']['q10'] == 2000
    assert call(client, 'post', '/api/learning/questionnaires', first).status_code == 200
    second = submission(q1='intermediate', q2='3to6', q4='weekly')
    assert call(client, 'post', '/api/learning/questionnaires', second).status_code == 201
    records = call(client, 'get', '/api/learning/questionnaires').json
    assert len(records['history']) == 2
    assert {entry['id'] for entry in records['history']} == {
        f"questionnaire:{first['submission_id']}", f"questionnaire:{second['submission_id']}"}
    assert call(client, 'get', '/api/learning/profile').json['profile']['monthly_income'] == 2100
    assert call(client, 'get', '/api/learning/questionnaires', user='bob').json == {'latest': None, 'history': []}


def test_reject_invalid_and_prevent_overwrite(client):
    assert call(client, 'post', '/api/learning/questionnaires', submission(q10=-1)).status_code == 400
    assert call(client, 'post', '/api/learning/questionnaires', submission(q7='none', q8='late')).status_code == 400
    assert call(client, 'post', '/api/learning/questionnaires', submission(q10=True)).status_code == 400
    body = submission(q1='basic')
    assert call(client, 'post', '/api/learning/questionnaires', body).status_code == 201
    changed = {**body, 'answers': {**body['answers'], 'q1': 'advanced'}}
    assert call(client, 'post', '/api/learning/questionnaires', changed).status_code == 400
    assert call(client, 'get', '/api/learning/questionnaires').json['latest']['answers']['q1'] == 'basic'

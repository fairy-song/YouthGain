"""Actual CPU forward/backward passes, strict causal masking and deployment guards."""
import copy
from datetime import datetime
import pytest

torch = pytest.importorskip('torch')
from app.services.hstu_model import HSTUBlock, YouthGainHSTU
from app.services.hstu_runtime import FEATURE_NAMES, predict, prepare
from app.services import finance_context_service as finance, podcast_ranker
from train_hstu import demo_data, train, validate_splits
from test_podcasts import base_client, client, add, call


@pytest.fixture(scope='module')
def checkpoint(tmp_path_factory):
    directory = tmp_path_factory.mktemp('hstu-trained')
    report = train(demo_data(), directory, epochs=2, demo=True)
    assert report['final_training']['loss'] < report['initial_training']['loss']
    return directory / 'model.pt'


def test_causal_future_values_and_appended_tokens_cannot_change_past():
    torch.manual_seed(7)
    block = HSTUBlock(32, 4).eval()
    sequence = torch.randn(1, 6, 32)
    times = torch.arange(6)[None].float()
    valid = torch.ones(1, 6, dtype=torch.bool)
    first = block(sequence, times, valid)
    changed = sequence.clone(); changed[:, 3:] *= 100
    changed_times = times.clone(); changed_times[:, 3:] += 500
    second = block(changed, changed_times, valid)
    torch.testing.assert_close(first[:, :3], second[:, :3])
    torch.testing.assert_close(first[:, :3], block(sequence[:, :3], times[:, :3], valid[:, :3]))


def test_feature_order_missing_mask_and_finance_snapshot_contract():
    snapshot = finance.from_records([], [], [], datetime.fromisoformat('2026-10-11T12:00:00+08:00'))
    assert set(snapshot['scaled_features']) == set(FEATURE_NAMES)
    payload = demo_data()[0][0]['payload']
    data = prepare(payload)
    reordered = copy.deepcopy(payload)
    reordered['features'] = dict(reversed(list(payload['features'].items())))
    torch.testing.assert_close(data['features'], prepare(reordered)['features'])
    reordered['missing_mask']['record_count'] = 1
    with pytest.raises(ValueError, match='invalid_missing_mask'):
        prepare(reordered)


@pytest.mark.parametrize('change', ['future', 'unsorted', 'duplicate', 'version', 'nan'])
def test_invalid_inputs_never_produce_neural_scores(change):
    payload = copy.deepcopy(demo_data()[0][0]['payload'])
    if change == 'future': payload['history'][0]['occurred_at'] = payload['as_of']
    if change == 'unsorted': payload['history'].reverse()
    if change == 'duplicate': payload['candidates'][1]['program_id'] = payload['candidates'][0]['program_id']
    if change == 'version': payload['feature_version'] = 'old'
    if change == 'nan': payload['features']['record_count'] = float('nan')
    with pytest.raises(ValueError): prepare(payload)


def test_actual_trained_checkpoint_inference_and_demo_production_guard(checkpoint):
    payload = demo_data()[2][0]['payload']
    value = predict(payload, checkpoint, allow_demo=True)
    assert value['model_version'].startswith('youthgain-hstu-demo-')
    assert len(value['scores']) == 8
    assert all(0 <= s['score'] <= 1 for s in value['scores'])
    with pytest.raises(ValueError, match='demo_checkpoint_not_allowed'):
        predict(payload, checkpoint)
    with pytest.raises(ValueError, match='demo_checkpoint_not_allowed'):
        predict(payload, checkpoint, allow_demo=True, production=True)


def test_candidate_order_and_baseline_scores_do_not_change_neural_predictions(checkpoint):
    payload = copy.deepcopy(demo_data()[2][0]['payload'])
    first = predict(payload, checkpoint, allow_demo=True)
    payload['candidates'].reverse()
    for c in payload['candidates']: c['baseline_score'] = 9999
    second = predict(payload, checkpoint, allow_demo=True)
    assert {s['program_id']: s['score'] for s in first['scores']} == pytest.approx({s['program_id']: s['score'] for s in second['scores']}, abs=1e-6)
    payload['history'] = []
    assert predict(payload, checkpoint, allow_demo=True)['cold_start'] is True


def test_future_feedback_cannot_cross_validation_cutoff():
    parts = demo_data()
    parts[0][-1]['feedback_observed_at'] = parts[1][0]['payload']['as_of']
    with pytest.raises(ValueError, match='temporal_split_leaks'):
        validate_splits(parts)


def test_daily_ranker_uses_real_local_forward_pass_and_falls_back(checkpoint):
    from flask import Flask
    app = Flask(__name__)
    app.config.update(PODCAST_RANKER_MODE='local_hstu', PODCAST_HSTU_MODEL_PATH=str(checkpoint),
                      PODCAST_HSTU_ALLOW_DEMO=True, APP_ENV='development')
    payload = demo_data()[2][0]['payload']
    snapshot = {'feature_version': payload['feature_version'], 'snapshot_id': payload['snapshot_id'],
                'as_of': payload['as_of'], 'scaled_features': payload['features'], 'missing_mask': payload['missing_mask'],
                'features': {'record_count': 20}, 'coverage': {}, 'learning_topic': payload['learning_topic']}
    candidates = [{'score': c['baseline_score'], 'program': {'id': c['program_id'], 'topics': c['topics'],
                   'episode_title': c['title'], 'episode_summary': c['summary']}} for c in payload['candidates']]
    with app.app_context():
        ranked = podcast_ranker.rank(candidates, snapshot, payload['history'])
        assert ranked['used'] == 'hstu' and ranked['fallback'] is False
        for environment in ('production', ' PRODUCTION '):
            app.config['APP_ENV'] = environment
            refused = podcast_ranker.rank(candidates, snapshot, payload['history'])
            assert refused['used'] == 'baseline' and refused['fallback'] is True


def test_internal_service_requires_auth_and_runs_actual_model(checkpoint, monkeypatch):
    from hstu_server import create_app
    monkeypatch.setenv('PODCAST_HSTU_MODEL_PATH', str(checkpoint))
    monkeypatch.setenv('PODCAST_HSTU_API_KEY', 'synthetic-test-key')
    monkeypatch.setenv('PODCAST_HSTU_ALLOW_DEMO', 'true')
    monkeypatch.setenv('APP_ENV', 'development')
    client = create_app().test_client()
    payload = demo_data()[2][0]['payload']
    assert client.post('/rank', json=payload).status_code == 401
    response = client.post('/rank', json=payload, headers={'Authorization': 'Bearer synthetic-test-key'})
    assert response.status_code == 200 and len(response.json['scores']) == 8


def test_daily_api_applies_actual_hstu_weights_and_persists_candidate_context(client, checkpoint):
    from app.services import podcast_store
    client.application.config.update(PODCAST_RANKER_MODE='local_hstu', PODCAST_HSTU_MODEL_PATH=str(checkpoint),
                                     PODCAST_HSTU_ALLOW_DEMO=True, APP_ENV='development')
    add(client, '测试预算内容')
    assert call(client, 'put', '/api/learning/profile', {'monthly_income': 2000, 'topic': 'budget'}).status_code == 200
    # Freeze recorded data at the test snapshot time, rather than creating a
    # current-day event after the historical recommendation fixture's as_of.
    from app.services import firestore_service
    firestore_service._dev_db['users']['alice']['transactions'] = [
        {'id': 'synthetic-expense', 'amount': 20, 'category': '学习', 'date': '2026-10-10'}]
    result = call(client, 'get', '/api/podcasts/today').json
    assert result['ranker_used'] == 'hstu' and result['demo_model'] is True
    assert result['fallback'] is False and result['model_version'].startswith('youthgain-hstu-demo-')
    assert call(client, 'get', '/api/podcasts/today').json == result
    other = call(client, 'get', '/api/podcasts/today', user='bob').json
    assert other['ranker_used'] == 'baseline' and other['fallback_reason'] == 'insufficient_finance_data'
    with client.application.app_context(), podcast_store.transaction() as connection:
        record = podcast_store.daily_pick(connection, 'alice', '2026-10-11')
        assert record['rank_input']['snapshot_id'] == record['snapshot_id']
        assert set(record['rank_input']['features']) == set(FEATURE_NAMES)


def test_untrained_and_nonfinite_checkpoints_are_rejected(checkpoint, tmp_path):
    data = torch.load(checkpoint, weights_only=True)
    payload = demo_data()[2][0]['payload']
    data['trained_steps'] = 0
    path = tmp_path/'untrained.pt'
    torch.save(data, path)
    with pytest.raises(ValueError, match='invalid_or_untrained_checkpoint'):
        predict(payload, path, allow_demo=True)
    data['trained_steps'] = 1
    next(iter(data['state_dict'].values())).fill_(float('nan'))
    path = tmp_path/'nonfinite.pt'
    torch.save(data, path)
    with pytest.raises(ValueError, match='nonfinite_checkpoint'):
        predict(payload, path, allow_demo=True)

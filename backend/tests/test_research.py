"""Real routes and SQLite transactions against isolated, synthetic inputs."""
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from unittest.mock import Mock

import pytest

from test_learning_flow import client as base_client, call
from app.services import research_service as service
from app.services.research_privacy import contribution, release


@pytest.fixture
def client(base_client, monkeypatch):
    from app.services import auth_service
    base_client.application.config.update(RESEARCH_LIVE_ENABLED=True, RESEARCH_GLOBAL_EPSILON_MILLI=2000)
    monkeypatch.setattr(auth_service, 'verify_firebase_token', lambda token: (
        {'uid': token, 'email': token + '@example.org', 'email_verified': token != 'unverified',
         'role': 'admin' if token == 'admin' else 'user'}, None))
    monkeypatch.setattr(service, 'now', lambda: datetime.fromisoformat('2026-01-15T12:00:00+08:00'))
    return base_client


def project(client, mode='live'):
    response = call(client, 'post', '/api/research/projects', {
        'title': '消费研究', 'school': '甲学校', 'purpose': '研究参与者的消费分布',
        'start_month': '2026-02', 'end_month': '2026-03', 'mode': mode}, user='admin')
    assert response.status_code == 201, response.json
    return response.json['project']['id']


def advance(monkeypatch, time='2026-04-01T12:00:00+08:00'):
    monkeypatch.setattr(service, 'now', lambda: datetime.fromisoformat(time))


def join(client, pid, user='alice'):
    return call(client, 'put', f'/api/research/projects/{pid}/consent',
                {'participate': True, 'version': service.CONSENT_VERSION}, user=user)


def publish(client, pid, month='2026-02'):
    return call(client, 'post', f'/api/research/projects/{pid}/releases', {'month': month}, user='admin')


def test_auth_project_scope_expiry_and_revocation(client, monkeypatch):
    assert client.get('/api/research/access').status_code == 401
    assert call(client, 'post', '/api/research/projects', {}).status_code == 403
    pid, other = project(client), project(client)
    path = f'/api/research/projects/{pid}'
    assert call(client, 'put', path + '/members', {'email': 'teacher@example.org', 'expires': '2026-12-31'}, user='admin').status_code == 200
    assert call(client, 'get', '/api/research/access', user='teacher').json['role'] == 'research'
    assert call(client, 'get', path + '/releases', user='teacher').status_code == 200
    assert call(client, 'get', f'/api/research/projects/{other}/releases', user='teacher').status_code == 403
    assert call(client, 'get', '/api/admin/users', user='teacher').status_code == 403
    assert call(client, 'post', path + '/releases', {'month': '2026-02'}, user='teacher').status_code == 403
    call(client, 'put', path + '/members', {'email': 'unverified@example.org', 'expires': '2026-12-31'}, user='admin')
    assert call(client, 'get', path + '/releases', user='unverified').status_code == 403
    assert call(client, 'get', '/api/research/access', user='unverified').json['requires_email_verification'] is True
    advance(monkeypatch, '2027-01-01T00:00:00+08:00')
    assert call(client, 'get', path + '/releases', user='teacher').status_code == 403
    advance(monkeypatch)
    call(client, 'put', path + '/members', {'email': 'teacher@example.org', 'revoke': True}, user='admin')
    assert call(client, 'get', path + '/releases', user='teacher').status_code == 403


def test_consent_missing_version_next_month_and_withdrawal(client, monkeypatch):
    pid = project(client)
    assert call(client, 'put', f'/api/research/projects/{pid}/consent', {'participate': True}).status_code == 409
    assert join(client, pid).json['consent']['effective_month'] == '2026-02'
    from app.services.user_data_service import user_data_service
    source = Mock(return_value=([{'date': '2026-02-10', 'amount': 20, 'category': '餐饮'}], None))
    monkeypatch.setattr(user_data_service, 'get_user_data', source)
    advance(monkeypatch)
    assert publish(client, pid).status_code == 200
    assert source.call_args.args[0] == 'alice'
    assert source.call_count == 1  # no non-consenting account is inspected
    assert call(client, 'put', f'/api/research/projects/{pid}/consent', {'participate': False}).status_code == 200
    assert publish(client, pid, '2026-03').status_code == 200
    assert source.call_count == 1
    own = call(client, 'get', '/api/research/participation').json['projects'][0]
    assert own['consent']['active'] is False
    assert call(client, 'get', '/api/research/participation', user='bob').json['projects'][0]['consent'] is None


def test_cached_release_export_and_budget_are_atomic(client, monkeypatch):
    pid = project(client)
    join(client, pid)
    advance(monkeypatch)
    first = publish(client, pid)
    assert first.status_code == 200
    again = publish(client, pid)
    assert again.json == first.json
    exported = call(client, 'get', f'/api/research/projects/{pid}/releases/2026-02/export', user='admin')
    assert json.loads(exported.data) == first.json['release']
    assert 'alice' not in exported.get_data(as_text=True)
    assert 'participant_count' not in exported.get_data(as_text=True)
    status = call(client, 'get', '/api/research/access', user='admin').json
    assert status['global_budget']['spent_milli'] == 1000
    assert len(status['global_budget']['entries']) == 1
    assert publish(client, pid, '2026-03').status_code == 200
    assert call(client, 'get', '/api/research/access', user='admin').json['global_budget']['spent_milli'] == 2000
    # A second project cannot reset the platform's composition budget.
    advance(monkeypatch, '2026-01-15T00:00:00+08:00')
    second = project(client)
    advance(monkeypatch)
    assert publish(client, second).status_code == 409
    assert publish(client, pid).json == first.json
    # Changing initial config must never top up the persisted ledger.
    client.application.config['RESEARCH_GLOBAL_EPSILON_MILLI'] = 20000
    assert publish(client, second).status_code == 409


def test_generation_failure_rolls_back_and_can_retry(client, monkeypatch):
    pid = project(client)
    advance(monkeypatch)
    original = service.release
    monkeypatch.setattr(service, 'release', Mock(side_effect=RuntimeError('simulation')))
    assert publish(client, pid).status_code == 503
    status = call(client, 'get', '/api/research/access', user='admin').json
    assert status['global_budget']['spent_milli'] == 0
    assert call(client, 'get', f'/api/research/projects/{pid}/releases', user='admin').json['releases'] == []
    monkeypatch.setattr(service, 'release', original)
    assert publish(client, pid).status_code == 200


def test_database_commit_failure_does_not_release_new_result(client, monkeypatch):
    import sqlite3
    from app.services import research_store
    pid = project(client)
    advance(monkeypatch)
    original = research_store.sqlite3.connect
    class FailingConnection(sqlite3.Connection):
        def commit(self):
            raise sqlite3.OperationalError('simulated commit failure')
    monkeypatch.setattr(research_store.sqlite3, 'connect', lambda *a, **kw: original(*a, **kw, factory=FailingConnection))
    assert publish(client, pid).status_code == 503
    monkeypatch.setattr(research_store.sqlite3, 'connect', original)
    status = call(client, 'get', '/api/research/access', user='admin').json
    assert status['global_budget']['spent_milli'] == 0
    assert status['global_budget']['entries'] == []


def test_concurrent_publication_returns_one_snapshot(client, monkeypatch):
    pid = project(client)
    advance(monkeypatch)
    def run(_):
        with client.application.test_client() as worker:
            response = publish(worker, pid)
            assert response.status_code == 200
            return response.json
    with ThreadPoolExecutor(max_workers=4) as pool:
        outputs = list(pool.map(run, range(4)))
    assert all(value == outputs[0] for value in outputs)
    assert call(client, 'get', '/api/research/access', user='admin').json['global_budget']['spent_milli'] == 1000


def test_demo_does_not_read_accounts_or_consume_real_budget(client, monkeypatch):
    pid = project(client, 'demo')
    assert join(client, pid).status_code == 400
    from app.services.user_data_service import user_data_service
    source = Mock(side_effect=AssertionError('must not read personal data'))
    monkeypatch.setattr(user_data_service, 'get_user_data', source)
    advance(monkeypatch)
    result = publish(client, pid)
    assert result.status_code == 200
    assert result.json['release']['mode'] == 'demo'
    assert len(result.json['release']['charts']) == 3
    assert call(client, 'get', '/api/research/access', user='admin').json['global_budget']['spent_milli'] == 0
    source.assert_not_called()


def test_real_ledger_flows_into_only_consented_bounded_contributions(client, monkeypatch):
    pid = project(client)
    join(client, pid)
    call(client, 'put', '/api/learning/profile', {'monthly_income': 1000})
    call(client, 'post', '/api/decision/transactions', {'date': '2026-02-10', 'amount': 500,
         'category': '餐饮', 'merchant': '私有商户', 'note': '不应发布的备注'})
    call(client, 'post', '/api/decision/transactions', {'date': '2026-02-10', 'amount': 9000,
         'category': '购物'}, user='bob')
    captured = []
    original = service.release
    def capture(vectors, epsilon):
        captured.extend(vectors)
        return original(vectors, epsilon)
    monkeypatch.setattr(service, 'release', capture)
    advance(monkeypatch)
    result = publish(client, pid)
    assert result.status_code == 200
    assert len(captured) == 1
    assert captured[0][0][2] == captured[0][1][0] == captured[0][2][3] == 1
    assert '私有商户' not in json.dumps(result.json, ensure_ascii=False)
    assert '不应发布的备注' not in json.dumps(result.json, ensure_ascii=False)
    personal = call(client, 'get', '/api/decision/transactions').json['data']['transactions']
    assert personal[0]['amount'] == 500  # DP never mutates the student's ledger


def test_retention_and_no_retroactive_or_open_month_release(client, monkeypatch):
    pid = project(client)
    join(client, pid)
    assert publish(client, pid).status_code == 400
    advance(monkeypatch, '2026-08-01T00:00:00+08:00')
    assert publish(client, pid).status_code == 409
    assert call(client, 'get', '/api/research/participation').json['projects'][0]['consent'] is None
    assert project(client, 'demo')


def test_live_switch_and_grant_date_normalization(client, monkeypatch):
    pid = project(client)
    path = f'/api/research/projects/{pid}'
    call(client, 'put', path + '/members', {'email': 'teacher@example.org', 'expires': '20260228'}, user='admin')
    assert call(client, 'get', path + '/releases', user='teacher').status_code == 200
    advance(monkeypatch, '2026-03-01T00:00:00+08:00')
    assert call(client, 'get', path + '/releases', user='teacher').status_code == 403
    client.application.config['RESEARCH_LIVE_ENABLED'] = False
    assert join(client, pid).status_code == 409
    assert publish(client, pid).status_code == 409
    assert call(client, 'put', path + '/consent', {'participate': False}).status_code == 200


def test_features_bound_each_student_and_preserve_missingness():
    rows = [{'date': '2026-02-10', 'amount': '400', 'category': '餐饮'},
            {'date': '2026-02-10T00:00:00', 'amount': 100, 'category': '私有商户'},
            {'date': '2026-01-01', 'amount': 2000}, {'date': 'bad', 'amount': 20},
            {'date': '2026-02-10', 'amount': 'NaN'}, {'date': '2026-02-10', 'amount': -20}]
    vectors = contribution(rows, 1000, '2026-02')
    assert vectors[0][2] == 1  # 500 included in the second amount bin
    assert vectors[1][0] == .8 and vectors[1][5] == .2
    assert vectors[2][3] == 1
    assert all(sum(v) <= 1 for v in vectors)
    missing = contribution([], None, '2026-02')
    assert missing[0][0] == missing[1][-1] == missing[2][0] == 1


def test_noise_mechanism_sensitivity_and_suppression_use_only_noisy_output(monkeypatch):
    from diffprivlib.mechanisms import Laplace
    mechanism = Laplace(epsilon=1, delta=0, sensitivity=3)
    assert type(mechanism._rng).__name__ == 'SystemRandom'
    seen = []
    def fake(self, value):
        seen.append((self.epsilon, self.sensitivity))
        return 0.0
    monkeypatch.setattr(Laplace, 'randomise', fake)
    result = release([contribution([], None, '2026-02')] * 100, 1)
    assert result['status'] == 'insufficient_signal'
    assert result['charts'] == []
    assert set(seen) == {(1, 3)}
    assert len(seen) == 18

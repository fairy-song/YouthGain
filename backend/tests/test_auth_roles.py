from flask import Flask
from app.routes.auth_routes import auth_bp
from app.services.auth_service import require_admin, require_auth, dev_user_info


def client(monkeypatch):
    from app.services import firestore_service as storage
    monkeypatch.setattr(storage, '_dev_db', {'users': {}})
    monkeypatch.setattr(storage, 'persist_dev_db', lambda: None)
    monkeypatch.setenv('DEV_MODE', 'true')
    monkeypatch.setenv('APP_ENV', 'development')
    monkeypatch.setenv('FLASK_ENV', 'development')
    monkeypatch.setenv('ADMIN_EMAILS', 'admin@youthgain.com')
    app = Flask(__name__)
    app.register_blueprint(auth_bp, url_prefix='/api/auth')

    @app.route('/user')
    @require_auth
    def user(user_info):
        return {'uid': user_info['uid']}

    @app.route('/admin')
    @require_admin
    def admin(user_info):
        return {'role': user_info['role']}

    return app.test_client()


def test_dev_role_consistent(monkeypatch):
    api = client(monkeypatch)
    headers = {'X-Dev-Email': 'ADMIN@youthgain.com'}
    assert api.get('/api/auth/me', headers=headers).json['role'] == 'admin'
    user = api.post('/api/auth/verify_token', headers=headers).json['user']
    assert user['role'] == 'admin'
    assert user['email'] == headers['X-Dev-Email']
    other = api.post('/api/auth/verify_token', headers={'X-Dev-Email': 'someone@example.com'}).json['user']
    assert other['uid'] != user['uid']
    assert api.get('/admin', headers=headers).status_code == 200


def test_user_cannot_access_admin(monkeypatch):
    api = client(monkeypatch)
    assert api.get('/admin', headers={'X-Dev-Email': 'user@example.com'}).status_code == 403


def test_production_disables_dev_header(monkeypatch):
    api = client(monkeypatch)
    monkeypatch.setenv('APP_ENV', 'production')
    assert api.get('/admin', headers={'X-Dev-Email': 'admin@youthgain.com'}).status_code == 401


def test_local_login_preserves_records_and_disabled_accounts_are_blocked(monkeypatch):
    from app.services import firestore_service as storage
    api = client(monkeypatch)
    email = 'demo@youthgain.local'
    with api.application.app_context():
        uid = dev_user_info(email)['uid']
    storage._dev_db['users'][uid] = {'transactions': [{'amount': 18}]}
    response = api.get('/api/auth/me', headers={'X-Dev-Email': email})
    assert response.json['user']['email'] == email
    assert storage._dev_db['users'][uid]['transactions'] == [{'amount': 18}]
    storage._dev_db['users'][uid]['profile']['disabled'] = True
    assert api.get('/api/auth/me', headers={'X-Dev-Email': email}).status_code == 403
    assert api.get('/user', headers={'X-Dev-Email': email}).status_code == 403

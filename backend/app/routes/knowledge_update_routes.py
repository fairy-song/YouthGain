from flask import Blueprint, jsonify, request
from app.services.auth_service import require_admin
from app.services import knowledge_updates as service

knowledge_updates_bp = Blueprint('knowledge_updates', __name__)


@knowledge_updates_bp.errorhandler(ValueError)
def invalid(error):
    return jsonify(message=str(error)), 400


def payload():
    value = request.get_json(silent=True)
    if not isinstance(value, dict):
        raise ValueError('请求内容须为对象')
    return value


@knowledge_updates_bp.get('')
@require_admin
def overview(user_info):
    return jsonify(service.overview())


@knowledge_updates_bp.post('/sources')
@require_admin
def create(user_info):
    return jsonify(source=service.save_source(payload())), 201


@knowledge_updates_bp.put('/sources/<source_id>')
@require_admin
def update(user_info, source_id):
    return jsonify(source=service.save_source(payload(), source_id))


@knowledge_updates_bp.post('/sources/<source_id>/check')
@require_admin
def check(user_info, source_id):
    return jsonify(source=service.check_source(source_id))


@knowledge_updates_bp.post('/versions/<version_id>/review')
@require_admin
def review(user_info, version_id):
    service.review(version_id, payload(), user_info['uid'])
    return jsonify(saved=True)


@knowledge_updates_bp.post('/versions/<version_id>/screen')
@require_admin
def screen(user_info, version_id):
    return jsonify(screening=service.screen_version(version_id))


@knowledge_updates_bp.post('/documents/<document_id>/release')
@require_admin
def release(user_info, document_id):
    service.release(document_id, payload().get('version_id'), user_info['uid'])
    return jsonify(saved=True)

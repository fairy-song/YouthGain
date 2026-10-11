"""Student daily programme discovery and administrator-only editorial tools."""
import sqlite3

from flask import Blueprint, current_app, jsonify, request

from app.services.auth_service import require_auth, require_admin
from app.services import podcast_service as service

podcast_bp = Blueprint('podcasts', __name__)


@podcast_bp.after_request
def private_response(response):
    response.headers['Cache-Control'] = 'no-store'
    return response


@podcast_bp.errorhandler(service.PodcastError)
def invalid(error):
    return jsonify(message=str(error)), error.status


@podcast_bp.errorhandler(sqlite3.Error)
@podcast_bp.errorhandler(RuntimeError)
def unavailable(error):
    current_app.logger.exception('Podcast service unavailable')
    return jsonify(message='节目服务暂时不可用，请稍后重试。'), 503


def payload():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise service.PodcastError('请求内容必须是对象')
    return data


@podcast_bp.get('/today')
@require_auth
def today(user_info):
    return jsonify(service.today_for(user_info['uid']))


@podcast_bp.post('/feedback')
@require_auth
def feedback(user_info):
    data = payload()
    return jsonify(feedback=service.save_feedback(user_info['uid'], data.get('program_id'), data.get('kind')))


@podcast_bp.get('/admin/programs')
@require_admin
def list_programs(user_info):
    return jsonify(programs=service.list_programs())


@podcast_bp.post('/admin/programs')
@require_admin
def add_program(user_info):
    return jsonify(program=service.save_program(payload())), 201


@podcast_bp.put('/admin/programs/<program_id>')
@require_admin
def edit_program(program_id, user_info):
    return jsonify(program=service.save_program(payload(), program_id))


@podcast_bp.post('/admin/programs/<program_id>/review')
@require_admin
def review(program_id, user_info):
    return jsonify(program=service.review(program_id, user_info['uid'], payload().get('approved')))


@podcast_bp.post('/admin/programs/<program_id>/sync')
@require_admin
def sync(program_id, user_info):
    return jsonify(program=service.sync_source(program_id))


@podcast_bp.post('/admin/sync-due')
@require_admin
def sync_due(user_info):
    return jsonify(service.sync_due_sources())

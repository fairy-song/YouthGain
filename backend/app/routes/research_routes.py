"""Separate research permissions; no endpoint returns a participant list."""
import sqlite3
from flask import Blueprint, current_app, jsonify, request, Response
from app.services.auth_service import require_auth, require_admin
from app.services import research_service as service

research_bp = Blueprint('research', __name__)


@research_bp.errorhandler(service.ResearchError)
def invalid(error):
    return jsonify(message=str(error)), error.status


@research_bp.errorhandler(RuntimeError)
@research_bp.errorhandler(sqlite3.Error)
def unavailable(error):
    current_app.logger.exception('Research operation failed')
    return jsonify(message='研究服务暂时不可用，请稍后重试；未完成的发布不会返回新结果。'), 503


def payload():
    value = request.get_json(silent=True)
    if not isinstance(value, dict):
        raise service.ResearchError('请求格式无效')
    return value


@research_bp.after_request
def private_response(response):
    response.headers['Cache-Control'] = 'no-store'
    return response


@research_bp.get('/access')
@require_auth
def access(user_info):
    return jsonify(service.access(user_info))


@research_bp.get('/participation')
@require_auth
def participation(user_info):
    return jsonify(projects=service.student_projects(user_info))


@research_bp.put('/projects/<project_id>/consent')
@require_auth
def consent(project_id, user_info):
    return jsonify(consent=service.consent(user_info, project_id, payload()))


@research_bp.post('/projects')
@require_admin
def create(user_info):
    return jsonify(project=service.create_project(user_info, payload())), 201


@research_bp.put('/projects/<project_id>/members')
@require_admin
def members(project_id, user_info):
    return jsonify(service.membership(user_info, project_id, payload()))


@research_bp.post('/projects/<project_id>/releases')
@require_admin
def publish(project_id, user_info):
    return jsonify(release=service.publish(user_info, project_id, payload().get('month')))


@research_bp.get('/projects/<project_id>/releases')
@require_auth
def releases(project_id, user_info):
    return jsonify(releases=service.releases(user_info, project_id))


@research_bp.get('/projects/<project_id>/releases/<month>/export')
@require_auth
def export(project_id, month, user_info):
    body = service.export_release(user_info, project_id, month)
    return Response(body, mimetype='application/json', headers={
        'Content-Disposition': f'attachment; filename="research-{month}.json"'})

"""Student daily programme discovery and administrator-only editorial tools."""
import sqlite3

from flask import Blueprint, current_app, jsonify, request

from app.services.auth_service import require_auth, require_admin
from app.services import podcast_service as service
from app.services import podcast_pipeline as pipeline, podcast_discovery as discovery

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
    return jsonify(feedback=service.save_feedback(user_info['uid'], data.get('program_id'), data.get('kind'),
        data.get('recommendation_id'), data.get('event_id'), data.get('value', True)))


@podcast_bp.post('/events')
@require_auth
def impression(user_info):
    data = payload()
    if data.get('kind') != 'impression' or not data.get('recommendation_id'):
        raise service.PodcastError('可见曝光需要 impression 类型和推荐ID')
    return jsonify(event=service.save_feedback(user_info['uid'], data.get('program_id'), 'impression',
        data.get('recommendation_id'), data.get('event_id')))


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


@podcast_bp.get('/admin/pipeline')
@require_admin
def pipeline_status(user_info):
    return jsonify(pipeline.dashboard())


@podcast_bp.post('/admin/sources')
@require_admin
def add_source(user_info):
    return jsonify(source=pipeline.register_source(payload(), user_info['uid'])), 201


@podcast_bp.put('/admin/sources/<source_id>')
@require_admin
def edit_source(source_id, user_info):
    from app.services import podcast_store
    with podcast_store.transaction() as conn:
        value = pipeline.source(conn, source_id)
    if not value:
        raise service.PodcastError('来源不存在', 404)
    return jsonify(source=pipeline.register_source({**payload(), 'url': value['url']}, user_info['uid']))


@podcast_bp.post('/admin/sources/<source_id>/sync')
@require_admin
def queue_source(source_id, user_info):
    return jsonify(pipeline.queue_source(source_id)), 202


@podcast_bp.post('/admin/jobs/<job_id>/retry')
@require_admin
def retry_job(job_id, user_info):
    return jsonify(pipeline.retry_job(job_id)), 202


@podcast_bp.post('/admin/discover')
@require_admin
def discover(user_info):
    from app.services import podcast_store
    provider = payload().get('provider')
    if provider not in ('podcastindex', 'listennotes'):
        raise service.PodcastError('请选择目录来源')
    config = 'PODCAST_INDEX_KEY' if provider == 'podcastindex' else 'PODCAST_LISTENNOTES_KEY'
    if not current_app.config.get(config):
        raise service.PodcastError('该目录服务尚未配置密钥', 503)
    with podcast_store.transaction() as conn:
        return jsonify(job_id=pipeline.enqueue(conn, 'discover', provider), state='queued'), 202


@podcast_bp.post('/admin/discoveries')
@require_admin
def submit_discovery(user_info):
    return jsonify(discovery=discovery.submit(payload(), user_info['uid'])), 201


@podcast_bp.post('/admin/discoveries/<discovery_id>/review')
@require_admin
def review_discovery(discovery_id, user_info):
    return jsonify(result=discovery.accept(discovery_id, payload(), user_info['uid']))


@podcast_bp.route('/websub/<source_id>/<token>', methods=['GET', 'POST'])
def websub(source_id, token):
    if request.method == 'GET':
        challenge = discovery.verify_subscription(source_id, token, request.args)
        return current_app.response_class(challenge, mimetype='text/plain', headers={'X-Content-Type-Options': 'nosniff'})
    body = request.stream.read(1024 * 1024 + 1)
    return jsonify(discovery.notification(source_id, token, body,
        request.headers.get('X-Hub-Signature-256') or request.headers.get('X-Hub-Signature'))), 202

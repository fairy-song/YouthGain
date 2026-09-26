"""Authenticated educational coaching; the server determines account identity."""
import logging
from flask import Blueprint, request, jsonify
from app.services.auth_service import require_auth

logger = logging.getLogger(__name__)
coach_bp = Blueprint('coach', __name__)
try:
    from app.services.zhipuai_service import ZhipuAIService
    zhipuai_service = ZhipuAIService()
except Exception:
    logger.exception('Coach initialization failed')
    zhipuai_service = None


@coach_bp.route('/chat', methods=['POST'])
@require_auth
def chat(user_info):
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get('message'), str) or not data['message'].strip() or len(data['message']) > 8000:
        return jsonify(status='error', message='请输入 1–8000 字的消息'), 400
    if not zhipuai_service:
        return jsonify(status='error', message='教练服务暂不可用，仍可继续成长页中的练习。'), 503
    history = data.get('chat_history', [])
    if not isinstance(history, list) or any(not isinstance(m, dict) or m.get('role') not in ('user', 'assistant') or not isinstance(m.get('content'), str) or len(m['content']) > 16000 for m in history):
        return jsonify(status='error', message='对话历史格式无效'), 400
    context = None
    if data.get('use_learning_context') is True:
        try:
            from app.services.learning_store import read_entries
            entries = read_entries(user_info['uid'])
            context = {'source': '用户在青盈保存的资料与最近学习记录；自评并非能力诊断',
                       'profile': next((e for e in entries if e['id'] == 'profile'), {}),
                       'recent_entries': [e for e in entries if e.get('kind') in ('exercise', 'review', 'decision')][:5]}
        except Exception:
            return jsonify(status='error', message='成长记录读取失败。请重试，或关闭引用记录后继续对话。'), 503
    response = zhipuai_service.get_chat_response({'message': data['message'].strip(), 'user_id': user_info['uid'],
                                                  'chat_history': history[-10:], 'learning_context': context})
    return jsonify(response), 200 if response.get('status') == 'success' else 503


@coach_bp.route('/health', methods=['GET'])
def health():
    ready = bool(zhipuai_service and zhipuai_service.client)
    return jsonify(status='ok' if ready else 'unavailable'), 200 if ready else 503

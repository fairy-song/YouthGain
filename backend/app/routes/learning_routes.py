from datetime import datetime, timedelta
from uuid import uuid4
from flask import Blueprint, request, jsonify, current_app
from app.services.auth_service import require_auth
from app.services import learning_store as store
from app.services.learning_service import (
    TOPICS, LESSONS, validate_profile, validate_entry, learning_summary, text_field, enum_field,
)
from app.services.checkin_service import BEIJING
from app.services.user_data_service import user_data_service
from app.services.adaptive_learning import recommend, grade

learning_bp = Blueprint('learning', __name__)


@learning_bp.route('/adaptive', methods=['GET'])
@require_auth
def adaptive(user_info):
    entries = store.read_entries(user_info['uid'])
    profile = next((e for e in entries if e['id'] == 'profile'), {})
    return jsonify(recommend(entries, profile.get('topic', 'budget')))


@learning_bp.route('/adaptive/answer', methods=['POST'])
@require_auth
def adaptive_answer(user_info):
    data = payload()
    record = grade(data.get('item_id'), data.get('choice'))
    # Preserve each submission for audit; recommendation counts unique items only.
    entry = store.write_entry(user_info['uid'], f'diagnostic:{uuid4()}', record)
    return jsonify(entry=entry), 201


@learning_bp.errorhandler(ValueError)
def invalid(error):
    return jsonify(message=str(error)), 400


@learning_bp.errorhandler(Exception)
def unavailable(error):
    current_app.logger.exception('Learning storage operation failed')
    return jsonify(message='暂时无法读写成长记录，请稍后重试。'), 503


def payload():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValueError('请求内容必须是对象')
    return data


@learning_bp.route('', methods=['GET'])
@require_auth
def overview(user_info):
    entries = store.read_entries(user_info['uid'])
    profile = next((e for e in entries if e['id'] == 'profile'), {})
    return jsonify(profile=profile, topics=TOPICS, lessons=LESSONS,
                   entries=[e for e in entries if e['id'] != 'profile'], summary=learning_summary(entries))


@learning_bp.route('/profile', methods=['GET', 'PUT'])
@require_auth
def profile(user_info):
    if request.method == 'GET':
        return jsonify(profile=store.read_entry(user_info['uid'], 'profile') or {})
    updates = payload()
    previous = store.read_entry(user_info['uid'], 'profile') or {}
    validated = validate_profile({**previous, **updates})
    # Updating a learning preference must not erase the financial/onboarding fields.
    validated['balance_confirmed_on'] = (datetime.now(BEIJING).date().isoformat()
                                         if 'current_balance' in updates else previous.get('balance_confirmed_on'))
    validated['balance_recorded_total'] = previous.get('balance_recorded_total')
    if 'current_balance' in updates:
        from app.services.goal_planner import recorded_spending
        rows, error = user_data_service.get_user_data(user_info['uid'], 'transactions', limit=2000)
        if error or len(rows) >= 2000:
            raise RuntimeError('无法读取完整消费记录，余额尚未确认')
        validated['balance_recorded_total'] = recorded_spending(rows, datetime.now(BEIJING).date())
    record = store.write_entry(user_info['uid'], 'profile', validated)
    return jsonify(profile=record)


@learning_bp.route('/entries/<kind>', methods=['POST'])
@require_auth
def save_entry(user_info, kind):
    entry_id, record = validate_entry(kind, payload())
    if entry_id is None:
        entry_id = f'{kind}:{uuid4()}'
    return jsonify(entry=store.write_entry(user_info['uid'], entry_id, record)), 201


@learning_bp.route('/decisions/<entry_id>/outcome', methods=['PUT'])
@require_auth
def outcome(user_info, entry_id):
    record = store.read_entry(user_info['uid'], entry_id)
    if not record or record.get('kind') != 'decision':
        return jsonify(message='找不到这条选择记录'), 404
    data = payload()
    record['outcome'] = enum_field(data, 'outcome', ('met', 'mixed', 'unmet'))
    record['reflection'] = text_field(data, 'reflection', limit=1000)
    return jsonify(entry=store.write_entry(user_info['uid'], entry_id, record))


@learning_bp.route('/upcoming/<entry_id>', methods=['PUT'])
@require_auth
def upcoming_status(user_info, entry_id):
    record = store.read_entry(user_info['uid'], entry_id)
    if not record or record.get('kind') != 'upcoming':
        return jsonify(message='找不到这项开支安排'), 404
    handled = payload().get('handled')
    if type(handled) is not bool:
        raise ValueError('处理状态必须为布尔值')
    record['handled'] = handled
    return jsonify(entry=store.write_entry(user_info['uid'], entry_id, record))


@learning_bp.route('/transactions/<transaction_id>/reflection', methods=['PUT'])
@require_auth
def reflect_transaction(user_info, transaction_id):
    rows, error = user_data_service.get_user_data(user_info['uid'], 'transactions', limit=2000)
    if error:
        raise RuntimeError(error)
    if not any(str(row['id']) == transaction_id for row in rows):
        return jsonify(message='消费记录不存在或不在最近 2000 笔记录中'), 404
    data = payload()
    record = {'kind': 'reflection', 'transaction_id': transaction_id,
              'outcome': enum_field(data, 'outcome', ('met', 'mixed', 'unmet')),
              'reflection': text_field(data, 'reflection', limit=1000)}
    return jsonify(entry=store.write_entry(user_info['uid'], f'reflection:{transaction_id}', record))


@learning_bp.route('/weekly-facts', methods=['GET'])
@require_auth
def weekly_facts(user_info):
    rows, error = user_data_service.get_user_data(user_info['uid'], 'transactions', limit=2000)
    if error:
        raise RuntimeError(error)
    today = datetime.now(BEIJING).date()
    start = today - timedelta(days=today.weekday())
    end = start + timedelta(days=6)
    selected = [r for r in rows if start.isoformat() <= str(r.get('date', ''))[:10] <= today.isoformat()]
    return jsonify(start=start.isoformat(), end=end.isoformat(), count=len(selected),
                   total=round(sum(float(r['amount']) for r in selected), 2),
                   limited=len(rows) >= 2000,
                   message='仅汇总已记录消费，不代表全部支出；没有消费也可以完成复盘。')

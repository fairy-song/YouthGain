"""决策 API 路由。

把 decision_engine 的计算能力暴露给前端。所有数值由引擎以纯函数方式算出，
本层只负责取数据、做格式转换、返回 JSON——不在路由里写任何业务算法。

端点一览::

    GET    /api/decision/report                  完整决策报告（核心）
    POST   /api/decision/opportunity-cost        单笔消费的机会成本（记录时即时反馈）
    GET    /api/decision/transactions            消费记录列表
    POST   /api/decision/transactions            新增消费记录
    DELETE /api/decision/transactions/<id>       删除消费记录
    PUT    /api/decision/transactions/<id>/regret 提交事后回访结果
"""

import logging
from datetime import date, datetime

from flask import Blueprint, request, jsonify

from app.services.auth_service import require_auth
from app.services.decision_engine import Goal, Transaction, build_report, calculate_opportunity_cost, assess_purchase
from app.services.user_data_service import user_data_service

logger = logging.getLogger('decision_routes')

decision_bp = Blueprint('decision_bp', __name__)

MAX_TRANSACTIONS_PER_REPORT = 2000
"""单次报告分析的最大记录数。超过此数量应改为分阶段统计，而非一次性载入。"""

DEFAULT_MONTHLY_INCOME = 2000.0
"""未指定月收入时的兜底值。

TODO: 月收入应作为用户档案的一部分持久化，而不是每次请求由前端传入。
      目前由查询参数提供，仅为过渡方案。
"""


# ============================================================
# 数据转换
# ============================================================

def _parse_date(value):
    """把存储层的日期字段转成 date 对象。无法解析时返回 None。"""
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _to_engine_transaction(row):
    """存储记录 → 引擎的 Transaction。数据不合法时返回 None（跳过该条）。"""
    try:
        amount = float(row.get('amount') or 0)
        if amount <= 0:
            return None
        spent = _parse_date(row.get('date') or row.get('spent_at'))
        if spent is None:
            return None
        hour = row.get('hour')
        return Transaction(
            amount=amount,
            category=row.get('category') or '未分类',
            date=spent,
            merchant=row.get('merchant') or '',
            note=row.get('note') or '',
            hour=int(hour) if hour is not None else None,
            regret=row.get('regret'),
        )
    except (TypeError, ValueError):
        return None


def _to_engine_goal(row):
    """存储记录 → 引擎的 Goal。

    存储层用的是 goals 表的字段名（title / current_amount），
    引擎用的是语义化名称（name / saved_amount），此处做映射。
    """
    try:
        target = float(row.get('target_amount') or 0)
        if target <= 0:
            return None
        return Goal(
            name=row.get('title') or row.get('name') or '未命名目标',
            target_amount=target,
            saved_amount=float(row.get('current_amount') or 0),
            deadline=_parse_date(row.get('deadline')),
        )
    except (TypeError, ValueError):
        return None


def _load_engine_inputs(user_id):
    """读取并转换该用户的消费记录与目标。返回 (transactions, goals, skipped)。"""
    raw_txns, txn_error = user_data_service.get_user_data(
        user_id, 'transactions', limit=MAX_TRANSACTIONS_PER_REPORT)
    if txn_error:
        raise RuntimeError(f"读取消费记录失败: {txn_error}")

    raw_goals, goal_error = user_data_service.get_user_data(user_id, 'goals', limit=100)
    if goal_error:
        # 目标读取失败不足以让整份报告失败，降级为空目标列表
        logger.warning("读取目标失败，报告将不含目标分析: %s", goal_error)
        raw_goals = []

    transactions = [t for t in (_to_engine_transaction(r) for r in raw_txns) if t is not None]
    goals = [g for g in (_to_engine_goal(r) for r in raw_goals) if g is not None]
    skipped = len(raw_txns) - len(transactions)

    return transactions, goals, skipped


# ============================================================
# 报告
# ============================================================

@decision_bp.route('/report', methods=['GET'])
@require_auth
def get_report(user_info):
    """获取完整决策报告。

    查询参数：
        monthly_income  月收入（元），默认 2000
        income_day      每月发生活费的日子（1-31），用于识别发薪后消费集中
        months          统计区间月数，默认按记录跨度自动推算

    响应中的 ``data.report`` 为 DecisionReport 的完整序列化结果。
    """
    user_id = user_info['uid']

    try:
        monthly_income = float(request.args.get('monthly_income', DEFAULT_MONTHLY_INCOME))
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'monthly_income 必须是数字'}), 400

    income_day = request.args.get('income_day')
    if income_day is not None:
        try:
            income_day = int(income_day)
            if not 1 <= income_day <= 31:
                raise ValueError
        except (TypeError, ValueError):
            return jsonify({'status': 'error', 'message': 'income_day 必须是 1-31 之间的整数'}), 400

    try:
        transactions, goals, skipped = _load_engine_inputs(user_id)
    except RuntimeError as e:
        logger.error("加载决策数据失败: %s", e)
        return jsonify({'status': 'error', 'message': str(e)}), 500

    if not transactions:
        # 无消费记录不是错误，是尚未开始使用。返回空态而非 4xx，
        # 前端据此展示引导文案。
        return jsonify({
            'status': 'success',
            'data': {
                'has_data': False,
                'transaction_count': 0,
                'message': '暂无消费记录。记录第一笔消费后即可生成分析报告。',
            }
        }), 200

    try:
        report = build_report(
            transactions,
            goals,
            monthly_income=monthly_income,
            income_day=income_day,
        )
    except ValueError as e:
        return jsonify({'status': 'error', 'message': f'生成报告失败: {e}'}), 400

    warnings = list(report.warnings)
    if skipped:
        warnings.append(f"有 {skipped} 条消费记录因数据不完整被跳过")

    return jsonify({
        'status': 'success',
        'data': {
            'has_data': True,
            'transaction_count': len(transactions),
            'goal_count': len(goals),
            'report': report.to_dict(),
            'warnings': warnings,
        }
    }), 200


@decision_bp.route('/opportunity-cost', methods=['POST'])
@require_auth
def get_opportunity_cost(user_info):
    """计算单笔消费的机会成本，用于记录当下即时反馈。

    请求体::

        {"amount": 800}

    响应::

        {"data": {"amount": 800, "delay_days": 141.2, "surplus_ratio": 4.71,
                  "message": "这笔消费相当于你 141 天的结余"}}

    月结余 <= 0 时返回 409 而非报错：调用方应引导用户先处理入不敷出的问题。
    """
    user_id = user_info['uid']
    payload = request.get_json(silent=True) or {}

    try:
        amount = float(payload.get('amount', 0))
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'amount 必须是数字'}), 400

    if amount < 0:
        return jsonify({'status': 'error', 'message': 'amount 不能为负'}), 400

    try:
        monthly_income = float(payload.get('monthly_income', DEFAULT_MONTHLY_INCOME))
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'monthly_income 必须是数字'}), 400

    transactions, _goals, _skipped = _load_engine_inputs(user_id)

    from app.services.decision_engine import calculate_surplus
    monthly_surplus = calculate_surplus(monthly_income, transactions)

    if monthly_surplus <= 0:
        return jsonify({
            'status': 'unavailable',
            'message': '你目前每月支出不低于收入，机会成本暂时无法计算。'
                       '建议先看看支出结构，找出可以调整的部分。',
            'data': {'monthly_surplus': monthly_surplus},
        }), 409

    cost = calculate_opportunity_cost(amount, monthly_surplus)

    return jsonify({
        'status': 'success',
        'data': {
            **cost.to_dict(),
            'monthly_surplus': monthly_surplus,
            'message': f'这笔消费相当于你 {cost.delay_days:.0f} 天的结余',
        }
    }), 200


# ============================================================
# 消费记录 CRUD
# ============================================================

@decision_bp.route('/transactions', methods=['GET'])
@require_auth
def list_transactions(user_info):
    """列出消费记录，按消费日期倒序。"""
    try:
        limit = min(int(request.args.get('limit', 200)), MAX_TRANSACTIONS_PER_REPORT)
    except (TypeError, ValueError):
        limit = 200

    rows, error = user_data_service.get_user_data(user_info['uid'], 'transactions', limit=limit)
    if error:
        return jsonify({'status': 'error', 'message': error}), 500

    return jsonify({
        'status': 'success',
        'data': {'transactions': rows, 'count': len(rows)}
    }), 200


@decision_bp.route('/transactions', methods=['POST'])
@require_auth
def create_transaction(user_info):
    """新增一笔消费记录。

    请求体::

        {"amount": 25.5, "category": "奶茶", "date": "2026-09-19",
         "merchant": "某奶茶店", "note": "", "hour": 15}

    ``date`` 与 ``amount``、``category`` 为必填。
    """
    payload = request.get_json(silent=True) or {}

    try:
        amount = float(payload.get('amount', 0))
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'amount 必须是数字'}), 400

    if amount <= 0:
        return jsonify({'status': 'error', 'message': '消费金额必须大于 0'}), 400

    category = (payload.get('category') or '').strip()
    if not category:
        return jsonify({'status': 'error', 'message': '消费类别不能为空'}), 400

    spent_at = _parse_date(payload.get('date'))
    if spent_at is None:
        return jsonify({'status': 'error', 'message': '日期格式应为 YYYY-MM-DD'}), 400

    hour = payload.get('hour')
    if hour is not None:
        try:
            hour = int(hour)
            if not 0 <= hour <= 23:
                raise ValueError
        except (TypeError, ValueError):
            return jsonify({'status': 'error', 'message': 'hour 必须是 0-23 之间的整数'}), 400

    record = {
        'amount': amount,
        'category': category,
        'date': spent_at.isoformat(),
        'merchant': (payload.get('merchant') or '').strip(),
        'note': (payload.get('note') or '').strip(),
        'hour': hour,
        'regret': None,
    }

    success, message = user_data_service.save_user_data(
        user_info['uid'], 'transactions', record)
    if not success:
        return jsonify({'status': 'error', 'message': message}), 500

    return jsonify({
        'status': 'success',
        'message': '消费记录已保存',
        'data': record,
    }), 201


@decision_bp.route('/transactions/<transaction_id>', methods=['DELETE'])
@require_auth
def delete_transaction(user_info, transaction_id):
    """删除一笔消费记录。"""
    success, message = user_data_service.delete_user_data(
        user_info['uid'], 'transactions', transaction_id)
    if not success:
        return jsonify({'status': 'error', 'message': message}), 404

    return jsonify({'status': 'success', 'message': message}), 200


@decision_bp.route('/transactions/<transaction_id>/regret', methods=['PUT'])
@require_auth
def submit_regret(user_info, transaction_id):
    """提交事后回访结果——"这笔消费，现在回头看值吗"。

    请求体::

        {"regret": true}

    后悔率是行为改变最强的预测因子之一，且这是用户自己的后悔数据。
    回访产生的 ``regret`` 字段会被 ``detect_patterns`` 用于识别后悔高发的类别。
    """
    payload = request.get_json(silent=True) or {}
    regret = payload.get('regret')

    if not isinstance(regret, bool):
        return jsonify({'status': 'error', 'message': 'regret 必须是布尔值'}), 400

    user_id = user_info['uid']
    # 必须走 update 而非 save：save 是插入语义，会新增一条记录
    # 而不是修改原记录（内存模式下还会覆盖 id）。
    success, message = user_data_service.update_user_data(
        user_id, 'transactions', transaction_id, {'regret': regret})
    if not success:
        return jsonify({'status': 'error', 'message': message or '该消费记录不存在'}), 404

    return jsonify({
        'status': 'success',
        'message': '已记录你的回访结果',
        'data': {'id': transaction_id, 'regret': regret},
    }), 200


# ============================================================
# 单笔消费评估（语音记账/智能评估的数据来源）
# ============================================================

# 刚需类别关键词：命中任一即视为基本生活开支。
# 判断只用于生成解释话术，不参与任何数值计算。
NECESSITY_KEYWORDS = (
    '餐', '饭', '食堂', '房租', '水电', '话费', '网费', '交通', '地铁',
    '公交', '打车', '医疗', '药', '学习', '教材', '书', '打印', '生活用品',
)


def _judge_necessity(category: str, facts: dict, amount: float) -> dict:
    """解释层：判断这笔消费是刚需/可选/建议暂缓，并给出原因。

    判断依据 = 类别（基础） + 预算余量（修正）。数值来自 ``facts``，
    本函数只负责把事实翻译成人话，不参与计算。
    """
    remaining = facts['budget']['remaining']
    is_need = any(k in category for k in NECESSITY_KEYWORDS)

    if is_need:
        if remaining < 0:
            return {
                'level': 'necessary', 'label': '刚需',
                'reason': f'「{category}」属于基本生活开支，但本月预算已超支 '
                          f'¥{abs(remaining):.0f}，建议盘点后续支出、优先保住这笔刚需。',
            }
        return {
            'level': 'necessary', 'label': '刚需',
            'reason': f'「{category}」属于基本生活开支，预算还剩 ¥{remaining:.0f}，'
                      f'不影响月度计划，正常记录。',
        }

    # 非刚需：用预算余量定语气
    if remaining < 0:
        return {
            'level': 'postpone', 'label': '建议暂缓',
            'reason': f'本月预算已超支 ¥{abs(remaining):.0f}，'
                      f'这笔「{category}」属于非刚需，建议先放一放。',
        }
    if remaining < amount:
        return {
            'level': 'postpone', 'label': '建议暂缓',
            'reason': f'这笔 ¥{amount:.0f} 会占掉剩余预算 ¥{remaining:.0f} 的 '
                      f'{amount / remaining:.0%}，后面几天就没有余量了，建议缓一缓。',
        }
    if remaining >= amount * 3:
        return {
            'level': 'optional', 'label': '可选',
            'reason': f'「{category}」属于非刚需消费，但预算余量充足（还剩 ¥{remaining:.0f}），'
                      f'可以买，注意别连续超支就行。',
        }
    return {
        'level': 'optional', 'label': '可选',
        'reason': f'「{category}」属于非刚需消费，预算还剩 ¥{remaining:.0f}，'
                  f'这笔花完要留意后面的开支。',
    }


def _build_advice(necessity: dict, facts: dict, amount: float, category: str) -> tuple[str, str | None]:
    """解释层：生成个性化干预话术与平价建议。

    数据全部来自 ``facts``（引擎输出的事实），话术只是这些事实的措辞。
    """
    similar = facts['similar']
    goal = facts['goal']
    parts: list[str] = []

    # 主句：按合理性定语气
    if necessity['level'] == 'necessary':
        parts.append(f'这笔「{category}」是刚需，正常记录，不用有负罪感。')
    elif necessity['level'] == 'postpone':
        parts.append(f'这笔「{category}」建议先放一放——{necessity["reason"]}')
    else:
        parts.append(f'这笔「{category}」可以消费，但要清楚它在预算里的位置。')

    # 同类消费统计
    if similar['count_this_month'] > 0:
        parts.append(
            f'同类消费本月已有 {similar["count_this_month"]} 笔、共 '
            f'¥{similar["total_this_month"]:.0f}，均价 ¥{similar["avg_amount"]:.0f}。'
        )
        if similar['avg_amount'] and amount > similar['avg_amount'] * 1.5:
            parts.append(f'这笔比同类均价高 {amount / similar["avg_amount"] * 100 - 100:.0f}%，可以看看平价替代。')
        elif similar['avg_amount'] and amount < similar['avg_amount'] * 0.5:
            parts.append('这笔低于同类均价，支出控制得不错。')

    # 储蓄影响
    if goal['has_goal']:
        if goal['months_before'] is not None and goal['months_after'] is not None:
            delta = goal['months_after'] - goal['months_before']
            if delta > 0:
                parts.append(
                    f'储蓄目标「{goal["name"]}」将因此多存 {delta:.1f} 个月'
                    f'（{goal["months_before"]:.1f} → {goal["months_after"]:.1f} 个月）。'
                )
            elif goal['status_before'] != goal['status_after']:
                parts.append(
                    f'这笔会让储蓄目标「{goal["name"]}」从'
                    f'「{goal["status_before"]}」变为「{goal["status_after"]}」。'
                )
            else:
                parts.append(
                    f'不影响储蓄目标「{goal["name"]}」的进度（仍需 {goal["months_after"]:.1f} 个月）。'
                )
        elif goal['status_after'] in ('无法达成', '需延期'):
            parts.append(f'储蓄目标「{goal["name"]}」目前已无法按期达成，这笔会加重负担。')

    # 平价建议（tip）：有同类均价且这笔明显偏高时给对比；否则提示设目标
    tip = None
    if similar['avg_amount'] and amount > similar['avg_amount'] * 1.2:
        tip = (
            f'平价提示：同类消费均价 ¥{similar["avg_amount"]:.0f}，'
            f'这笔比均价多 ¥{amount - similar["avg_amount"]:.0f}，可以比价后再决定。'
        )
    elif not goal['has_goal'] and necessity['level'] != 'necessary':
        tip = '提示：设定一个储蓄目标后，每笔消费都会显示它让你离目标远了多少天。'

    return ' '.join(parts), tip


@decision_bp.route('/assess', methods=['POST'])
@require_auth
def assess_one_purchase(user_info):
    """单笔消费智能评估（语音记账的第三步数据源）。

    请求体::

        {"amount": 27, "category": "饮品", "merchant": "某奶茶店", "note": "..."}

    ``amount``、``category`` 必填，``monthly_income`` 可选（默认 2000）。

    响应 ``data`` 结构::

        {
          "amount": 27.0, "category": "饮品",
          "budget":   {"spent_this_month": 923.0, "remaining": 577.0},
          "surplus":  {"before": 320.0, "after": 293.0, "impact": -27.0},
          "goal":     {"has_goal": true, "name": "换新手机", ...},
          "similar":  {"count_this_month": 2, "total_this_month": 41.0, "avg_amount": 20.5},
          "necessity": {"level": "optional", "label": "可选", "reason": "..."},
          "suggestion": "话术...", "tip": "平价提示..."
        }
    """
    user_id = user_info['uid']
    payload = request.get_json(silent=True) or {}

    try:
        amount = float(payload.get('amount', 0))
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'amount 必须是数字'}), 400
    if amount <= 0:
        return jsonify({'status': 'error', 'message': '消费金额必须大于 0'}), 400

    category = (payload.get('category') or '').strip()
    if not category:
        return jsonify({'status': 'error', 'message': '消费类别不能为空'}), 400

    try:
        monthly_income = float(payload.get('monthly_income', DEFAULT_MONTHLY_INCOME))
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'monthly_income 必须是数字'}), 400

    transactions, goals, _skipped = _load_engine_inputs(user_id)
    goal = goals[0] if goals else None

    try:
        facts = assess_purchase(
            amount, category, monthly_income, transactions, goal)
    except ValueError as e:
        return jsonify({'status': 'error', 'message': f'评估失败: {e}'}), 400

    necessity = _judge_necessity(category, facts, amount)
    suggestion, tip = _build_advice(necessity, facts, amount, category)

    return jsonify({
        'status': 'success',
        'data': {
            **facts,
            'necessity': necessity,
            'suggestion': suggestion,
            'tip': tip,
        }
    }), 200

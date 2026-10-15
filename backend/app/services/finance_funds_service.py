"""SQLite goal envelopes and dated internal transfers, atomically in integer cents."""
import json
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from uuid import uuid4
from zoneinfo import ZoneInfo

from . import podcast_store, learning_store


def now():
    return datetime.now(timezone.utc)


def cents(value, *, signed=False):
    try:
        if isinstance(value, bool) or value is None:
            raise ValueError()
        amount = Decimal(str(value))
        if not amount.is_finite() or abs(amount) > 100000000 or (not signed and amount < 0):
            raise ValueError()
        return int((amount * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError('金额必须为有效数字，绝对值不超过一亿元')


def _json(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, default=str)


def _zone(user_id):
    profile = learning_store.read_entry(user_id, 'profile') or {}
    return ZoneInfo(profile.get('timezone') or 'Asia/Shanghai')


def ensure_goals(user_id, data_service):
    with podcast_store.transaction(write=False) as conn:
        if conn.execute('SELECT 1 FROM finance_goal_migrations WHERE user_id=?', (user_id,)).fetchone():
            return
    # Legacy storage can be remote; do not read it under a SQLite writer lock.
    records, error = data_service.get_user_data(user_id, 'goals', limit=10001, _legacy=True)
    if error or len(records) >= 10001:
        raise RuntimeError('储蓄目标来源读取不完整，未迁移')
    with podcast_store.transaction() as conn:
        if conn.execute('SELECT 1 FROM finance_goal_migrations WHERE user_id=?', (user_id,)).fetchone():
            return
        stamp = now().isoformat()
        for row in records:
            goal = dict(row, id=str(row.get('id') or uuid4()))
            goal['current_amount'] = cents(goal.get('current_amount', 0)) / 100
            if goal.get('status') == 'cancelled':
                goal['current_amount'] = 0
            conn.execute('INSERT INTO finance_goals VALUES(?,?,?)', (user_id, goal['id'], _json(goal)))
            conn.execute('INSERT INTO finance_goal_versions(user_id,goal_id,recorded_at,payload) VALUES(?,?,?,?)',
                         (user_id, goal['id'], stamp, _json(goal)))
        conn.execute('INSERT INTO finance_goal_migrations VALUES(?,?)', (user_id, stamp))
    # Existing envelopes are imported as opening locked balances, not new transfers.


def list_goals(user_id, data_service, limit=10000):
    ensure_goals(user_id, data_service)
    with podcast_store.transaction(write=False) as conn:
        rows = conn.execute('SELECT payload FROM finance_goals WHERE user_id=?', (user_id,)).fetchall()
    records = [json.loads(r['payload']) for r in rows]
    records = [r for r in records if not r.get('deleted')]
    return sorted(records, key=lambda r: str(r.get('updated_at') or r.get('timestamp') or ''), reverse=True)[:limit]


def mutate_goal(user_id, data_service, updates, goal_id=None, *, delete=False, create=False):
    if set(updates) - {'id', 'title', 'description', 'target_amount', 'current_amount', 'progress', 'deadline', 'status', 'category'}:
        raise ValueError('目标更新含不支持的字段')
    ensure_goals(user_id, data_service)
    zone = _zone(user_id)
    with podcast_store.transaction() as conn:
        stamp = now()
        row = conn.execute('SELECT payload FROM finance_goals WHERE user_id=? AND goal_id=?',
                           (user_id, goal_id)).fetchone() if goal_id else None
        old = json.loads(row['payload']) if row else None
        if not create and (not old or old.get('deleted')):
            raise ValueError('目标不存在')
        if create and old:
            raise ValueError('目标ID已存在，请使用更新接口')
        goal_id = goal_id or str(uuid4())
        record = {**(old or {}), **updates, 'id': goal_id}
        if delete:
            record.update(deleted=True, status='cancelled')
        if record.get('status', 'active') not in ('active', 'completed', 'cancelled'):
            raise ValueError('目标状态无效')
        target = cents(record.get('target_amount'))
        if target <= 0 or not isinstance(record.get('title'), str) or not record['title'].strip():
            raise ValueError('请填写目标名称和正数目标金额')
        record['deadline'] = date.fromisoformat(str(record.get('deadline'))[:10]).isoformat()
        locked = 0 if record.get('status') == 'cancelled' else cents(record.get('current_amount', 0))
        previous = cents(old.get('current_amount', 0)) if old else 0
        record.update(target_amount=target / 100, current_amount=locked / 100,
                      status=record.get('status', 'active'), progress=min(100, locked / target * 100),
                      timestamp=(old or {}).get('timestamp', stamp.isoformat()), updated_at=stamp.isoformat())
        if old == record:
            return record
        conn.execute('INSERT INTO finance_goals VALUES(?,?,?) ON CONFLICT(user_id,goal_id) '
                     'DO UPDATE SET payload=excluded.payload', (user_id, goal_id, _json(record)))
        conn.execute('INSERT INTO finance_goal_versions(user_id,goal_id,recorded_at,payload) VALUES(?,?,?,?)',
                     (user_id, goal_id, stamp.isoformat(), _json(record)))
        delta = locked - previous
        if delta:
            conn.execute('INSERT INTO savings_transfers VALUES(?,?,?,?,?,?,?)',
                         (user_id, str(uuid4()), goal_id, stamp.astimezone(zone).date().isoformat(),
                          stamp.isoformat(), delta, _json({'kind': 'internal_savings_transfer'})))
        return record


def set_carryover(user_id, month, amount, event_id=None):
    # Confirm the opening amount, excluding all already locked envelopes.
    date.fromisoformat(str(month) + '-01')
    if str(month) > now().astimezone(_zone(user_id)).strftime('%Y-%m'):
        raise ValueError('不能提前确认未来月份的结转')
    amount = cents(amount, signed=True)
    event_id = event_id or str(uuid4())
    if not isinstance(event_id, str) or not 0 < len(event_id) <= 100:
        raise ValueError('事件ID无效')
    with podcast_store.transaction() as conn:
        previous = conn.execute('SELECT month,amount_cents FROM monthly_carryovers WHERE user_id=? AND event_id=?',
                                (user_id, event_id)).fetchone()
        if previous:
            if previous['month'] != month or previous['amount_cents'] != amount:
                raise ValueError('事件ID已用于其他结转确认')
        else:
            conn.execute('INSERT INTO monthly_carryovers(user_id,event_id,month,amount_cents,recorded_at) VALUES(?,?,?,?,?)',
                         (user_id, event_id, month, amount, now().isoformat()))
    return {'month': month, 'carryover': amount / 100, 'event_id': event_id}


def context_at(user_id, rows, as_of, zone, *, complete=True):
    """Read only versions recorded by as_of; never reconstruct old goals from current rows."""
    stamp = as_of.astimezone(timezone.utc).isoformat()
    today = as_of.astimezone(zone).date()
    month = today.isoformat()[:7]
    with podcast_store.transaction(write=False) as conn:
        migration = conn.execute('SELECT observed_at FROM finance_goal_migrations WHERE user_id=?', (user_id,)).fetchone()
        versions = conn.execute('''SELECT payload FROM finance_goal_versions v WHERE user_id=? AND recorded_at<=?
            AND revision=(SELECT MAX(revision) FROM finance_goal_versions WHERE user_id=v.user_id
                          AND goal_id=v.goal_id AND recorded_at<=?)''', (user_id, stamp, stamp)).fetchall()
        opening = conn.execute('''SELECT * FROM monthly_carryovers WHERE user_id=? AND month<=? AND recorded_at<=?
            ORDER BY month DESC, recorded_at DESC, revision DESC LIMIT 1''', (user_id, month, stamp)).fetchone()
        transfers = conn.execute('SELECT * FROM savings_transfers WHERE user_id=? AND occurred_at<=?',
                                 (user_id, stamp)).fetchall()
    goals_known = bool(migration and migration['observed_at'] <= stamp)
    goals = [json.loads(r['payload']) for r in versions]
    goals = [g for g in goals if not g.get('deleted')]
    locked = sum(cents(g.get('current_amount', 0)) for g in goals) / 100 if goals_known else None
    transfer_month = sum(t['locked_delta_cents'] for t in transfers if t['local_date'][:7] == month)
    carry = opening['amount_cents'] if opening and complete else None
    income = expense = 0
    for row in rows:
        kind = row.get('transaction_type') or 'expense'
        if kind not in ('income', 'expense', 'refund') or row.get('receipt_kind') == 'internal_transfer':
            continue
        raw = row.get('date') or row.get('spent_at')
        text = str(raw)
        if isinstance(raw, datetime) or 'T' in text or ' ' in text:
            moment = raw if isinstance(raw, datetime) else datetime.fromisoformat(text.replace('Z', '+00:00'))
            moment = moment if moment.tzinfo else moment.replace(tzinfo=zone)
            if moment > as_of:
                continue
            day = moment.astimezone(zone).date().isoformat()
        else:
            day = date.fromisoformat(text[:10]).isoformat()
        if day > today.isoformat():
            continue
        amount = cents(row['amount'])
        signed = amount if kind == 'income' or kind == 'refund' else -amount
        if day[:7] == month:
            if kind == 'income':
                income += amount
            else:
                expense += -signed
        elif carry is not None and opening['month'] <= day[:7] < month:
            carry += signed
    if carry is not None:
        carry -= sum(t['locked_delta_cents'] for t in transfers if opening['month'] <= t['local_date'][:7] < month)
    base = carry if carry is not None else 0
    available = (base + income - expense - transfer_month) / 100 if goals_known else None
    return {'carryover_month': None if carry is None else carry / 100,
            'available_remaining_month': available, 'savings_locked_total': locked,
            'savings_net_transfer_month': transfer_month / 100 if goals_known else None,
            'goals': goals, 'goals_complete': goals_known,
            'available_complete': carry is not None,
            'available_reason': None if carry is not None else 'carryover_not_confirmed'}

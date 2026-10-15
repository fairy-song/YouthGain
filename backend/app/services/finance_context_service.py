"""Account-scoped point-in-time features; no merchant names or raw notes."""
import calendar
import math
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from uuid import uuid4
from zoneinfo import ZoneInfo

from . import learning_store, finance_funds_service, goal_planner, podcast_store
from .user_data_service import user_data_service

FEATURE_VERSION = 'finance-context-v2'
ROW_LIMIT = 10000


def now():
    return datetime.now(timezone.utc)


def _observed_by(record, as_of, zone):
    for key in ('updated_at', 'created_at', 'timestamp'):
        value = record.get(key)
        if value:
            try:
                stamp = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace('Z', '+00:00'))
                if (stamp if stamp.tzinfo else stamp.replace(tzinfo=zone)) > as_of:
                    return False
            except (ValueError, TypeError):
                return False
    return True


def _amount(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or amount < 0 or amount > 100000000:
            return None
        return int((amount * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _day(value, zone):
    try:
        if isinstance(value, datetime):
            return value.astimezone(zone).date() if value.tzinfo else value.date()
        raw = str(value)
        if 'T' in raw or ' ' in raw:
            stamp = datetime.fromisoformat(raw.replace('Z', '+00:00'))
            return stamp.astimezone(zone).date() if stamp.tzinfo else stamp.date()
        return date.fromisoformat(raw[:10])
    except (ValueError, TypeError):
        return None


def from_records(rows, goals, entries, as_of, *, transactions_complete=True,
                 goals_complete=True, entries_complete=True, funds=None):
    """Pure computation. Missing=1, observed=0; scaled missing values are zero."""
    sane_entries = [r for r in entries if isinstance(r, dict)]
    entries_complete = entries_complete and len(sane_entries) == len(entries)
    entries = sane_entries
    profile = next((r for r in entries if r.get('id') == 'profile'), {})
    try:
        zone = ZoneInfo(profile.get('timezone') or 'Asia/Shanghai')
    except (ValueError, TypeError, KeyError):
        zone = ZoneInfo('Asia/Shanghai')
    filtered = [r for r in entries if isinstance(r, dict) and _observed_by(r, as_of, zone)]
    if len(filtered) != len(entries):
        entries_complete = False
    entries = filtered
    profile = next((r for r in entries if r.get('id') == 'profile'), {})
    today = as_of.astimezone(zone).date()
    month_start = today.replace(day=1)
    totals = {key: 0 for key in ('actual_income_month', 'net_expense_month',
                               'actual_income_30d', 'net_expense_30d', 'net_expense_7d')}
    valid_count = invalid_count = 0
    categories = {}
    for row in rows:
        if not isinstance(row, dict):
            invalid_count += 1
            continue
        if not _observed_by(row, as_of, zone):
            transactions_complete = False
            continue
        kind = row.get('transaction_type') or 'expense'
        if kind not in ('income', 'expense', 'refund') or row.get('receipt_kind') == 'internal_transfer':
            continue
        spent = _day(row.get('date') or row.get('spent_at'), zone)
        amount = _amount(row.get('amount'))
        if spent is None or amount is None:
            invalid_count += 1
            continue
        if spent > today:
            continue  # Future entries are not actual cash received.
        raw_date = row.get('date') or row.get('spent_at')
        if isinstance(raw_date, datetime) or isinstance(raw_date, str) and ('T' in raw_date or ' ' in raw_date):
            stamp = raw_date if isinstance(raw_date, datetime) else datetime.fromisoformat(raw_date.replace('Z', '+00:00'))
            if (stamp if stamp.tzinfo else stamp.replace(tzinfo=zone)) > as_of:
                continue
        valid_count += 1
        signed = -amount if kind == 'refund' else amount
        if spent >= month_start:
            totals['actual_income_month' if kind == 'income' else 'net_expense_month'] += signed
        if 0 <= (today - spent).days < 30:
            totals['actual_income_30d' if kind == 'income' else 'net_expense_30d'] += signed
            if kind != 'income':
                category = str(row.get('category') or '未分类')[:80]
                categories[category] = categories.get(category, 0) + signed
        if kind != 'income' and 0 <= (today - spent).days < 7:
            totals['net_expense_7d'] += signed
    transaction_known = transactions_complete and valid_count > 0 and invalid_count == 0
    features = {key: value / 100 if transaction_known else None for key, value in totals.items()}
    features['record_count'] = valid_count if transactions_complete else None
    features['recorded_surplus_month'] = (features['actual_income_month'] - features['net_expense_month']
                                          if transaction_known else None)
    for key, source in [('expected_monthly_income', 'monthly_income'),
                        ('confirmed_balance', 'current_balance'),
                        ('essential_monthly', 'essential_monthly'), ('emergency_buffer', 'emergency_buffer')]:
        value = _amount(profile.get(source)) if entries_complete else None
        features[key] = None if value is None else value / 100
    expected = None
    income_day = profile.get('income_day')
    if features['expected_monthly_income'] is not None and isinstance(income_day, int) and not isinstance(income_day, bool) and 1 <= income_day <= 31:
        expected = 0
        cursor = today.replace(day=1)
        end = today + timedelta(days=30)
        while cursor <= end:
            arrival = cursor.replace(day=min(income_day, calendar.monthrange(cursor.year, cursor.month)[1]))
            if today < arrival <= end:
                expected += features['expected_monthly_income']
            cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
    features['expected_income_30d'] = expected
    upcoming, upcoming_invalid = [], False
    for entry in entries:
        if entry.get('kind') != 'upcoming' or entry.get('handled') or entry.get('paid'):
            continue
        due, amount = _day(entry.get('due_date'), zone), _amount(entry.get('amount'))
        if due is None or amount is None:
            upcoming_invalid = True
        elif today <= due <= today + timedelta(days=30):
            upcoming.append((due, amount))
    upcoming_known = entries_complete and not upcoming_invalid
    features['upcoming_30d'] = sum(a for _, a in upcoming) / 100 if upcoming_known else None
    features['upcoming_7d'] = sum(a for d, a in upcoming if d <= today + timedelta(days=7)) / 100 if upcoming_known else None
    features['upcoming_count'] = len(upcoming) if upcoming_known else None
    features['nearest_upcoming_days'] = min((d - today).days for d, _ in upcoming) if upcoming_known and upcoming else None
    active, goals_invalid = [], False
    locked = 0
    for goal in goals:
        if not isinstance(goal, dict) or not _observed_by(goal, as_of, zone):
            goals_complete = False
            continue
        if goal.get('status') != 'cancelled' and not goal.get('deleted'):
            saved_amount = _amount(goal.get('current_amount', 0))
            if saved_amount is None:
                goals_complete = False
            else:
                locked += saved_amount
        if goal.get('status', 'active') != 'active':
            continue
        target, saved = _amount(goal.get('target_amount')), _amount(goal.get('current_amount', 0))
        deadline = _day(goal.get('deadline'), zone)
        if target is None or saved is None or deadline is None:
            goals_invalid = True
        else:
            active.append((max(0, target - saved), (deadline - today).days))
    goal_known = goals_complete and not goals_invalid
    features['active_goal_count'] = len(active) if goal_known else None
    features['goal_remaining'] = sum(a for a, _ in active) / 100 if goal_known else None
    features['nearest_goal_days'] = min(d for _, d in active) if goal_known and active else None
    features['savings_locked_total'] = locked / 100 if goals_complete else None
    for key in ('carryover_month', 'available_remaining_month', 'savings_net_transfer_month'):
        features[key] = (funds or {}).get(key)
    funds_complete = bool(funds and funds.get('available_complete', funds.get('carryover_month') is not None))
    funds_sources_known = bool(funds and transactions_complete and goals_complete and not invalid_count)
    funds_status = {'available_complete': funds_complete and funds_sources_known,
                    'available_estimate': funds.get('available_remaining_month') if funds_sources_known else None,
                    'reason': (funds or {}).get('available_reason') or 'carryover_or_sources_missing'}
    # The UI may show a labelled monthly estimate; the coach and HSTU must not
    # treat an unconfirmed opening balance as an observed spendable balance.
    if not funds_status['available_complete']:
        features['available_remaining_month'] = None
    if funds is not None:
        features['savings_locked_total'] = funds['savings_locked_total']
    features.update(goal_plan_shortfall=None, planned_free_now=None)
    if (goal_known and entries_complete and features['available_remaining_month'] is not None
            and features['savings_locked_total'] is not None
            and all(features[k] is not None for k in ('essential_monthly', 'emergency_buffer', 'expected_income_30d'))):
        try:
            plan_profile = dict(profile, current_balance=features['available_remaining_month'] + features['savings_locked_total'])
            draft = goal_planner.draft_plan(today, goals, plan_profile, entries)
            plan = goal_planner.validate_plan(draft, today)
            result = goal_planner.build_plan(plan, goals)
            features['goal_plan_shortfall'] = result['basic_shortfall'] + sum(g['shortfall'] for g in result['goals'])
            features['planned_free_now'] = result['free_now']
        except (ValueError, TypeError, OverflowError):
            pass
    masks = {key: int(value is None) for key, value in features.items()}
    scaled = {key: 0.0 if value is None else math.copysign(math.log1p(abs(value)), value)
              for key, value in features.items()}
    return {'snapshot_id': str(uuid4()), 'feature_version': FEATURE_VERSION,
            'as_of': as_of.isoformat(), 'timezone': str(zone), 'features': features,
            'missing_mask': masks, 'scaled_features': scaled, 'funds_status': funds_status,
            'category_net_30d': {k: v / 100 for k, v in categories.items()} if transaction_known else {},
            'coverage': {'transactions_complete': transactions_complete, 'goals_complete': goals_complete,
                         'entries_complete': entries_complete, 'invalid_transactions': invalid_count},
            'limitation': '只依据已记录数据；预计收入不是实际到账，收支结余不等于账户余额。'}


def build_snapshot(user_id, as_of=None, entries=None, *, entries_complete=True):
    # Historical inference must load an existing snapshot, never rebuild from current sources.
    if as_of is not None:
        raise ValueError('历史数据只能通过 snapshot_id 读取；新快照自动冻结采集时点')
    if entries is None:
        try:
            entries = learning_store.read_entries(user_id)
        except Exception:
            entries, entries_complete = [], False
    def load(kind):
        try:
            rows, error = user_data_service.get_user_data(user_id, kind, limit=ROW_LIMIT)
            if not isinstance(rows, list):
                return [], False
            return rows or [], not error and len(rows or []) < ROW_LIMIT
        except Exception:
            return [], False
    rows, complete = load('transactions')
    goals, goals_complete = load('goals')
    as_of = now()
    profile = next((r for r in entries if r.get('id') == 'profile'), {})
    try:
        zone = ZoneInfo(profile.get('timezone') or 'Asia/Shanghai')
    except (ValueError, TypeError, KeyError):
        zone = ZoneInfo('Asia/Shanghai')
    as_of = as_of.astimezone(zone)
    funds = None
    try:
        safe_rows = [r for r in rows if isinstance(r, dict) and _observed_by(r, as_of, zone)]
        funds = finance_funds_service.context_at(user_id, safe_rows, as_of, zone,
                                                complete=complete and len(safe_rows) == len(rows))
        goals, goals_complete = funds['goals'], goals_complete and funds['goals_complete']
    except Exception:
        goals_complete = False
    # Freeze only after every source read has finished. No database queries below this point.
    captured = now().astimezone(zone)
    if captured.date() != as_of.date() and funds is not None:
        for key in ('carryover_month', 'available_remaining_month', 'savings_net_transfer_month'):
            funds[key] = None
    as_of = captured
    return from_records(rows, goals, entries, as_of, transactions_complete=complete,
                        goals_complete=goals_complete, entries_complete=entries_complete, funds=funds)


def load_snapshot(user_id, snapshot_id):
    with podcast_store.transaction(write=False) as conn:
        snapshot = podcast_store.read_snapshot(conn, user_id, snapshot_id)
    if snapshot is None:
        raise ValueError('快照不存在或不属于当前用户')
    return snapshot

"""Account-scoped point-in-time features; no merchant names or raw notes."""
import calendar
import math
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from uuid import uuid4
from zoneinfo import ZoneInfo

from . import learning_store
from .user_data_service import user_data_service

FEATURE_VERSION = 'finance-context-v1'
ROW_LIMIT = 10000


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
                 goals_complete=True, entries_complete=True):
    """Pure computation. Missing=1, observed=0; scaled missing values are zero."""
    profile = next((r for r in entries if r.get('id') == 'profile'), {})
    try:
        zone = ZoneInfo(profile.get('timezone') or 'Asia/Shanghai')
    except (ValueError, TypeError, KeyError):
        zone = ZoneInfo('Asia/Shanghai')
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
    for goal in goals:
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
    masks = {key: int(value is None) for key, value in features.items()}
    scaled = {key: 0.0 if value is None else math.copysign(math.log1p(abs(value)), value)
              for key, value in features.items()}
    return {'snapshot_id': str(uuid4()), 'feature_version': FEATURE_VERSION,
            'as_of': as_of.isoformat(), 'timezone': str(zone), 'features': features,
            'missing_mask': masks, 'scaled_features': scaled,
            'category_net_30d': {k: v / 100 for k, v in categories.items()} if transaction_known else {},
            'coverage': {'transactions_complete': transactions_complete, 'goals_complete': goals_complete,
                         'entries_complete': entries_complete, 'invalid_transactions': invalid_count},
            'limitation': '只依据已记录数据；预计收入不是实际到账，收支结余不等于账户余额。'}


def build_snapshot(user_id, as_of, entries=None, *, entries_complete=True):
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
    return from_records(rows, goals, entries, as_of, transactions_complete=complete,
                        goals_complete=goals_complete, entries_complete=entries_complete)

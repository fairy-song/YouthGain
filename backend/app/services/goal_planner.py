"""Dated cash-flow envelopes. All allocations use integer cents, never AI."""
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
import calendar
from datetime import timedelta
from .learning_service import number


def cents(value, label):
    return int((Decimal(str(number(value, label))) * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def recorded_spending(rows, today):
    """Total dated expenses used to reconcile a confirmed balance snapshot."""
    total = 0
    for row in rows:
        day = str(row.get('date') or row.get('spent_at') or '')[:10]
        try:
            parsed = date.fromisoformat(day)
        except ValueError:
            raise ValueError('消费记录日期不完整，请先核对记录')
        if parsed <= today:
            total += cents(row.get('amount'), '消费金额')
    return total


def recorded_spending(rows, today):
    """Total dated expenses used to reconcile a confirmed balance snapshot."""
    total = 0
    for row in rows:
        day = str(row.get('date') or row.get('spent_at') or '')[:10]
        try:
            parsed = date.fromisoformat(day)
        except ValueError:
            raise ValueError('消费记录日期不完整，请先核对记录')
        if parsed <= today:
            total += cents(row.get('amount'), '消费金额')
    return total


def draft_plan(today, goals, profile, entries):
    """Prefill scheduled inputs, never treat expected income as current cash."""
    deadlines = [today]
    for goal in goals:
        if goal.get('status', 'active') == 'active':
            try:
                deadlines.append(date.fromisoformat(str(goal.get('deadline'))[:10]))
            except ValueError:
                pass
    end = min(max(deadlines) + timedelta(days=31), today + timedelta(days=730))
    events = []
    income, day = profile.get('monthly_income'), profile.get('income_day')
    if income and day:
        cursor = today.replace(day=1)
        while cursor <= end:
            arrival = cursor.replace(day=min(int(day), calendar.monthrange(cursor.year, cursor.month)[1]))
            if today < arrival <= end:
                events.append({'date': arrival.isoformat(), 'amount': income, 'kind': 'income'})
            cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
    for entry in entries:
        if entry.get('kind') == 'upcoming' and not entry.get('handled') and today.isoformat() <= entry.get('due_date', '') <= end.isoformat():
            events.append({'date': entry['due_date'], 'amount': entry['amount'], 'kind': 'expense'})
    # Monthly essentials are a budget, not a new transaction. Protect the remaining
    # calendar days proportionally; dated upcoming items are additional commitments.
    essential = profile.get('essential_monthly')
    if essential is not None:
        cursor = today
        while cursor <= end:
            days = calendar.monthrange(cursor.year, cursor.month)[1]
            last = min(cursor.replace(day=days), end)
            amount = cents(essential, '必要开支') * ((last - cursor).days + 1) // days
            if amount:
                events.append({'date': cursor.isoformat(), 'amount': amount / 100, 'kind': 'expense'})
            cursor = last + timedelta(days=1)
    return {'balance': profile.get('current_balance') if profile.get('current_balance') is not None else '',
            'buffer': profile.get('emergency_buffer') if profile.get('emergency_buffer') is not None else 0,
            'end_date': end.isoformat(), 'events': events}


def validate_plan(data, today):
    if not isinstance(data, dict):
        raise ValueError('请填写资金安排')
    try:
        end = date.fromisoformat(data.get('end_date', ''))
    except (ValueError, TypeError):
        raise ValueError('请填写规划截止日')
    if end < today or (end - today).days > 730:
        raise ValueError('规划截止日须在今天至未来两年内')
    result = {'as_of': today.isoformat(), 'end_date': end.isoformat(),
              'balance': cents(data.get('balance'), '当前余额') / 100,
              'buffer': cents(data.get('buffer'), '安全缓冲') / 100, 'events': []}
    events = data.get('events', [])
    if not isinstance(events, list) or len(events) > 200:
        raise ValueError('收支安排最多 200 条')
    for event in events:
        if not isinstance(event, dict) or event.get('kind') not in ('income', 'expense'):
            raise ValueError('请选择收入或必要支出')
        try:
            day = date.fromisoformat(event.get('date', ''))
        except (ValueError, TypeError):
            raise ValueError('收支日期无效')
        if not today <= day <= end:
            raise ValueError('收支日期必须在规划区间内')
        amount = cents(event.get('amount'), '收支金额')
        if amount <= 0:
            raise ValueError('收支金额须大于零')
        result['events'].append({'date': day.isoformat(), 'kind': event['kind'], 'amount': amount / 100})
    return result


def build_plan(plan, goals):
    """Protect every dated essential expense first, then allocate shared capacity.

    Suffix minima ensure later bills cannot spend funds already allocated to goals.
    Goals compete in deadline order. Eligible capacity is allocated proportionally.
    Balance includes existing envelopes; allocations are plans, not transactions.
    """
    start, end = plan['as_of'], plan['end_date']
    active = [g for g in goals if g.get('status', 'active') == 'active']
    parsed = []
    for g in active:
        try:
            deadline = date.fromisoformat(str(g.get('deadline', ''))[:10]).isoformat()
        except ValueError:
            raise ValueError('目标缺少有效付款截止日，请先修正目标')
        if deadline > end:
            raise ValueError('规划截止日必须覆盖所有未完成目标的付款截止日')
        target = cents(g.get('target_amount'), '目标金额')
        saved = cents(g.get('current_amount', 0), '已预留金额')
        parsed.append((deadline, str(g.get('id', '')), g.get('title', '目标'), target, saved))
    reserved = sum(g[4] for g in parsed)
    cash = cents(plan['balance'], '余额') - cents(plan['buffer'], '安全缓冲') - reserved
    events = sorted(plan['events'], key=lambda e: (e['date'], e['kind'] != 'expense'))
    # Expenses precede income on the same date: conservative intraday ordering.
    points = [(start, cash, True)]
    for event in events:
        amount = cents(event['amount'], '金额')
        cash += amount if event['kind'] == 'income' else -amount
        points.append((event['date'], cash, event['kind'] == 'income'))
    suffix, low = [0] * len(points), cash
    for i in range(len(points) - 1, -1, -1):
        low = min(low, points[i][1])
        suffix[i] = max(0, low)
    pools, previous = [], 0
    for i, (day, _, income) in enumerate(points):
        if income:
            capacity = max(0, suffix[i] - previous)
            pools.append({'date': day, 'capacity': capacity, 'remaining': capacity, 'now': i == 0})
            previous = suffix[i]
    basic_gap = max(0, -min(p[1] for p in points))
    rows = []
    for deadline, gid, title, target, saved in sorted(parsed):
        need = max(0, target - saved)
        # Income on the payment date is excluded unless it is already in balance.
        eligible = [p for p in pools if p['now'] or p['date'] < deadline]
        if deadline < start:
            eligible = [p for p in pools if p['now']]
        total = sum(p['remaining'] for p in eligible)
        funded = min(need, total) if not basic_gap else 0
        left, capacity_left = funded, total
        schedule = []
        for pool in eligible:
            amount = left * pool['remaining'] // capacity_left if capacity_left else 0
            capacity_left -= pool['remaining']
            left -= amount
            pool['remaining'] -= amount
            if amount:
                schedule.append({'date': pool['date'], 'amount': amount / 100, 'now': pool['now']})
        rows.append({'id': gid, 'title': title, 'deadline': deadline, 'reserved': saved / 100,
                     'reserve_now': sum(s['amount'] for s in schedule if s['now']),
                     'shortfall': (need - funded) / 100, 'schedule': schedule,
                     'overdue': deadline < start, 'remaining': need / 100})
    now_reserved = sum(r['reserve_now'] for r in rows)
    return {'as_of': start, 'end_date': end, 'reserved': reserved / 100,
            'reserve_now': round(now_reserved, 2),
            'free_now': 0 if basic_gap else round(pools[0]['remaining'] / 100, 2),
            'basic_shortfall': basic_gap / 100, 'goals': rows}

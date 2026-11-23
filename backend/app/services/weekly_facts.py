"""Read-only weekly cash flow, with explicit exclusions and integer-cent totals."""
from datetime import date, timedelta
from .finance_funds_service import cents


def summarize_week(rows, today, *, limited=False):
    start = today - timedelta(days=today.weekday())
    gross = refunds = count = skipped = 0
    for row in rows:
        kind = row.get('transaction_type') or 'expense'
        if kind not in ('expense', 'refund'):
            continue
        try:
            spent_on = date.fromisoformat(str(row.get('date', ''))[:10])
            if not start <= spent_on <= today:
                continue
            amount = cents(row.get('amount'))
            if amount <= 0:
                raise ValueError('zero amount')
        except (ValueError, TypeError):
            skipped += 1
            continue
        count += 1
        if kind == 'expense':
            gross += amount
        else:
            refunds += amount
    return dict(start=start.isoformat(), end=(start + timedelta(days=6)).isoformat(),
                count=count, gross_expense=gross / 100, refunds=refunds / 100,
                total=(gross - refunds) / 100, skipped=skipped, limited=limited,
                complete=not limited and skipped == 0,
                message='仅汇总已记录消费，不代表全部支出；没有消费也可以完成复盘。')

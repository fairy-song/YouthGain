import { hasAvailableFunds } from './availableFunds';
import { latestReview } from './spendingJourney';

// This chooses a navigation action, never a financial judgement or a model score.
export function pendingPayments(entries) {
  return (Array.isArray(entries) ? entries : []).filter(e => e.kind === 'upcoming' && !e.handled)
    .slice().sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')) || String(a.id).localeCompare(String(b.id)));
}

export function todayPriority({ entries, ledger, today, ledgerError, entriesError }) {
  if (entriesError) return { kind: 'retry-upcoming', title: '先核对待支付事项', text: '开支安排暂未读到，重试后再看下一步。', label: '重试开支' };
  if (!entries) return { kind: 'loading', title: '正在核对接下来的安排' };
  const payments = pendingPayments(entries);
  const overdue = payments.find(e => e.due_date && e.due_date < today);
  if (overdue) return { kind: 'overdue', title: '先核对一笔过期事项', text: overdue.title, date: overdue.due_date,
    amount: overdue.amount, count: payments.filter(e => e.due_date < today).length, label: '核对待支付事项', to: '/dashboard?tab=upcoming' };
  const near = payments.find(e => e.due_date && e.due_date >= today &&
    (Date.parse(`${e.due_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000 <= 7);
  if (near) return { kind: 'upcoming', title: near.due_date === today ? '今天有一笔钱要留' : '先留意最近一笔付款',
    text: near.title, date: near.due_date, amount: near.amount, label: '查看付款安排', to: '/dashboard?tab=upcoming' };
  if (ledgerError) return { kind: 'retry-ledger', title: '先读回你的账本', text: '暂时无法确认资金情况，重试不会改动记录。', label: '重试账本' };
  if (!ledger) return { kind: 'loading', title: '正在核对已记录的资金' };
  const flow = ledger.monthly_cashflow;
  if (flow?.complete && flow.has_expense_records === false && flow.has_income_records === false)
    return { kind: 'first', title: '先记一笔你关心的花费', text: '金额、类别、日期就能开始。', label: '记一笔', to: '/dashboard' };
  if (!hasAvailableFunds(ledger.funds)) return { kind: 'funds', title: '先核对手里的钱', text: '收支记录保留着，确认期初资金后再看可用剩余。', label: '核对资金', to: '/dashboard?funds=confirm' };
  if (ledger.funds.available_remaining_month < 0) return { kind: 'shortfall', title: '先核对这笔资金缺口', text: '按已记录资料，可用剩余为负；先检查结转和收支。', label: '核对资金', to: '/dashboard?funds=confirm' };
  const review = latestReview(entries);
  if (review) return { kind: 'continue', title: '继续你上次的安排', text: review.next_action, label: '回看上次行动', to: '/learning?tab=review' };
  return { kind: 'spending', title: '看清一笔累计花费', text: '把记录展开成钱，再决定要不要调整。', label: '看见花费' };
}

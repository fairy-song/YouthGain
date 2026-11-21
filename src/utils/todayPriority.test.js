import { todayPriority, pendingPayments } from './todayPriority';
const today = '2026-11-21';
const funds = { available_complete: true, complete: true, available_remaining_month: 1000 };
const base = { entries: [], ledger: { funds }, today };
const due = (id, date, handled = false) => ({ id, kind: 'upcoming', title: id, amount: 800, due_date: date, handled });
test('unhandled overdue survives sorting and does not mutate source rows', () => {
  const entries = [due('later', '2026-11-25'), due('old', '2026-10-01'), due('paid', '2026-09-01', true)];
  expect(pendingPayments(entries).map(e => e.id)).toEqual(['old', 'later']);
  expect(entries[0].id).toBe('later');
  expect(todayPriority({ ...base, entries })).toMatchObject({ kind: 'overdue', text: 'old', date: '2026-10-01', to: '/dashboard?tab=upcoming&item=old' });
});
test('requires source reads and never substitutes a task for a failed or pending read', () => {
  expect(todayPriority({ ...base, entries: undefined }).kind).toBe('loading');
  expect(todayPriority({ ...base, entriesError: true }).kind).toBe('retry-upcoming');
  expect(todayPriority({ ...base, ledgerError: true }).kind).toBe('retry-ledger');
});
test('seven-day boundary is inclusive but does not overtake overdue items', () => {
  expect(todayPriority({ ...base, entries: [due('near', '2026-11-28')] }).kind).toBe('upcoming');
  expect(todayPriority({ ...base, entries: [due('far', '2026-11-29')] }).kind).toBe('spending');
  expect(todayPriority({ ...base, entries: [due('now', today), due('old', '2026-11-20')] }).kind).toBe('overdue');
});
test('zero is confirmed, negative funds get a check, and missing funds never look spendable', () => {
  expect(todayPriority({ ...base, ledger: {} }).kind).toBe('funds');
  expect(todayPriority({ ...base, ledger: { funds: { ...funds, available_remaining_month: 0 } } }).kind).toBe('spending');
  expect(todayPriority({ ...base, ledger: { funds: { ...funds, available_remaining_month: -1 } } }).kind).toBe('shortfall');
});
test('new records and saved action lead to the matching existing route', () => {
  expect(todayPriority({ ...base, ledger: { monthly_cashflow: { complete: true, has_expense_records: false, has_income_records: false } } })).toMatchObject({ kind: 'first', to: '/dashboard' });
  expect(todayPriority({ ...base, entries: [{ kind: 'review', next_action: '周日核对车费' }] })).toMatchObject({ kind: 'continue', text: '周日核对车费', to: '/learning?tab=review' });
});


test('item destinations encode an id rather than allowing it to change the route', () => {
  const action = todayPriority({ ...base, entries: [due('item?&=#', '2026-11-20')] });
  expect(action.to).toBe('/dashboard?tab=upcoming&item=item%3F%26%3D%23');
});

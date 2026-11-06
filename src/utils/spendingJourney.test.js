import { latestReview, spendingObservation, spendingSnapshot } from './spendingJourney';

const cashflow = { complete: true, month: '2026-11', spent: 60.2, category_breakdown: [
  { category: '餐饮', gross_expense: 100.3, refunds: 20.1, net: 80.2 },
  { category: '购物', gross_expense: 10, refunds: 30, net: -20 },
] };

test('uses full-month exact cents and preserves negative refund categories', () => {
  const value = spendingSnapshot(cashflow);
  expect(value.spent).toBe(6020);
  expect(value.rows.map(row => row.net)).toEqual([8020, -2000]);
  expect(spendingObservation(value, value.rows[0], 'surprised')).toContain('净支出 80.20 元');
  expect(spendingObservation(value, value.rows[0], '')).toBe('');
});

test.each([
  null, { ...cashflow, complete: false }, { ...cashflow, month: '2026-13' },
  { ...cashflow, spent: null }, { ...cashflow, spent: 61 },
  { ...cashflow, category_breakdown: [{ ...cashflow.category_breakdown[0], net: 60.2 }] },
  { ...cashflow, category_breakdown: [{ ...cashflow.category_breakdown[0], refunds: -1 }] },
  { ...cashflow, category_breakdown: [cashflow.category_breakdown[0], cashflow.category_breakdown[0]] },
])('rejects incomplete or inconsistent summaries (%#)', value => {
  expect(spendingSnapshot(value)).toBeNull();
});

test('distinguishes recorded empty month from missing data', () => {
  expect(spendingSnapshot({ complete: true, month: '2026-11', spent: 0, category_breakdown: [] })).toEqual({ month: '2026-11', spent: 0, rows: [] });
});

test('finds the latest saved action without requiring daily participation', () => {
  expect(latestReview([{ kind: 'review', week: '2026-09-01', next_action: '旧行动' },
    { kind: 'review', week: '2026-10-12', next_action: '查看必要开支' }, { kind: 'decision', next_action: '无关' }]).next_action).toBe('查看必要开支');
  expect(latestReview(null)).toBeNull();
});

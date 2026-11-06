import { parseProjectionAmount, projectLivingFunds } from './livingFundsProjection';

test('cross-month projection excludes payday and identifies the first shortfall separately from the final balance', () => {
  const input = {
    today: '2026-10-28', startingCents: 60000, dailyCents: 2000,
    expenses: [
      { date: '2026-10-28', cents: 12900 },
      { date: '2026-10-31', cents: 20000 },
      { date: '2026-11-09', cents: 100 },
      { date: '2026-11-12', cents: 50000 },
    ],
  };
  const normal = projectLivingFunds({ ...input, payday: '2026-11-09' });
  expect(normal).toMatchObject({ days: 12, balanceCents: 3100, firstShortfall: null });
  const delayed = projectLivingFunds({ ...input, payday: '2026-11-12' });
  expect(delayed).toMatchObject({
    days: 15, balanceCents: -3000, firstShortfall: { date: '2026-11-10', cents: 1000 },
  });
  expect(delayed.timeline.at(-1).date).toBe('2026-11-11');
});

test('does not guess dates, precision or an unbounded projection period', () => {
  expect(parseProjectionAmount('38.50')).toBe(3850);
  expect(parseProjectionAmount('0')).toBe(0);
  expect(parseProjectionAmount('-1.23', { signed: true })).toBe(-123);
  for (const value of ['', '1e3', '0.005', '-1']) expect(parseProjectionAmount(value)).toBeNull();
  const base = { today: '2026-02-28', startingCents: 200 };
  for (const payday of ['2026-02-29', '2026-02-28', '2027-01-01', '']) {
    expect(projectLivingFunds({ ...base, payday })).toBeNull();
  }
});

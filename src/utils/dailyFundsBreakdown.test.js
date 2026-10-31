import { dailyFundsBreakdown, fundsDateKey } from './dailyFundsBreakdown';

const snapshot = (date, amount = 4386, timezone = 'Asia/Shanghai') => ({
  available_remaining_month: amount, available_complete: true, complete: true,
  month: date.slice(0, 7), as_of: date, timezone,
});

test.each([
  ['2026-10-02T12:00:00+08:00', 30, 14620],
  ['2026-10-28T12:00:00+08:00', 4, 109650],
  ['2026-10-31T12:00:00+08:00', 1, 438600],
  ['2028-02-28T12:00:00+08:00', 2, 219300],
  ['2027-02-28T12:00:00+08:00', 1, 438600],
])('uses inclusive calendar days for %s', (date, days, dailyCents) => {
  expect(dailyFundsBreakdown(snapshot(date), new Date(date))).toMatchObject({ status: 'ready', remainingDays: days, dailyCents });
});

test.each([null, '', '100', true, NaN, Infinity, Number.MAX_SAFE_INTEGER])('rejects invalid amount %s', amount => {
  const date = '2026-10-28T12:00:00+08:00';
  expect(dailyFundsBreakdown(snapshot(date, amount), new Date(date)).status).toBe('invalid');
});

test('rounds the source to cents then floors daily cents without mutating funds', () => {
  const date = '2026-10-29T12:00:00+08:00';
  const funds = Object.freeze(snapshot(date, 100));
  expect(dailyFundsBreakdown(funds, new Date(date))).toMatchObject({ dailyCents: 3333 });
  expect(dailyFundsBreakdown(snapshot(date, .01), new Date(date))).toMatchObject({ status: 'ready', dailyCents: 0 });
});

test('validates completeness before zero or negative amounts', () => {
  const date = '2026-10-28T12:00:00+08:00';
  for (const amount of [0, -10]) {
    expect(dailyFundsBreakdown({ ...snapshot(date, amount), available_complete: false }, new Date(date)).status).toBe('incomplete');
  }
  expect(dailyFundsBreakdown(snapshot(date, 0), new Date(date)).status).toBe('zero');
  expect(dailyFundsBreakdown(snapshot(date, -10), new Date(date))).toEqual({ status: 'negative', amountCents: -1000 });
});

test('uses the account day across UTC midnight and DST rather than elapsed hours', () => {
  const date = '2026-11-01T00:10:00-04:00';
  const funds = snapshot(date, 300, 'America/New_York');
  expect(dailyFundsBreakdown(funds, new Date('2026-11-02T03:30:00Z'))).toMatchObject({ status: 'ready', remainingDays: 30, dailyCents: 1000 });
  expect(dailyFundsBreakdown(funds, new Date('2026-11-02T05:01:00Z')).status).toBe('stale');
  expect(fundsDateKey(new Date('2026-10-27T16:30:00Z'), 'Asia/Shanghai')).toBe('2026-10-28');
});

test.each([
  { timezone: undefined }, { timezone: 'Invalid/Zone' }, { as_of: 'bad' },
  { as_of: '2026-10-28T12:00:00' }, { month: '2026-09' },
  { as_of: '2026-02-30T12:00:00+08:00', month: '2026-02' },
  { as_of: '2026-10-28T24:00:00+08:00' },
])('rejects invalid snapshot metadata %j', changes => {
  const date = '2026-10-28T12:00:00+08:00';
  expect(dailyFundsBreakdown({ ...snapshot(date), ...changes }, new Date(date)).status).toBe('invalid-time');
});

test('rejects old/future local dates and invalid current time', () => {
  const funds = snapshot('2026-10-28T12:00:00+08:00');
  expect(dailyFundsBreakdown(funds, new Date('2026-10-29T00:00:00+08:00')).status).toBe('stale');
  expect(dailyFundsBreakdown(funds, new Date('2026-10-27T12:00:00+08:00')).status).toBe('stale');
  expect(dailyFundsBreakdown(funds, new Date('bad')).status).toBe('invalid-time');
});

import { expenseMoney } from './expenseMoney';

test('38 yuan uses actual banknote and coin denominations', () => {
  expect(expenseMoney(38)).toEqual({ cents: 3800, pieces: [
    { cents: 2000, count: 1, kind: 'note' }, { cents: 1000, count: 1, kind: 'note' },
    { cents: 500, count: 1, kind: 'note' }, { cents: 100, count: 3, kind: 'coin' },
  ] });
});

test('all represented cents sum exactly, including fractional yuan and large amounts', () => {
  for (const cents of [1, 5, 10, 50, 99, 101, 3867, 99999, 10000000000,
    ...Array.from({ length: 300 }, (_, i) => i * 37 + 1)]) {
    const result = expenseMoney((cents / 100).toFixed(2));
    expect(result.pieces.reduce((sum, piece) => sum + piece.cents * piece.count, 0)).toBe(cents);
    expect(result.pieces.length).toBeLessThanOrEqual(10);
  }
});

test.each([null, undefined, true, false, '', ' ', '1e3', 'NaN', NaN, Infinity, 0, -1, .001, '1.001', 100000001])('does not invent money for invalid value %s', value => {
  expect(expenseMoney(value)).toBeNull();
});

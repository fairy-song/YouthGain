const DENOMINATIONS = [10000, 5000, 2000, 1000, 500, 100, 50, 10, 5, 1];

export function expenseMoney(amount) {
  if (!['number', 'string'].includes(typeof amount) || (typeof amount === 'string' && !/^\d+(?:\.\d{1,2})?$/.test(amount))) return null;
  const value = Number(amount);
  const cents = Math.round(value * 100);
  if (!Number.isFinite(value) || value <= 0 || value > 100000000 || !Number.isSafeInteger(cents) || cents <= 0 || Math.abs(value - cents / 100) > 1e-8) return null;
  let remaining = cents;
  const pieces = [];
  for (const denomination of DENOMINATIONS) {
    const count = Math.floor(remaining / denomination);
    if (count) pieces.push({ cents: denomination, count, kind: denomination >= 500 ? 'note' : 'coin' });
    remaining %= denomination;
  }
  return { cents, pieces };
}

export const expenseYuan = cents => `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const denominationText = cents => `${cents >= 100 ? cents / 100 : (cents / 100).toFixed(cents % 10 ? 2 : 1)}元`;

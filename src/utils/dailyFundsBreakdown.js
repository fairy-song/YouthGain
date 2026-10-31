export function fundsDateKey(value, timeZone) {
  if (typeof timeZone !== 'string' || !timeZone || !(value instanceof Date) || !Number.isFinite(value.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(value);
    const get = type => parts.find(part => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return null;
  }
}

export function dailyFundsBreakdown(funds, now = new Date()) {
  if (!funds || funds.available_complete !== true || funds.complete !== true) {
    return { status: 'incomplete', reason: funds?.reason };
  }
  const amount = funds.available_remaining_month;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || !Number.isSafeInteger(Math.round(amount * 100))) {
    return { status: 'invalid' };
  }
  // A timezone is mandatory; never interpret an unzoned timestamp in device time.
  const timestampParts = typeof funds.as_of === 'string' && funds.as_of.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!timestampParts) {
    return { status: 'invalid-time' };
  }
  const [, y, m, d, h, minute, second] = timestampParts.map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(y, m - 1, d);
  if (m < 1 || m > 12 || d < 1 || calendar.getUTCMonth() !== m - 1 || h > 23 || minute > 59 || second > 59) return { status: 'invalid-time' };
  const snapshotDate = fundsDateKey(new Date(funds.as_of), funds.timezone);
  const today = fundsDateKey(now, funds.timezone);
  if (!snapshotDate || !today || funds.month !== snapshotDate.slice(0, 7)) return { status: 'invalid-time' };
  if (snapshotDate !== today) return { status: 'stale', today };
  const [year, month, day] = snapshotDate.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const remainingDays = daysInMonth - day + 1;
  if (!Number.isInteger(remainingDays) || remainingDays < 1 || remainingDays > 31) return { status: 'invalid-time' };
  const amountCents = Math.round(amount * 100);
  if (amount < 0) return { status: 'negative', amountCents };
  if (amount === 0) return { status: 'zero', amountCents: 0 };
  return { status: 'ready', amountCents, remainingDays, dailyCents: Math.floor(amountCents / remainingDays) };
}

export const formatFundsCents = cents => `¥${(cents / 100).toLocaleString('zh-CN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;

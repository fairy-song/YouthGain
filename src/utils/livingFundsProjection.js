const DAY_MS = 86400000;
export const MAX_PROJECTION_DAYS = 90;

function dayIndex(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return NaN;
  const date = new Date(`${key}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key
    ? date.getTime() / DAY_MS : NaN;
}

export function calendarDaysBetween(from, to) {
  return dayIndex(to) - dayIndex(from);
}

export function shiftCalendarDay(key, days) {
  return new Date((dayIndex(key) + days) * DAY_MS).toISOString().slice(0, 10);
}

export function parseProjectionAmount(raw, { signed = false } = {}) {
  const value = String(raw ?? '').trim();
  const pattern = signed ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/;
  if (!pattern.test(value)) return null;
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (cents > 10000000000 || !Number.isSafeInteger(cents)) return null;
  return value.startsWith('-') && cents ? -cents : cents;
}

export function projectLivingFunds({ today, payday, startingCents, dailyCents = 0, expenses = [] }) {
  const days = calendarDaysBetween(today, payday);
  if (!Number.isInteger(days) || days < 1 || days > MAX_PROJECTION_DAYS ||
      !Number.isSafeInteger(startingCents) || !Number.isSafeInteger(dailyCents) || dailyCents < 0) return null;

  const amountsByDate = new Map();
  for (const { date, cents } of expenses) {
    const offset = calendarDaysBetween(today, date);
    if (!Number.isInteger(offset) || offset < 0 || !Number.isSafeInteger(cents) || cents < 0) return null;
    if (offset >= days) continue;
    const amount = (amountsByDate.get(date) || 0) + cents;
    if (!Number.isSafeInteger(amount)) return null;
    amountsByDate.set(date, amount);
  }

  const timeline = [];
  let balanceCents = startingCents;
  let firstShortfall = null;
  for (let offset = 0; offset < days; offset += 1) {
    const date = shiftCalendarDay(today, offset);
    const plannedCents = amountsByDate.get(date) || 0;
    balanceCents -= plannedCents + dailyCents;
    if (!Number.isSafeInteger(balanceCents)) return null;
    timeline.push({ date, plannedCents, balanceCents });
    if (balanceCents < 0 && !firstShortfall) firstShortfall = { date, cents: -balanceCents };
  }
  return { days, payday, balanceCents, firstShortfall, timeline };
}

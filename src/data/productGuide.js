const memory = new Map();
const key = owner => `qingying:product-guide:v1:${encodeURIComponent(owner || 'guest')}`;

export function readGuide(owner) {
  const id = key(owner);
  if (memory.has(id)) return memory.get(id);
  try {
    const value = JSON.parse(localStorage.getItem(id));
    if (value && Number.isInteger(value.step) && value.step >= 0 && value.step <= 2 &&
        ['active', 'done', 'skipped'].includes(value.status)) return value;
  } catch (_) { /* The guide remains usable without browser storage. */ }
  return null;
}

export function saveGuide(owner, step, status = 'active') {
  const value = { step, status };
  memory.set(key(owner), value);
  try { localStorage.setItem(key(owner), JSON.stringify(value)); } catch (_) { /* Keep this tab's state. */ }
}

export function needsGuide(owner, ledger, entries) {
  const saved = readGuide(owner);
  return Boolean(owner && (!saved || saved.status === 'active') &&
    ledger?.monthly_cashflow?.complete === true &&
    ledger.monthly_cashflow.has_expense_records === false &&
    ledger.monthly_cashflow.has_income_records === false &&
    Array.isArray(ledger.transactions) && ledger.transactions.length === 0 &&
    Array.isArray(entries) && entries.length === 0);
}

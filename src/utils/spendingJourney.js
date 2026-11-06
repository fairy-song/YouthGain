// Read the server's full-month aggregate, never infer a month from paginated rows.
const cents = value => {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const number = Number(value);
  const rounded = Math.round(number * 100);
  return Number.isFinite(number) && Math.abs(number) <= 100000000 && Number.isSafeInteger(rounded)
    && Math.abs(number - rounded / 100) < 1e-8 ? rounded : null;
};

export function spendingSnapshot(cashflow) {
  if (cashflow?.complete !== true || !/^\d{4}-(0[1-9]|1[0-2])$/.test(cashflow.month || '')
    || !Array.isArray(cashflow.category_breakdown)) return null;
  const spent = cents(cashflow.spent);
  if (spent === null) return null;
  const rows = [];
  const names = new Set();
  for (const part of cashflow.category_breakdown) {
    if (!part || typeof part.category !== 'string' || !part.category.trim() || names.has(part.category)) return null;
    const gross = cents(part.gross_expense), refunds = cents(part.refunds), net = cents(part.net);
    if ([gross, refunds, net].includes(null) || gross < 0 || refunds < 0 || gross - refunds !== net) return null;
    names.add(part.category);
    rows.push({ category: part.category, gross, refunds, net });
  }
  if (rows.reduce((sum, part) => sum + part.net, 0) !== spent) return null;
  return { month: cashflow.month, spent, rows: rows.sort((a, b) => b.net - a.net || a.category.localeCompare(b.category)) };
}

export const perceptionLabels = { expected: '在我的预期内', surprised: '比我预想的多', unsure: '我还不确定' };

export function spendingObservation(snapshot, row, perception) {
  if (!snapshot || !row || !perceptionLabels[perception]) return '';
  return `${snapshot.month} 已记录的「${row.category}」支出 ${(row.gross / 100).toFixed(2)} 元，退款 ${(row.refunds / 100).toFixed(2)} 元，净支出 ${(row.net / 100).toFixed(2)} 元。我的感受：${perceptionLabels[perception]}。记录可能不完整。`;
}

export function latestReview(entries) {
  return (Array.isArray(entries) ? entries : []).filter(entry => entry.kind === 'review' && typeof entry.next_action === 'string' && entry.next_action.trim())
    .sort((a, b) => String(b.updated_at || b.week || '').localeCompare(String(a.updated_at || a.week || '')))[0] || null;
}

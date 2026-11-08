// Display eligibility only. Accounting remains on the server.
export const hasAvailableFunds = funds => funds?.available_complete === true && funds.complete !== false &&
  typeof funds.available_remaining_month === 'number' && Number.isFinite(funds.available_remaining_month);

export const formatMoney = value => value == null || !Number.isFinite(Number(value)) ? '—' :
  `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

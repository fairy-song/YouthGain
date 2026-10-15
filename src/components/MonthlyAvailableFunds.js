import React, { useState } from 'react';
import { authenticatedApi } from '../services/api';

export const AVAILABLE_NOTE = '上月结转结余 + 本月实际收入 − 本月净支出 − 本月净储蓄划拨；为日常可支配资金，不包含已锁定的储蓄资金。';
const money = value => value == null ? '尚未确认' : `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MonthlyAvailableFunds({ funds, editable = false, onSaved }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
      const month = `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`;
      await authenticatedApi.post('/decision/funds/carryover', {
        month: funds?.month || month,
        amount: Number(amount), event_id: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      onSaved?.();
    } catch (err) { setError(err?.response?.data?.message || '结转保存失败，请重试。'); }
    finally { setBusy(false); }
  };
  return <div className="ledger-metric">
    <span className="ledger-summary-label">本月可用剩余</span>
    <strong className="ledger-summary-amount">{money(funds?.available_remaining_month)}{!funds?.available_complete && funds?.available_remaining_month != null && <small className="text-muted ms-1" style={{fontWeight:400}}>（估算）</small>}</strong>
    <small>{AVAILABLE_NOTE}</small>
    <details><summary>查看资金口径</summary>
      <p>上月结转：{money(funds?.carryover_month)} · 本月净储蓄划拨：{money(funds?.savings_net_transfer_month)}</p>
      <p>储蓄锁定总资金：{money(funds?.savings_locked_total)}。已从可用剩余中扣除。</p>
      {!funds?.available_complete && <p className="text-warning">上月结转尚未确认，当前数字按本月收支减去储蓄划拨估算。确认结转后即为精确值。</p>}
      {editable && <form onSubmit={save}>
        <label>确认本月期初日常结转（已排除锁定资金）<input type="number" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <button type="submit" disabled={busy}>{busy ? '保存中…' : '保存结转'}</button>
        {error && <p role="alert">{error}</p>}
      </form>}
    </details>
  </div>;
}

import React, { useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { supplementBillPurchase } from '../../services/api';
import { dateKey } from '../FinanceVisuals';

export const purchaseValue = (purchase, source) => purchase.source && purchase.source !== source
  ? `${purchase.source}::${purchase.source_transaction_id}` : purchase.source_transaction_id;

export default function ImportPurchaseEditor({ label, source, value, purchases, disabled, onChange, onAdded, onError, onBusyChange }) {
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ source, transaction_id: '', date: dateKey(), amount: '', category: '', merchant: '' });
  const options = [...new Map(purchases.map(row => [purchaseValue(row, source), row])).values()];
  const filtered = options.filter(row => purchaseValue(row, source) === value ||
    [row.date, row.amount, row.merchant, row.category, row.source_transaction_id].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  const choose = token => {
    const match = options.find(row => purchaseValue(row, source) === token);
    onChange(match?.source_transaction_id || '', match?.source || source);
  };
  const supplement = async () => {
    setSaving(true);
    onBusyChange?.(true);
    try {
      const row = await supplementBillPurchase(draft);
      await onAdded(row);
      onChange(row.source_transaction_id, row.source);
      setAdding(false);
    } catch (error) { onError(error?.response?.data?.message || error?.message || '原支出保存失败'); }
    finally { setSaving(false); onBusyChange?.(false); }
  };
  return <div style={{ minWidth: 230 }}>
    <Form.Control size="sm" aria-label={`${label}搜索`} placeholder="搜商户、日期、金额或交易号" value={search} disabled={disabled || saving} onChange={e => setSearch(e.target.value)} />
    <Form.Select className="mt-1" size="sm" aria-label={label} value={value || ''} disabled={disabled || saving} onChange={e => choose(e.target.value)}>
      <option value="">选择原支出</option>{filtered.map(row => <option key={purchaseValue(row, source)} value={purchaseValue(row, source)}>{row.date} · {row.merchant || row.category} · ¥{row.amount} · {row.source_transaction_id}{row.source === 'manual' ? '（手动记录）' : ''}</option>)}
    </Form.Select>
    <Button size="sm" variant="link" disabled={disabled || saving} onClick={() => setAdding(!adding)}>{adding ? '取消补录' : '找不到？补录原支出'}</Button>
    {adding && <div className="border rounded p-2 mt-1">
      <small>补录会新增一笔支出；先检查已有记录。重复原交易号不会重复记账。</small>
      <Form.Select size="sm" aria-label={`${label}补录来源`} value={draft.source} onChange={e => setDraft({ ...draft, source: e.target.value })} disabled={saving}><option value="wechat">微信支付</option><option value="standard">标准账单</option></Form.Select>
      {[['transaction_id', '原交易号'], ['date', '原支出日期'], ['amount', '原支付金额'], ['category', '原支出类别'], ['merchant', '原支出商户']].map(([key, title]) => <Form.Control className="mt-1" size="sm" key={key} aria-label={`${label}${title}`} placeholder={title} type={key === 'date' ? 'date' : key === 'amount' ? 'number' : 'text'} step={key === 'amount' ? '0.01' : undefined} value={draft[key]} maxLength={key === 'category' ? 50 : 100} disabled={saving} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />)}
      <Button size="sm" variant="outline-success" className="mt-2" disabled={saving || !draft.transaction_id.trim() || !draft.category.trim() || !draft.date || !(Number(draft.amount) > 0)} onClick={supplement}>{saving ? '保存中…' : '确认补录并关联'}</Button>
      <small className="d-block mt-1">没有原交易号时，可先手动记账，再从搜索结果中选择。未关联的退款不计收入。</small>
    </div>}
  </div>;
}

import React, { useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { createBillCategory, updateBillCategory } from '../../services/api';

export const accountingLabels = { expense: '支出', income: '收入', refund: '退款', transfer: '本人划转', review: '待核对（不统计）' };
export const allowedAccountingTypes = row => {
  const original = row.original_transaction_type || row.transaction_type;
  if (original === 'expense') return ['expense', 'review'];
  if (original === 'refund') return ['refund', 'review'];
  return original === 'income' || ['income', '收入', 'neutral'].includes(row.direction)
    ? ['income', 'refund', 'transfer', 'review'] : ['expense', 'transfer', 'review'];
};

// 每行只负责选择分类；新增入口统一放在预览页工具栏。
export default function CustomBillCategorySelect({ label, row, change = {}, options, disabled, onChange }) {
  const types = allowedAccountingTypes(row);
  const value = change.category_id ?? ((change.receipt_kind || change.category) ? '' : row.category_id || '');
  const listed = options.filter(option => types.includes(option.accounting_type) && (option.active || option.id === value));
  if (value && !listed.some(option => option.id === value)) listed.push({ id: value, name: row.category, accounting_type: row.transaction_type, active: false });
  return <div className="mt-1">
    <Form.Select size="sm" aria-label={label} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}><option value="">使用系统选项</option>{listed.map(option => <option key={option.id} value={option.id} disabled={!option.active}>{option.name} · {accountingLabels[option.accounting_type]}{!option.active ? '（已停用）' : ''}</option>)}</Form.Select>
  </div>;
}

// 弹窗按需挂载：每次打开都是新表单，保存失败时保留输入供用户修改。
export function BillCategoryCreateModal({ defaultType = 'expense', onClose, onCreated, onBusyChange }) {
  const [name, setName] = useState('');
  const [type, setType] = useState(defaultType);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const create = async event => {
    event.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true);
    setError('');
    onBusyChange?.(true);
    try {
      const option = await createBillCategory({ name: name.trim(), accounting_type: type });
      // 等待父组件更新共享分类列表，再关闭弹窗；不自动更改任何账单行。
      await onCreated(option);
      onClose();
    } catch (error) { setError(error?.response?.data?.message || error?.message || '分类保存失败'); }
    finally { setSaving(false); onBusyChange?.(false); }
  };
  return <Modal show centered onHide={() => { if (!saving) onClose(); }} backdrop={saving ? 'static' : true} keyboard={!saving} aria-labelledby="bill-category-create-title">
    <Modal.Header closeButton={!saving}><Modal.Title id="bill-category-create-title">新增自定义分类</Modal.Title></Modal.Header>
    <Form onSubmit={create}>
      <Modal.Body>
        {error && <Alert variant="danger" role="alert">{error}</Alert>}
        <Form.Group controlId="bill-category-name" className="mb-3"><Form.Label>分类名称</Form.Label><Form.Control autoFocus placeholder="例如：奖学金、家人生活费" maxLength={50} value={name} disabled={saving} onChange={e => setName(e.target.value)} /></Form.Group>
        <Form.Group controlId="bill-category-type"><Form.Label>账务类型</Form.Label><Form.Select value={type} disabled={saving} onChange={e => setType(e.target.value)}>{Object.entries(accountingLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Form.Select></Form.Group>
        <p className="small text-muted mt-2 mb-0">类型决定金额如何计算，保存后不可修改。新增后可在每行选择，或应用到已选记录。</p>
      </Modal.Body>
      <Modal.Footer><Button variant="outline-secondary" disabled={saving} onClick={onClose}>取消</Button><Button type="submit" variant="success" disabled={saving || !name.trim()}>{saving ? '保存中…' : '保存分类'}</Button></Modal.Footer>
    </Form>
  </Modal>;
}

export function BillCategoryManager({ options, disabled, onUpdated, onError, onBusyChange }) {
  const [names, setNames] = useState({});
  const [saving, setSaving] = useState('');
  const save = async (option, values) => {
    setSaving(option.id);
    onBusyChange?.(true);
    try { onUpdated(await updateBillCategory(option.id, values)); }
    catch (error) { onError(error?.response?.data?.message || error?.message || '分类修改失败'); }
    finally { setSaving(''); onBusyChange?.(false); }
  };
  return <details className="mt-3"><summary>管理我的自定义分类（{options.length}）</summary>
    <p className="small text-muted mt-2">重命名只影响以后选择的名称；历史记录保留当时名称和金额。停用后不能新选，可再次启用。</p>
    {!options.length && <p className="small text-muted">暂无自定义分类，可通过“自定义分类”按钮新增。</p>}
    {options.map(option => <div className="d-flex flex-wrap gap-2 align-items-center mb-2" key={option.id}>
      <Form.Control size="sm" style={{ maxWidth: 220 }} aria-label={`重命名分类 ${option.name}`} value={names[option.id] ?? option.name} maxLength={50} disabled={disabled || !!saving} onChange={e => setNames({ ...names, [option.id]: e.target.value })} />
      <span className="small">{accountingLabels[option.accounting_type]}</span>
      <Button size="sm" variant="outline-secondary" disabled={disabled || !!saving || !names[option.id]?.trim() || names[option.id] === option.name} onClick={() => save(option, { name: names[option.id] })}>保存名称</Button>
      <Button size="sm" variant="outline-secondary" disabled={disabled || !!saving} onClick={() => save(option, { active: !option.active })}>{option.active ? '停用' : '启用'}</Button>
    </div>)}
  </details>;
}

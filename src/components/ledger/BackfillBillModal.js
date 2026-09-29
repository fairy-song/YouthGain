import React, { useRef, useState } from 'react';
import { Alert, Button, Col, Form, Modal, Row } from 'react-bootstrap';
import { createTransaction } from '../../services/api';
import { dateKey } from '../FinanceVisuals';

export function pastDate(days = 1, today = dateKey()) {
  return dateKey(new Date(new Date(`${today}T12:00:00+08:00`).getTime() - days * 86400000));
}

export default function BackfillBillModal({ onClose, onSaved }) {
  const [draft, setDraft] = useState({ date: pastDate(), amount: '', category: '餐饮', merchant: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [refreshFailed, setRefreshFailed] = useState(false);
  const saving = useRef(false);
  const yesterday = pastDate();
  const change = (key, value) => { setDraft(previous => ({ ...previous, [key]: value })); setError(''); };
  const refresh = async () => {
    try { await onSaved(); setRefreshFailed(false); }
    catch { setRefreshFailed(true); }
  };
  const submit = async event => {
    event.preventDefault();
    if (saving.current) return;
    setError(''); setSuccess('');
    const parsed = new Date(`${draft.date}T12:00:00+08:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !Number.isFinite(parsed.getTime()) || dateKey(parsed) !== draft.date || draft.date > yesterday) {
      setError('请选择今天之前的实际消费日期；今天的消费请使用“记一笔”。'); return;
    }
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) { setError('请输入大于 0 且不超过一亿元的金额。'); return; }
    saving.current = true; setBusy(true);
    try {
      await createTransaction({ ...draft, amount, merchant: draft.merchant.trim(), note: draft.note.trim() });
      setSuccess(`已补记 ${draft.date} 的${draft.category}支出 ¥${amount.toFixed(2)}。`);
      setDraft(previous => ({ ...previous, amount: '', merchant: '', note: '' }));
      await refresh();
    } catch (e) { setError(e?.response?.data?.message || e?.message || '补记失败，请重试。'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <Modal show onHide={() => { if (!busy) onClose(); }} backdrop={busy ? 'static' : true} keyboard={!busy} centered aria-labelledby="backfill-title">
    <Modal.Header closeButton={!busy}><Modal.Title id="backfill-title">补记账单</Modal.Title></Modal.Header>
    <Form onSubmit={submit}>
      <Modal.Body>
        <p className="text-muted small">按实际消费日期补录，不会记成今天的支出。</p>
        {success && <Alert variant="success" role="status">{success} 可以继续补记，或完成返回账本。</Alert>}
        {error && <Alert variant="danger">{error}</Alert>}
        {refreshFailed && <Alert variant="warning">账单已保存，但账本刷新失败，请勿重复提交。<Button type="button" variant="link" disabled={busy} onClick={async () => { setBusy(true); await refresh(); setBusy(false); }}>只刷新账本</Button></Alert>}
        <fieldset disabled={busy}>
          <Form.Group controlId="backfill-date" className="mb-3"><Form.Label>实际消费日期</Form.Label>
            <div className="d-flex gap-2 mb-2">{[[1, '昨天'], [2, '前天'], [7, '一周前']].map(([days, label]) => <Button type="button" key={days} size="sm" variant={draft.date === pastDate(days) ? 'success' : 'outline-secondary'} aria-pressed={draft.date === pastDate(days)} onClick={() => change('date', pastDate(days))}>{label}</Button>)}</div>
            <Form.Control type="date" required max={yesterday} value={draft.date} onChange={e => change('date', e.target.value)} />
          </Form.Group>
          <Row><Col xs={6}><Form.Group controlId="backfill-amount" className="mb-3"><Form.Label>金额（元）</Form.Label><Form.Control type="number" required min="0.01" max="100000000" step="0.01" value={draft.amount} onChange={e => change('amount', e.target.value)} /></Form.Group></Col>
            <Col xs={6}><Form.Group controlId="backfill-category" className="mb-3"><Form.Label>消费类别</Form.Label><Form.Select value={draft.category} onChange={e => change('category', e.target.value)}>{['餐饮', '交通', '购物', '娱乐', '学习', '房租', '话费', '医疗', '其他'].map(category => <option key={category}>{category}</option>)}</Form.Select></Form.Group></Col></Row>
          <Form.Group controlId="backfill-merchant" className="mb-3"><Form.Label>商户（可选）</Form.Label><Form.Control maxLength={100} value={draft.merchant} onChange={e => change('merchant', e.target.value)} placeholder="例如：学校食堂" /></Form.Group>
          <Form.Group controlId="backfill-note"><Form.Label>备注（可选）</Form.Label><Form.Control maxLength={500} as="textarea" rows={2} value={draft.note} onChange={e => change('note', e.target.value)} /></Form.Group>
        </fieldset>
        <p className="small text-muted mt-3 mb-0">较早的账单可能不在最近 50 笔列表或近七天图表中。</p>
      </Modal.Body>
      <Modal.Footer><Button type="button" variant="outline-secondary" disabled={busy} onClick={onClose}>{success ? '完成' : '取消'}</Button><Button type="submit" variant="success" disabled={busy}>{busy ? '保存中…' : '保存补记账单'}</Button></Modal.Footer>
    </Form>
  </Modal>;
}

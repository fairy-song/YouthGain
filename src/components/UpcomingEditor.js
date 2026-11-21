import React, { useEffect, useRef, useState } from 'react';
import { Button, Form } from 'react-bootstrap';

export default function UpcomingEditor({ entry, onSave, onCancel, onReload, busy, error }) {
  const [draft, setDraft] = useState({ title: entry.title, amount: String(entry.amount), due_date: entry.due_date });
  const title = useRef(null);
  useEffect(() => { title.current?.focus(); }, []);
  return <Form className="w-100 border-top mt-2 pt-2" aria-label="调整待支付事项" onSubmit={event => {
    event.preventDefault(); if (!busy) onSave({ ...draft, expected_updated_at: entry.updated_at ?? null });
  }}>
    <fieldset disabled={busy}>
      <label className="d-block mb-2">事项<input ref={title} className="form-control" required maxLength={100} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
      <label className="d-block mb-2">待支付金额（元）<input className="form-control" type="number" required min="0.01" max="100000000" step="0.01" value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value })} /></label>
      <label className="d-block mb-2">预计付款日期<input className="form-control" type="date" required value={draft.due_date} onChange={e => setDraft({ ...draft, due_date: e.target.value })} /></label>
      <p className="small text-muted">部分付款后，请核对尚需预留的金额；这里只调整计划，不修改账单。</p>
      {error && <div><p role="alert">{error}</p><p className="small">读取最新安排会替换本次输入，请先核对需要保留的内容。</p><Button type="button" variant="outline-secondary" onClick={onReload}>读取最新安排</Button></div>}
      <Button type="submit">{busy ? '保存中…' : '保存调整'}</Button>
      <Button type="button" variant="link" onClick={onCancel}>取消调整</Button>
    </fieldset>
  </Form>;
}

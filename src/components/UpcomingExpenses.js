import React, { useEffect, useState, useRef } from 'react';
import { Alert, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap';
import UpcomingEditor from './UpcomingEditor';
import { getLearning, saveLearningEntry, updateUpcoming, editUpcoming, learningError } from '../services/learning';

export default function UpcomingExpenses({ onRecordExpense, selectedEntryId }) {
  const rowNodes = useRef(new Map());
  const focused = useRef(null);
  const [editing, setEditing] = useState(null);
  const [entries, setEntries] = useState(null);
  const [upcoming, setUpcoming] = useState({ title: '', amount: '', due_date: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    getLearning().then(data => { if (active) setEntries(data.entries); }).catch(e => { if (active) setError(learningError(e)); });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    if (!selectedEntryId || focused.current === selectedEntryId) return;
    const node = rowNodes.current.get(selectedEntryId);
    if (node) { node.focus(); node.scrollIntoView?.({ block: 'center' }); focused.current = selectedEntryId; }
  }, [entries, selectedEntryId]);
  const run = async (action, message) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await action(); setNotice(message); window.dispatchEvent(new Event('learning-saved'));
      try { setEntries((await getLearning()).entries); }
      catch { setError('更改已保存，列表刷新失败，请重新加载，避免重复提交。'); }
    } catch (e) { setError(learningError(e)); }
    finally { setBusy(false); }
  };
  const upcomingEntries = (entries || []).filter(e => e.kind === 'upcoming').sort((a,b) => Number(a.handled) - Number(b.handled) || a.due_date.localeCompare(b.due_date));
  return <Card className="border-0 shadow-sm"><Card.Body className="p-4">
    {error && <Alert variant="warning">{error}<Button variant="link" disabled={busy || !!editing} onClick={() => setRetry(v => v + 1)}>重新加载</Button></Alert>}
    {notice && <Alert variant="success" role="status">{notice}</Alert>}
    {!entries && !error && <Spinner role="status" />}
      <h3 className="h5">未来开支</h3><p className="text-muted small">在消费选择和复盘时提醒自己。不发送站外通知。</p>
      <Form onSubmit={e => { e.preventDefault(); run(async () => { await saveLearningEntry('upcoming', upcoming); setUpcoming({ title: '', amount: '', due_date: '' }); }, '开支安排已保存。'); }}>
        <Row className="g-2 mb-3">
          <Col md={5}><Form.Control required aria-label="未来开支事项" placeholder="例如：考试费" maxLength={100} value={upcoming.title} onChange={e => setUpcoming({ ...upcoming, title: e.target.value })} /></Col>
          <Col md={3}><Form.Control required aria-label="未来开支金额" placeholder="预计金额（元）" type="number" min="0.01" max="100000000" step="0.01" value={upcoming.amount} onChange={e => setUpcoming({ ...upcoming, amount: e.target.value })} /></Col>
          <Col md={4}><Form.Control required aria-label="未来开支日期" type="date" value={upcoming.due_date} onChange={e => setUpcoming({ ...upcoming, due_date: e.target.value })} /></Col>
        </Row><Button type="submit" variant="outline-primary" disabled={busy || !!editing}>保存开支安排</Button>
      </Form>
      {entries && selectedEntryId && !upcomingEntries.some(e => String(e.id) === selectedEntryId) && <p role="status">未在当前账户找到这项安排，请核对下面的列表。</p>}
      {upcomingEntries.map(e => <article key={e.id} tabIndex={-1} aria-label={e.title}
        ref={node => { if (node) rowNodes.current.set(String(e.id), node); else rowNodes.current.delete(String(e.id)); }}
        className={`d-flex flex-wrap align-items-center justify-content-between border-bottom py-2${String(e.id) === selectedEntryId ? ' border border-success rounded px-2' : ''}`}>
        <span>{e.due_date} · {e.title} · ¥{e.amount} {e.handled && '（已处理）'}</span>
        <div className="d-flex flex-wrap">
          {!e.handled && <Button variant="link" disabled={busy || !!editing} onClick={() => { setError(''); setEditing(e); }}>调整安排</Button>}
          {!e.handled && onRecordExpense && <Button variant="link" disabled={busy || !!editing} onClick={() => onRecordExpense(e)}>去记这笔支出</Button>}
          {!e.handled && <details><summary>已记账或无需支付？</summary><p className="small text-muted">确认这项安排已处理后结束预留，不会自动记账。</p><Button variant="link" disabled={busy || !!editing} onClick={() => run(() => updateUpcoming(e.id, true), '已标记处理；如已付款且尚未记账，可去记这笔支出。')}>标记已处理</Button></details>}
          {e.handled && onRecordExpense && <details><summary>已处理但还没记账？</summary><p className="small text-muted">先检查账本，避免重复记录。</p><Button variant="link" disabled={busy || !!editing} onClick={() => onRecordExpense(e)}>去记这笔支出</Button></details>}
          {e.handled && <Button variant="link" disabled={busy || !!editing} onClick={() => run(() => updateUpcoming(e.id, false), '已恢复提醒。')}>恢复提醒</Button>}
        </div>
        {String(editing?.id) === String(e.id) && <UpcomingEditor key={`${e.id}:${editing.updated_at}`} entry={editing} busy={busy} error={error}
          onReload={() => run(async () => {
            const data = await getLearning();
            const latest = data.entries.find(row => String(row.id) === String(e.id) && row.kind === 'upcoming');
            if (!latest || latest.handled) throw new Error('事项已处理或已不存在，请取消调整后核对列表。');
            setEntries(data.entries); setEditing(latest);
          }, '已读取最新安排，请重新核对后保存。')}
          onCancel={() => { setEditing(null); setError(''); }} onSave={details => run(async () => {
            const updated = await editUpcoming(e.id, details);
            setEntries(rows => rows.map(row => String(row.id) === String(updated.id) ? updated : row));
            setEditing(null);
          }, '安排已调整，资金规划将使用新的待支付金额和日期。')} />}
      </article>)}
    {entries && !upcomingEntries.length && <p className="text-muted mt-3">暂无安排，可以先记下一笔考试费、房租或订阅续费。</p>}
    <p className="small text-muted mt-3">标记已处理不会自动记账，也不会自动扣除预算。</p>
  </Card.Body></Card>;
}

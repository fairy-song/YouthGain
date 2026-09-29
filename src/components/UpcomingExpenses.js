import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap';
import { getLearning, saveLearningEntry, updateUpcoming, learningError } from '../services/learning';

export default function UpcomingExpenses() {
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
    {error && <Alert variant="warning">{error}<Button variant="link" disabled={busy} onClick={() => setRetry(v => v + 1)}>重新加载</Button></Alert>}
    {notice && <Alert variant="success" role="status">{notice}</Alert>}
    {!entries && !error && <Spinner role="status" />}
      <h3 className="h5">未来开支</h3><p className="text-muted small">在消费选择和复盘时提醒自己。不发送站外通知。</p>
      <Form onSubmit={e => { e.preventDefault(); run(async () => { await saveLearningEntry('upcoming', upcoming); setUpcoming({ title: '', amount: '', due_date: '' }); }, '开支安排已保存。'); }}>
        <Row className="g-2 mb-3">
          <Col md={5}><Form.Control required aria-label="未来开支事项" placeholder="例如：考试费" maxLength={100} value={upcoming.title} onChange={e => setUpcoming({ ...upcoming, title: e.target.value })} /></Col>
          <Col md={3}><Form.Control required aria-label="未来开支金额" placeholder="预计金额（元）" type="number" min="0.01" max="100000000" step="0.01" value={upcoming.amount} onChange={e => setUpcoming({ ...upcoming, amount: e.target.value })} /></Col>
          <Col md={4}><Form.Control required aria-label="未来开支日期" type="date" value={upcoming.due_date} onChange={e => setUpcoming({ ...upcoming, due_date: e.target.value })} /></Col>
        </Row><Button type="submit" variant="outline-primary" disabled={busy}>保存开支安排</Button>
      </Form>
      {upcomingEntries.map(e => <div key={e.id} className="d-flex flex-wrap align-items-center justify-content-between border-bottom py-2"><span>{e.due_date} · {e.title} · ¥{e.amount} {e.handled && '（已处理）'}</span><Button variant="link" disabled={busy} onClick={() => run(() => updateUpcoming(e.id, !e.handled), e.handled ? '已恢复提醒。' : '已标记处理；实际支出请另行记账。')}>{e.handled ? '恢复提醒' : '标记已处理'}</Button></div>)}
    {entries && !upcomingEntries.length && <p className="text-muted mt-3">暂无安排，可以先记下一笔考试费、房租或订阅续费。</p>}
    <p className="small text-muted mt-3">标记已处理不会自动记账，也不会自动扣除预算。</p>
  </Card.Body></Card>;
}

import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Form, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { getAdaptiveLearning, submitAdaptiveAnswer, learningError } from '../services/learning';

export default function AdaptivePractice() {
  const [data, setData] = useState(null);
  const [itemId, setItemId] = useState('');
  const [choice, setChoice] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const load = async () => {
    setBusy(true); setError('');
    try {
      const result = await getAdaptiveLearning();
      if (mounted.current) { setData(result); setItemId(result.next_item?.id || result.items[0]?.id || ''); setChoice(''); }
    } catch (e) { if (mounted.current) setError(learningError(e)); }
    finally { if (mounted.current) setBusy(false); }
  };
  // Each account gets a fresh component instance from Learning.
  useEffect(() => { mounted.current = true; load(); return () => { mounted.current = false; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const item = data?.items.find(i => i.id === itemId);
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    let saved = false;
    try {
      const result = await submitAdaptiveAnswer({ item_id: item.id, choice: Number(choice) });
      saved = true;
      if (!mounted.current) return;
      window.dispatchEvent(new Event('learning-saved'));
      setFeedback(result); setChoice('');
      const updated = await getAdaptiveLearning();
      if (mounted.current) setData(updated);
    } catch (e) { if (mounted.current) setError(saved ? '答案已保存，但推荐刷新失败，请刷新推荐。' : learningError(e)); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <Card className="border-0 shadow-sm mb-4"><Card.Body className="p-4">
    <h2 className="h4">找到下一步适合自己的练习</h2>
    <p className="text-muted">先做一个小情境，系统会依据你的答案解释下一步建议。也可以自行选择其他题目。</p>
    {error && <Alert variant="danger" role="alert">{error} <Button variant="link" disabled={busy} onClick={load}>刷新推荐</Button></Alert>}
    {!data && busy && <Spinner animation="border" role="status"><span className="visually-hidden">加载情境</span></Spinner>}
    {data && <>
      <details className="mb-3"><summary>为什么推荐这个练习？</summary><Alert variant="light">{data.reason}<div className="small mt-2">{data.limitation}</div></Alert>
      <ul className="small">{data.states.map(s => <li key={s.topic}>{s.title}：{s.status}（已观察 {s.observed} 道不同题目）</li>)}</ul>
      </details>
      {data.next_item && <Button variant="outline-primary" className="mb-3" disabled={busy} onClick={() => { setItemId(data.next_item.id); setChoice(''); setFeedback(null); }}>尝试推荐情境</Button>}
      <Form.Group controlId="adaptive-item" className="mb-3"><Form.Label>选择情境</Form.Label><Form.Select value={itemId} disabled={busy} onChange={e => { setItemId(e.target.value); setChoice(''); setFeedback(null); }}>{data.items.map(i => <option key={i.id} value={i.id}>{i.level} · {i.question}</option>)}</Form.Select></Form.Group>
      {item && <Form onSubmit={submit}>
        <fieldset disabled={busy}><legend className="h6">{item.question}</legend>
          {item.options.map((option, index) => <Form.Check key={`${item.id}-${index}`} id={`adaptive-choice-${index}`} type="radio" name="adaptive-choice" label={option} value={index} checked={choice === String(index)} onChange={e => setChoice(e.target.value)} className="mb-2" />)}
          <Button type="submit" disabled={choice === '' || busy}>{busy ? '保存中…' : '查看反馈并保存'}</Button>
        </fieldset>
      </Form>}
      {feedback && <Alert variant={feedback.correct ? 'success' : 'info'} className="mt-3" role="status"><strong>{feedback.correct ? '这次抓住了关键条件。' : '可以再看看这个条件。'}</strong><p className="mt-2">你的选择：{feedback.evidence}</p><p>{feedback.explanation}</p><Button as={Link} variant="link" to="/coach" state={{ returnTo: '/learning?tab=practice', prompt: `我在做金融学习情境。我的选择：${feedback.evidence}。题目反馈：${feedback.explanation}。请换一个新情境帮助我理解。` }}>请教练换个情境讲解</Button></Alert>}
    </>}
  </Card.Body></Card>;
}

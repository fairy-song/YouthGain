import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Form, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { getAdaptiveLearning, submitAdaptiveAnswer, learningError } from '../services/learning';
import './AdaptivePractice.css';

export default function AdaptivePractice({ lessons = [], onSelectLesson }) {
  const [data, setData] = useState(null);
  const [itemId, setItemId] = useState('');
  const [choice, setChoice] = useState('');
  const [drafts, setDrafts] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const load = async () => {
    setBusy(true); setError('');
    try {
      const result = await getAdaptiveLearning();
      if (mounted.current) { setData(result); setItemId(result.next_item?.id || ''); setChoice(''); setDrafts({}); setFeedback(null); setReviewing(false); setShowPicker(false); setNeedsRefresh(false); }
    } catch (e) { if (mounted.current) setError(learningError(e)); }
    finally { if (mounted.current) setBusy(false); }
  };
  // Each account gets a fresh component instance from Learning.
  useEffect(() => { mounted.current = true; load(); return () => { mounted.current = false; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const item = data?.items.find(i => i.id === itemId);
  const previousItem = item?.scenario_id && data.items.find(i => i.scenario_id === item.scenario_id && i.step === item.step - 1);
  const canGoBack = Boolean(previousItem && data?.attempts?.[previousItem.id] && !needsRefresh);
  const followingItem = item?.scenario_id && data.items.find(i => i.scenario_id === item.scenario_id && i.step === item.step + 1);
  const itemType = item?.type || 'choice';
  const canSubmit = itemType === 'reflection' ? choice.trim().length >= 5
    : itemType === 'number' ? choice !== '' && Number.isFinite(Number(choice)) && Number(choice) >= 0
      : choice !== '';
  const recommendedLesson = lessons.find(lesson => lesson.id === data?.lesson_id);
  const previous = () => {
    if (!canGoBack) return;
    if (!feedback) setDrafts(current => ({ ...current, [itemId]: choice }));
    setItemId(previousItem.id); setChoice(''); setFeedback(data.attempts[previousItem.id]); setReviewing(true); setShowPicker(false);
  };
  const next = () => {
    const target = reviewing && followingItem ? followingItem : data?.next_item;
    if (!target) return;
    const attempt = reviewing && followingItem ? data.attempts?.[target.id] : null;
    setItemId(target.id); setChoice(reviewing ? drafts[target.id] || '' : ''); setFeedback(attempt || null); setReviewing(Boolean(attempt)); setShowPicker(false);
  };
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    let saved = false;
    try {
      const answer = itemType === 'reflection' ? choice.trim() : Number(choice);
      const result = await submitAdaptiveAnswer({ item_id: item.id, choice: answer });
      saved = true;
      if (!mounted.current) return;
      window.dispatchEvent(new Event('learning-saved'));
      setFeedback(result); setChoice(''); setReviewing(false);
      const updated = await getAdaptiveLearning();
      if (mounted.current) { setData(updated); setNeedsRefresh(false); }
    } catch (e) { if (mounted.current) { setError(saved ? '答案已保存，但推荐刷新失败，请刷新推荐。' : learningError(e)); if (saved) setNeedsRefresh(true); } }
    finally { if (mounted.current) setBusy(false); }
  };
  return <Card className="learning-practice-card mb-4"><Card.Body>
    <div className="learning-practice-kicker">{item?.scenario_title || '今日的小练习'}</div>
    <h2 className="learning-practice-heading">{reviewing ? '回看这一步' : item ? '先想这一个问题' : '今天的练习'}</h2>
    {error && <Alert variant="danger" role="alert">{error} <Button variant="link" disabled={busy} onClick={load}>刷新推荐</Button></Alert>}
    {!data && busy && <Spinner animation="border" role="status"><span className="visually-hidden">加载情境</span></Spinner>}
    {data && <>
      {!item && !feedback && <div className="learning-practice-summary">
        <h3>今日练习完成</h3>
        <p className="text-muted mb-3">今天的新情境已经做完了，看看本次表现。</p>
        {(() => {
          const attempts = Object.values(data.attempts || {});
          const answered = attempts.filter(a => a.correct !== null);
          const correct = answered.filter(a => a.correct === true).length;
          const wrong = answered.filter(a => a.correct === false).length;
          const reflection = attempts.filter(a => a.correct === null).length;
          const totalExp = correct * 10 + Math.round((answered.length - correct - wrong) * 5);
          return <div className="row g-3 mb-3">
            <div className="col-4"><div className="border rounded p-3 text-center"><div className="fs-4 fw-bold text-success">{correct}</div><div className="small text-muted">答对</div></div></div>
            <div className="col-4"><div className="border rounded p-3 text-center"><div className="fs-4 fw-bold text-warning">{wrong}</div><div className="small text-muted">需巩固</div></div></div>
            <div className="col-4"><div className="border rounded p-3 text-center"><div className="fs-4 fw-bold text-primary">+{totalExp}</div><div className="small text-muted">经验值</div></div></div>
            {reflection > 0 && <div className="col-12"><p className="small text-muted mb-0">已记录 {reflection} 段开放思考。</p></div>}
          </div>;
        })()}
        <div className="d-flex gap-2">
          <Button as={Link} to="/knowledge" variant="outline-secondary">去知识库学习</Button>
          <Button as={Link} to="/learning" variant="primary">明天继续练习</Button>
        </div>
      </div>}
      {item && <div className="learning-practice-progress">{item.scenario_id ? `情境练习 · 第 ${item.step} / ${item.steps_total} 步` : `${item.level || '基础'}练习 · 一次只做一步`}{data.recommendation_mode === 'review' && item.id === data.next_item?.id ? ' · 简短复习' : ''}{item.review_status === 'pilot' ? ' · 试用题' : ''}</div>}
      {item && !feedback && <Form onSubmit={submit}>
        {item.scenario_context && <p className="learning-practice-context">{item.scenario_context}</p>}
        <fieldset disabled={busy}>
          <legend className="learning-practice-question">{item.question}</legend>
          {itemType === 'choice' && <div className="learning-practice-options">{(item.options || []).map((option, index) => <label key={`${item.id}-${index}`} className={`learning-practice-option ${choice === String(index) ? 'is-selected' : ''}`}>
            <input type="radio" name="adaptive-choice" value={index} checked={choice === String(index)} onChange={e => setChoice(e.target.value)} />
            <span className="learning-practice-option-mark" aria-hidden="true" /><span>{option}</span>
          </label>)}</div>}
          {itemType === 'number' && <Form.Group className="learning-practice-answer"><Form.Label htmlFor="adaptive-number">填写金额（元）</Form.Label><Form.Control id="adaptive-number" type="number" min="0" max="100000000" step="0.01" inputMode="decimal" value={choice} onChange={e => setChoice(e.target.value)} /></Form.Group>}
          {itemType === 'reflection' && <Form.Group className="learning-practice-answer"><Form.Label htmlFor="adaptive-reflection">写下你的判断依据</Form.Label><Form.Control id="adaptive-reflection" as="textarea" rows={3} maxLength={300} value={choice} onChange={e => setChoice(e.target.value)} placeholder="写一句你还想确认的信息就好" /></Form.Group>}
          <div className="learning-practice-actions">{canGoBack && <Button variant="outline-secondary" type="button" disabled={busy} onClick={previous}>上一步</Button>}<Button className="learning-practice-primary" type="submit" disabled={!canSubmit || busy}>{busy ? '保存中…' : '看看我的想法'}</Button></div>
        </fieldset>
      </Form>}
      {feedback && <>{reviewing && item && <><p className="learning-practice-question">{item.question}</p><p className="learning-practice-review-note">已完成的回答，仅供回看。</p></>}<div className="learning-practice-feedback" role="status"><strong>{feedback.correct === null ? '你的想法已记录。' : feedback.correct ? '这次抓住了关键条件。' : feedback.score === 0.5 ? '你已算对一部分，再核对遗漏的费用。' : '再核对一下关键数字或条件。'}</strong><p className="mb-1">你的回答：{feedback.evidence}</p><p className="mb-0">{feedback.explanation}</p></div>
        {feedback.correct === null && <div className="learning-practice-reflection-tip mt-2 p-2 bg-light rounded"><small className="text-muted">💡 思考对照：你的判断依据是否提到了「总成本」「风险」「下一步行动」这三个角度？下次写判断时可以试着覆盖其中两点。</small></div>}
        {feedback.micro_action && <p className="learning-practice-review-note">今天可以试一小步：{feedback.micro_action}</p>}
        <div className="learning-practice-actions">{canGoBack && <Button variant="outline-secondary" disabled={busy} onClick={previous}>上一步</Button>}{needsRefresh ? <Button className="learning-practice-primary" disabled={busy} onClick={load}>刷新下一步</Button> : (reviewing && followingItem) || data.next_item ? <Button className="learning-practice-primary" disabled={busy} onClick={next}>下一步</Button> : <p className="learning-practice-empty mb-0">今天先到这里。想继续时，可以再来练习。</p>}</div>
        <div className="learning-practice-secondary"><Button as={Link} variant="link" size="sm" to="/">今天先到这里</Button></div>
        {(recommendedLesson && onSelectLesson) || feedback.reference ? <details className="learning-practice-more"><summary>再了解一点</summary>{recommendedLesson && onSelectLesson && <Button variant="link" disabled={busy} onClick={() => onSelectLesson(recommendedLesson.id)}>相关练习：{recommendedLesson.title}</Button>}{feedback.reference && <a href={feedback.reference} target="_blank" rel="noreferrer">查看题型设计参考</a>}</details> : null}
        <div className="learning-practice-secondary"><Button as={Link} variant="link" size="sm" to="/coach" state={{ returnTo: '/learning?tab=practice', prompt: `我在做金融学习情境。我的选择：${feedback.evidence}。题目反馈：${feedback.explanation}。请换一个新情境帮助我理解。` }}>请教练换个情境讲解</Button></div>
      </>}
      {!feedback && <div className="learning-practice-secondary"><Button variant="link" size="sm" className="px-0" disabled={busy} onClick={() => setShowPicker(value => !value)}>{showPicker ? '收起其他情境' : '换一个情境'}</Button></div>}
      {showPicker && !feedback && <Form.Group controlId="adaptive-item" className="mb-3"><Form.Label>选择一个情境</Form.Label><Form.Select value={itemId} disabled={busy} onChange={e => { const attempt = data.attempts?.[e.target.value]; setDrafts(current => ({ ...current, [itemId]: choice })); setItemId(e.target.value); setChoice(drafts[e.target.value] || ''); setFeedback(attempt || null); setReviewing(Boolean(attempt)); setShowPicker(false); }}>{!itemId && <option value="">请选择</option>}{data.items.map(i => <option key={i.id} value={i.id}>{i.level} · {i.question}</option>)}</Form.Select></Form.Group>}
      <details className="learning-practice-more"><summary>为什么是这个问题？</summary><p className="mt-2 mb-1">{data.reason}</p><p className="small text-muted">{data.limitation}</p></details>
    </>}
  </Card.Body></Card>;
}

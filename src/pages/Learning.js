import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Alert, Badge, Button, Card, Col, Container, Form, ProgressBar, Row, Spinner } from 'react-bootstrap';
import { useAuth } from '../contexts/AuthContext';
import { assessPurchase } from '../services/api';
import { ComparisonBars } from '../components/FinanceVisuals';
import SectionNav from '../components/SectionNav';
import CoachHelp from '../components/CoachHelp';
import AdaptivePractice from '../components/AdaptivePractice';
import { getLearning, getWeeklyFacts, saveLearningEntry, saveDecisionOutcome, learningError } from '../services/learning';

const choiceLabels = { buy: '现在购买', wait: '延后考虑', adjust: '调整预算' };
const outcomeLabels = { met: '符合预期', mixed: '部分符合', unmet: '不符合预期' };
const blankProfile = { monthly_income: '', income_day: '', topic: 'budget', personal_rule: '' };
const blankDecision = { amount: '', category: '', need: '', choice: 'wait', reason: '', alternative_amount: '' };

function WritingField({ label, value, onChange, required = true, maxLength = 1000 }) {
  const id = React.useId();
  return <Form.Group controlId={id} className="mb-3">
    <Form.Label>{label}</Form.Label>
    <Form.Control as="textarea" rows={3} required={required} maxLength={maxLength} value={value || ''} onChange={e => onChange(e.target.value)} />
  </Form.Group>;
}

export default function Learning() {
  const location = useLocation();
  if (new URLSearchParams(location.search).get('tab') === 'profile') return <Navigate to="/profile" replace />;
  return <LearningContent />;
}

function LearningContent() {
  const { currentUser } = useAuth();
  const location = useLocation();
  const requestedTab = new URLSearchParams(location.search).get('tab');
  const tab = ['practice', 'decision', 'review', 'growth'].includes(requestedTab) ? requestedTab : 'decision';
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(blankProfile);
  const [facts, setFacts] = useState(null);
  const [factsError, setFactsError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState('');
  const [reflection, setReflection] = useState('');
  const [decision, setDecision] = useState(blankDecision);
  const [comparison, setComparison] = useState(null);
  const [review, setReview] = useState({ observation: '', next_action: '', principle: '', previous_action_result: '', pressure: 'neutral' });
  const [outcomeDrafts, setOutcomeDrafts] = useState({});


  useEffect(() => {
    let active = true;
    setData(null); setError(''); setFacts(null); setFactsError('');
    Promise.allSettled([getLearning(), getWeeklyFacts()]).then(([learning, weekly]) => {
      if (!active) return;
      if (learning.status === 'fulfilled') {
        setData(learning.value);
        setProfile({ ...blankProfile, ...learning.value.profile,
          monthly_income: learning.value.profile.monthly_income ?? '', income_day: learning.value.profile.income_day ?? '' });
      } else setError(learningError(learning.reason));
      if (weekly.status === 'fulfilled') setFacts(weekly.value);
      else setFactsError('本周账目暂时加载失败，仍可填写自主复盘。');
    });
    return () => { active = false; };
  }, [currentUser?.uid, retry]);

  const run = async (action, message) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await action();
      setNotice(message);
      window.dispatchEvent(new Event('learning-saved'));
      try { setData(await getLearning()); }
      catch { setError('内容已保存，但列表刷新失败，请重试刷新。'); }
    } catch (e) { setError(learningError(e)); }
    finally { setBusy(false); }
  };

  if (!data) return <Container className="py-5" style={{ maxWidth: 1050 }}>
    <h1>消费决策</h1>{error ? <Alert variant="warning">{error}<Button variant="link" onClick={() => setRetry(v => v + 1)}>重试</Button></Alert> : <div role="status"><Spinner size="sm" /> 正在读取你的记录…</div>}
  </Container>;

  const entries = data.entries;
  const completed = data.summary.completed_lessons;
  const orderedLessons = [...data.lessons].sort((a, b) => Number(b.topic === profile.topic) - Number(a.topic === profile.topic) || a.day - b.day);
  const lesson = data.lessons.find(l => l.id === selected) || orderedLessons.find(l => !completed.includes(l.id)) || orderedLessons[0];
  const reviews = entries.filter(e => e.kind === 'review');
  const previousReview = reviews.find(e => e.week !== facts?.start);
  const upcomingEntries = entries.filter(e => e.kind === 'upcoming');
  const pendingExpenses = upcomingEntries.filter(e => !e.handled).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const setDecisionField = (field, value) => { setDecision({ ...decision, [field]: value }); setComparison(null); };

  return <Container className="py-4 pb-5" style={{ maxWidth: 1050 }}>
    <div className="mb-4">
      <Badge bg="success" className="mb-3">看清影响 · 自主选择 · 回看消费</Badge>
      <h1 className="fw-bold">消费决策与复盘</h1>
      <p className="text-muted">买之前比较影响，买之后回看体验。</p>
    </div>
    {error && <Alert variant="warning" role="alert">{error} <Button variant="link" disabled={busy} onClick={() => setRetry(v => v + 1)}>刷新重试</Button></Alert>}
    {notice && <Alert variant="success" role="status" dismissible onClose={() => setNotice('')}>{notice}</Alert>}
    {data.profile.monthly_income == null && <Alert variant="info">先设置生活费或月收入，让消费试算有依据；情境练习不需要先填写资料。 <Button as={Link} to="/profile" variant="link">设置我的资料</Button></Alert>}
    <SectionNav label="消费决策功能" active={tab} items={[
      ['decision', '消费选择', '/learning?tab=decision'],
      ['review', '每周复盘', '/learning?tab=review'], ['growth', '历史记录', '/learning?tab=growth'],
    ]} />
    {['decision', 'review'].includes(tab) && pendingExpenses.length > 0 && <Alert variant="info">
      <strong>别忘了你安排的开支</strong>
      {pendingExpenses.slice(0, 5).map(e => <div key={e.id}>{e.due_date} · {e.title} · 预计 ¥{e.amount}</div>)}
      <small>这些事项未自动扣除，也不一定已经记账。比较消费选择时，请一起考虑。</small>
    </Alert>}


    {tab === 'practice' && <>
<details className="mb-4"><summary>选择题：试着判断一个情境</summary><AdaptivePractice key={currentUser?.uid || 'guest'} /></details>
      <div className="d-flex justify-content-between mb-2"><span>任选一个情境，随时开始、跳过或重做</span><strong>{completed.length} / 7</strong></div>
      <ProgressBar now={completed.length / 7 * 100} aria-label="练习完成进度" className="mb-4" />
      <Row className="g-4"><Col md={4}><div className="d-grid gap-2">{orderedLessons.map(l => <Button key={l.id} variant={lesson.id === l.id ? 'primary' : 'outline-secondary'} className="text-start" onClick={() => { setSelected(l.id); setReflection(entries.find(e => e.lesson_id === l.id)?.reflection || ''); }}>{completed.includes(l.id) ? '✓ ' : ''}练习 {l.day} · {l.title}</Button>)}</div><p className="small text-muted mt-3">按你选择的主题优先展示。完成次数记录参与情况，不代表能力评分。</p><Button as={Link} to="/assessment" variant="link">先做一次自我探索</Button></Col>
        <Col md={8}><Card className="border-0 shadow-sm"><Card.Body className="p-4">
          <Badge bg="light" text="dark" className="mb-3">今天的一次练习</Badge><h2 className="h4">{lesson.title}</h2><details className="mb-3"><summary>先了解这个概念</summary><p className="mt-2">{lesson.concept}</p></details>
          <Alert variant="light"><strong>试着想一想</strong><p className="mb-0 mt-2">{lesson.scenario}</p></Alert>
          {entries.find(e => e.lesson_id === lesson.id) && <p className="small text-muted">上次记录：{entries.find(e => e.lesson_id === lesson.id).reflection}</p>}
          <Form onSubmit={e => { e.preventDefault(); run(async () => { await saveLearningEntry('exercise', { lesson_id: lesson.id, reflection }); setSelected(lesson.id); }, '思考已保存，今天已参与成长练习。'); }}>
            <WritingField label={lesson.prompt} value={reflection} onChange={setReflection} /><Button type="submit" disabled={busy}>保存这次思考</Button>
            <Button as={Link} className="ms-2" variant="outline-secondary" to="/coach" state={{ returnTo: '/learning?tab=practice', prompt: `我在练习“${lesson.title}”。情境：${lesson.scenario}。我的想法：${reflection || '还没有想清楚'}。请先问我一个问题，帮我自己做判断。` }}>和教练聊聊</Button>
          </Form>
        </Card.Body></Card></Col></Row>
    </>}

    {['decision', 'review'].includes(tab) && <div className="mb-3"><CoachHelp prompt={tab === 'decision' ? '我正在比较一笔消费，请先问我一个问题，帮助我考虑需要和取舍。' : '我正在做每周复盘，请帮助我回看一次选择，并确定下周的小行动。'} /></div>}
    {tab === 'decision' && <>
      <Card className="border-0 shadow-sm mb-4"><Card.Body className="p-4"><h2 className="h4">看看这笔消费对本月安排的影响</h2><p className="text-muted">填写金额和类别即可比较。保存选择只记录计划，不会扣款或自动记账；实际购买后再去账本记一笔。</p>
        {data.profile.personal_rule && <Alert variant="info">你给自己的提醒：{data.profile.personal_rule}</Alert>}
        <Form onSubmit={e => { e.preventDefault(); run(async () => { await saveLearningEntry('decision', { ...decision, alternative_amount: decision.alternative_amount || 0 }); setDecision(blankDecision); setComparison(null); }, '选择和理由已保存。实际购买后可到记账页记录支出，再回来回访。'); }}>
          <Row><Col md={6}><Form.Group controlId="choice-amount" className="mb-3"><Form.Label>计划金额（元）</Form.Label><Form.Control required type="number" min="0.01" max="100000000" step="0.01" value={decision.amount} onChange={e => setDecisionField('amount', e.target.value)} /></Form.Group></Col><Col md={6}><Form.Group controlId="choice-category" className="mb-3"><Form.Label>商品或消费类别</Form.Label><Form.Control required maxLength={80} value={decision.category} onChange={e => setDecisionField('category', e.target.value)} /></Form.Group></Col></Row>
          <details className="mb-3"><summary>补充消费需要（可选）</summary><div className="fv-prompt-chips" aria-label="选择消费需要">{['日常必需', '学习或工作', '休闲放松', '社交往来'].map(v => <button type="button" key={v} onClick={() => setDecisionField('need', v)}>{v}</button>)}</div>
          <WritingField required={false} label="它满足了我的什么需要？" value={decision.need} onChange={v => setDecisionField('need', v)} maxLength={300} /></details>
          <Form.Group controlId="alternative-amount" className="mb-3"><Form.Label>想比较的另一种预算（元，可选）</Form.Label><Form.Control type="number" min="0" max="100000000" step="0.01" value={decision.alternative_amount} onChange={e => setDecisionField('alternative_amount', e.target.value)} /></Form.Group>
          <Button variant="outline-primary" disabled={busy || !(Number(decision.amount) > 0) || !decision.category.trim()} className="mb-3" onClick={() => run(async () => {
            const result = await assessPurchase({ amount: Number(decision.amount), category: decision.category });
            let alternative = null;
            if (Number(decision.alternative_amount) > 0) alternative = await assessPurchase({ amount: Number(decision.alternative_amount), category: decision.category });
            setComparison({ result, alternative });
          }, '试算已更新，请结合生活需要做选择。')}>比较对预算的影响</Button>
          {comparison && <ComparisonBars items={[
            { label: '现在购买', value: comparison.result.budget.remaining - Number(decision.amount) },
            { label: '暂不购买', value: comparison.result.budget.remaining },
            ...(comparison.alternative ? [{ label: '调整预算', value: comparison.alternative.budget.remaining - Number(decision.alternative_amount) }] : [])
          ]} />}
          {comparison && <details className="mb-3"><summary>查看试算说明与依据</summary><Alert variant="light"><p>{comparison.result.suggestion}</p><p>现在购买：按已记录数据，购买后本月余量 ¥{(comparison.result.budget.remaining - Number(decision.amount)).toFixed(2)}。</p><p>延后考虑：这次暂不支出 ¥{Number(decision.amount).toFixed(2)}，未来需要和价格仍可能变化。</p>{comparison.alternative && <p>调整预算：按已记录数据，购买后本月余量 ¥{(comparison.alternative.budget.remaining - Number(decision.alternative_amount)).toFixed(2)}。</p>}<small>{comparison.result.basis?.message || '仅基于已记录消费估算，尚未记录的必要开支仍需预留。'}</small></Alert></details>}
          {comparison && <p className="small text-muted">仅按已记录数据估算，未来必要开支仍需预留。</p>}
          <Form.Group controlId="choice-result" className="mb-3"><Form.Label>我目前的选择</Form.Label><Form.Select value={decision.choice} onChange={e => setDecision({ ...decision, choice: e.target.value })}>{Object.entries(choiceLabels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</Form.Select></Form.Group>
          <WritingField required={false} label="我这样选的理由，以及愿意接受的取舍（可选）" value={decision.reason} onChange={v => setDecision({ ...decision, reason: v })} />
          <Button type="submit" disabled={busy}>保存我的选择</Button> <Button as={Link} to="/dashboard" variant="outline-secondary">已购买，去记账</Button>
        </Form>
      </Card.Body></Card>
      <h2 className="h4">回看我的选择</h2><p className="text-muted">过几天再看看是否符合预期，也可以更新自己的想法。</p>
      {!entries.some(e => e.kind === 'decision') && <p>还没有选择记录，从一个真实的问题开始。</p>}
      {entries.filter(e => e.kind === 'decision').map(e => <Card key={e.id} className="mb-3"><Card.Body><h3 className="h6">{e.category} · ¥{e.amount} · {choiceLabels[e.choice]}</h3><p>当时的需要：{e.need}</p><p>我的理由：{e.reason}</p>{e.outcome && <p>上次回访：{outcomeLabels[e.outcome]} {e.reflection}</p>}
        <Form onSubmit={event => { event.preventDefault(); run(() => saveDecisionOutcome(e.id, { outcome: outcomeDrafts[e.id]?.outcome || e.outcome || 'mixed', reflection: outcomeDrafts[e.id]?.reflection ?? e.reflection ?? '' }), '回访已保存。'); }}>
          <Form.Select aria-label={`${e.category}是否符合预期`} value={outcomeDrafts[e.id]?.outcome || e.outcome || 'mixed'} onChange={event => setOutcomeDrafts({ ...outcomeDrafts, [e.id]: { ...outcomeDrafts[e.id], outcome: event.target.value } })} className="mb-2">{Object.entries(outcomeLabels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</Form.Select>
          <WritingField label="实际体验与当初想法有什么不同？（可选）" required={false} value={outcomeDrafts[e.id]?.reflection ?? e.reflection ?? ''} onChange={v => setOutcomeDrafts({ ...outcomeDrafts, [e.id]: { ...outcomeDrafts[e.id], reflection: v } })} /><Button size="sm" type="submit" disabled={busy}>保存回访</Button>
        </Form>
      </Card.Body></Card>)}
    </>}

    {tab === 'review' && <Card className="border-0 shadow-sm"><Card.Body className="p-4"><h2 className="h4">简短回看这一周</h2>
      {factsError && <Alert variant="warning">{factsError}<Button variant="link" onClick={() => setRetry(v => v + 1)}>重试</Button></Alert>}
      {facts && <Alert variant="light">{facts.start} 至 {facts.end}：已记录 {facts.count} 笔，共 ¥{facts.total.toFixed(2)}。<div className="small">{facts.message}{facts.limited && ' 当前只读取最近 2000 笔，汇总可能不完整。'}</div></Alert>}
      {previousReview && <Alert variant="info">上次想尝试：{previousReview.next_action}</Alert>}
      {reviews.find(e => e.week === facts?.start) && <p className="text-success">本周已复盘，重新保存会更新本周记录。<Button variant="link" onClick={() => setReview(reviews.find(e => e.week === facts?.start))}>继续编辑</Button></p>}
      <Form onSubmit={e => { e.preventDefault(); run(() => saveLearningEntry('review', review), '本周复盘已保存，下周可以回看这次行动。'); }}>
        <WritingField label="这周哪笔消费值得回看？（没有消费也可以回看计划）" value={review.observation} onChange={v => setReview({ ...review, observation: v })} />
        <div className="fv-prompt-chips" aria-label="下周行动灵感">{['周日花五分钟检查下周必要开支', '下次临时购物前先比较两个方案', '周末回看一笔消费是否符合预期'].map(v => <button type="button" key={v} onClick={() => setReview({ ...review, next_action: v })}>{v}</button>)}</div><WritingField label="下周想保持或调整什么？" maxLength={500} value={review.next_action} onChange={v => setReview({ ...review, next_action: v })} />
        <details className="mb-3"><summary>补充行动反馈和个人原则（可选）</summary><WritingField label="上次的小行动有没有帮助？（可选）" required={false} maxLength={500} value={review.previous_action_result} onChange={v => setReview({ ...review, previous_action_result: v })} /><WritingField required={false} label="我的理财原则初稿" maxLength={500} value={review.principle} onChange={v => setReview({ ...review, principle: v })} />
        <Form.Group controlId="review-pressure" className="mb-3"><Form.Label>这些练习带给我的感受</Form.Label><Form.Select value={review.pressure} onChange={e => setReview({ ...review, pressure: e.target.value })}><option value="helpful">更清楚自己的想法</option><option value="neutral">暂时没有明显变化</option><option value="pressure">有些压力，想放慢节奏</option></Form.Select></Form.Group>
        </details><Button type="submit" disabled={busy}>保存本周复盘</Button>
      </Form>
    </Card.Body></Card>}

    {tab === 'growth' && <>
      <h2 className="h4">历史记录</h2><p className="text-muted">回看曾经的决定与下一步行动。</p>
      {!entries.some(e => ['decision', 'review'].includes(e.kind)) && <p>暂时没有记录，比较消费或完成复盘后可选择保存。</p>}
      {entries.filter(e => ['decision', 'review'].includes(e.kind)).sort((a, b) => String(b.updated_at || b.created_at || b.week || '').localeCompare(String(a.updated_at || a.created_at || a.week || ''))).map(e => <Card key={e.id} className="mb-3"><Card.Body>{e.kind === 'decision' ? <><h3 className="h6">{e.category} · ¥{e.amount} · {choiceLabels[e.choice]}</h3>{e.reason && <p>{e.reason}</p>}{e.outcome && <p>回访：{outcomeLabels[e.outcome]} {e.reflection}</p>}</> : <><h3 className="h6">{e.week} · 每周复盘</h3><p>{e.observation}</p><strong>下一步：{e.next_action}</strong></>}</Card.Body></Card>)}
      <h2 className="h4 mt-4">我逐渐形成的原则</h2>{!reviews.length && <p>完成第一次每周复盘后，你的原则会出现在这里。</p>}
      {reviews.filter(r => r.principle).map(r => <Card key={r.id} className="mb-3"><Card.Body><small className="text-muted">{r.week} 这一周</small><p className="fw-bold mt-2">{r.principle}</p><p>我的观察：{r.observation}</p><p className="mb-0">下一步：{r.next_action}</p>{r.previous_action_result && <p className="mt-2 mb-0">上次行动反馈：{r.previous_action_result}</p>}</Card.Body></Card>)}
    </>}
    <div className="d-flex gap-3 mt-4"><Link to="/learning?tab=practice">情境练习（可选）</Link><Link to="/info/knowledge">知识库</Link>{tab === 'practice' && <Link to="/assessment">自我探索（可选）</Link>}</div>
  </Container>;
}

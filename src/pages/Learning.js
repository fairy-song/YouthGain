import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Alert, Badge, Button, Card, Col, Container, Form, Nav, ProgressBar, Row, Spinner } from 'react-bootstrap';
import { useAuth } from '../contexts/AuthContext';
import { assessPurchase } from '../services/api';
import { getLearning, getWeeklyFacts, saveLearningProfile, saveLearningEntry, saveDecisionOutcome, updateUpcoming, learningError } from '../services/learning';

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
  const { currentUser } = useAuth();
  const location = useLocation();
  const [tab, setTab] = useState(new URLSearchParams(location.search).get('tab') || 'practice');
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
  const [upcoming, setUpcoming] = useState({ title: '', amount: '', due_date: '' });

  useEffect(() => { setTab(new URLSearchParams(location.search).get('tab') || 'practice'); }, [location.search]);
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
    <h1>理财成长</h1>{error ? <Alert variant="warning">{error}<Button variant="link" onClick={() => setRetry(v => v + 1)}>重试</Button></Alert> : <div role="status"><Spinner size="sm" /> 正在读取你的成长记录…</div>}
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
      <Badge bg="success" className="mb-3">认识自己 · 理解取舍 · 自主决定</Badge>
      <h1 className="fw-bold">把理财方法，练进生活里</h1>
      <p className="text-muted">用真实情境练习安排收支、照顾当下、准备未来。每次几分钟，按自己的节奏完成。</p>
    </div>
    {error && <Alert variant="warning" role="alert">{error} <Button variant="link" disabled={busy} onClick={() => setRetry(v => v + 1)}>刷新重试</Button></Alert>}
    {notice && <Alert variant="success" role="status" dismissible onClose={() => setNotice('')}>{notice}</Alert>}
    {data.profile.monthly_income == null && <Alert variant="info">先设置生活费或月收入，让消费试算有依据；也可以直接开始学习。 <Button variant="link" onClick={() => setTab('profile')}>设置我的资料</Button></Alert>}
    <Nav variant="pills" className="gap-2 mb-4 flex-wrap" aria-label="成长功能">
      {[['practice', '七天练习'], ['decision', '消费选择'], ['review', '每周复盘'], ['growth', '我的成长'], ['profile', '我的资料']].map(([key, label]) => <Nav.Item key={key}><Nav.Link as="button" active={tab === key} onClick={() => { setTab(key); setNotice(''); }}>{label}</Nav.Link></Nav.Item>)}
    </Nav>
    {['decision', 'review'].includes(tab) && pendingExpenses.length > 0 && <Alert variant="info">
      <strong>别忘了你安排的开支</strong>
      {pendingExpenses.slice(0, 5).map(e => <div key={e.id}>{e.due_date} · {e.title} · 预计 ¥{e.amount}</div>)}
      <small>这些事项未自动扣除，也不一定已经记账。比较消费选择时，请一起考虑。</small>
    </Alert>}

    {tab === 'profile' && <Card className="border-0 shadow-sm"><Card.Body className="p-4">
      <h2 className="h4">我的生活与学习安排</h2><p className="text-muted">随账号保存。未设置收入时，不会使用默认金额替你计算。</p>
      <Form onSubmit={e => { e.preventDefault(); run(async () => { const saved = await saveLearningProfile(profile); setProfile({ ...saved, monthly_income: saved.monthly_income ?? '', income_day: saved.income_day ?? '' }); }, '资料已保存。'); }}>
        <Row><Col md={6}><Form.Group controlId="learning-income" className="mb-3"><Form.Label>月收入或生活费（元，可暂不填写）</Form.Label><Form.Control type="number" min="0" max="100000000" step="0.01" value={profile.monthly_income} onChange={e => setProfile({ ...profile, monthly_income: e.target.value })} /></Form.Group></Col>
          <Col md={6}><Form.Group controlId="learning-income-day" className="mb-3"><Form.Label>通常每月几号到账（可选）</Form.Label><Form.Control type="number" min="1" max="31" step="1" value={profile.income_day} onChange={e => setProfile({ ...profile, income_day: e.target.value })} /></Form.Group></Col></Row>
        <Form.Group controlId="learning-topic" className="mb-3"><Form.Label>我想先练习</Form.Label><Form.Select value={profile.topic} onChange={e => setProfile({ ...profile, topic: e.target.value })}>{data.topics.map(t => <option value={t.id} key={t.id}>{t.title}：{t.description}</option>)}</Form.Select></Form.Group>
        <WritingField label="我的自定规则（可选，例如：临时大额消费先考虑一天，紧急需要除外）" value={profile.personal_rule} onChange={v => setProfile({ ...profile, personal_rule: v })} required={false} maxLength={300} />
        <Button type="submit" disabled={busy}>{busy ? '保存中…' : '保存资料'}</Button> <Button as={Link} to="/dashboard" variant="outline-secondary">设置储蓄目标与记账</Button>
      </Form>
      <hr className="my-4" /><h3 className="h5">记住一笔未来的开支</h3><p className="text-muted small">在消费选择和复盘时提醒自己。不发送站外通知。</p>
      <Form onSubmit={e => { e.preventDefault(); run(async () => { await saveLearningEntry('upcoming', upcoming); setUpcoming({ title: '', amount: '', due_date: '' }); }, '开支安排已保存。'); }}>
        <Row className="g-2 mb-3">
          <Col md={5}><Form.Control required aria-label="未来开支事项" placeholder="例如：考试费" maxLength={100} value={upcoming.title} onChange={e => setUpcoming({ ...upcoming, title: e.target.value })} /></Col>
          <Col md={3}><Form.Control required aria-label="未来开支金额" placeholder="预计金额（元）" type="number" min="0.01" max="100000000" step="0.01" value={upcoming.amount} onChange={e => setUpcoming({ ...upcoming, amount: e.target.value })} /></Col>
          <Col md={4}><Form.Control required aria-label="未来开支日期" type="date" value={upcoming.due_date} onChange={e => setUpcoming({ ...upcoming, due_date: e.target.value })} /></Col>
        </Row><Button type="submit" variant="outline-primary" disabled={busy}>保存开支安排</Button>
      </Form>
      {upcomingEntries.map(e => <div key={e.id} className="d-flex flex-wrap align-items-center justify-content-between border-bottom py-2"><span>{e.due_date} · {e.title} · ¥{e.amount} {e.handled && '（已处理）'}</span><Button variant="link" disabled={busy} onClick={() => run(() => updateUpcoming(e.id, !e.handled), e.handled ? '已恢复提醒。' : '已标记处理；实际支出请另行记账。')}>{e.handled ? '恢复提醒' : '标记已处理'}</Button></div>)}
    </Card.Body></Card>}

    {tab === 'practice' && <>
      <div className="d-flex justify-content-between mb-2"><span>七次练习，可以分七天完成，也可以随时继续</span><strong>{completed.length} / 7</strong></div>
      <ProgressBar now={completed.length / 7 * 100} aria-label="练习完成进度" className="mb-4" />
      <Row className="g-4"><Col md={4}><div className="d-grid gap-2">{orderedLessons.map(l => <Button key={l.id} variant={lesson.id === l.id ? 'primary' : 'outline-secondary'} className="text-start" onClick={() => { setSelected(l.id); setReflection(entries.find(e => e.lesson_id === l.id)?.reflection || ''); }}>{completed.includes(l.id) ? '✓ ' : ''}练习 {l.day} · {l.title}</Button>)}</div><p className="small text-muted mt-3">按你选择的主题优先展示。完成次数记录参与情况，不代表能力评分。</p><Button as={Link} to="/assessment" variant="link">先做一次自我探索</Button></Col>
        <Col md={8}><Card className="border-0 shadow-sm"><Card.Body className="p-4">
          <Badge bg="light" text="dark" className="mb-3">今天理解一个概念</Badge><h2 className="h4">{lesson.title}</h2><p>{lesson.concept}</p>
          <Alert variant="light"><strong>试着想一想</strong><p className="mb-0 mt-2">{lesson.scenario}</p></Alert>
          {entries.find(e => e.lesson_id === lesson.id) && <p className="small text-muted">上次记录：{entries.find(e => e.lesson_id === lesson.id).reflection}</p>}
          <Form onSubmit={e => { e.preventDefault(); run(async () => { await saveLearningEntry('exercise', { lesson_id: lesson.id, reflection }); setSelected(lesson.id); }, '思考已保存，今天已参与成长练习。'); }}>
            <WritingField label={lesson.prompt} value={reflection} onChange={setReflection} /><Button type="submit" disabled={busy}>保存这次思考</Button>
            <Button as={Link} className="ms-2" variant="outline-secondary" to="/coach" state={{ prompt: `我在练习“${lesson.title}”。情境：${lesson.scenario}。我的想法：${reflection || '还没有想清楚'}。请先问我一个问题，帮我自己做判断。` }}>和教练聊聊</Button>
          </Form>
        </Card.Body></Card></Col></Row>
    </>}

    {tab === 'decision' && <>
      <Card className="border-0 shadow-sm mb-4"><Card.Body className="p-4"><h2 className="h4">这次选择，对我意味着什么？</h2><p className="text-muted">记录打算购买的东西。选择没有统一答案，先想清需要和取舍。</p>
        {data.profile.personal_rule && <Alert variant="info">你给自己的提醒：{data.profile.personal_rule}</Alert>}
        <Form onSubmit={e => { e.preventDefault(); run(async () => { await saveLearningEntry('decision', { ...decision, alternative_amount: decision.alternative_amount || 0 }); setDecision(blankDecision); setComparison(null); }, '选择和理由已保存。实际购买后可到记账页记录支出，再回来回访。'); }}>
          <Row><Col md={6}><Form.Group controlId="choice-amount" className="mb-3"><Form.Label>计划金额（元）</Form.Label><Form.Control required type="number" min="0.01" max="100000000" step="0.01" value={decision.amount} onChange={e => setDecisionField('amount', e.target.value)} /></Form.Group></Col><Col md={6}><Form.Group controlId="choice-category" className="mb-3"><Form.Label>商品或消费类别</Form.Label><Form.Control required maxLength={80} value={decision.category} onChange={e => setDecisionField('category', e.target.value)} /></Form.Group></Col></Row>
          <WritingField label="它满足了我的什么需要？" value={decision.need} onChange={v => setDecisionField('need', v)} maxLength={300} />
          <Form.Group controlId="alternative-amount" className="mb-3"><Form.Label>想比较的另一种预算（元，可选）</Form.Label><Form.Control type="number" min="0" max="100000000" step="0.01" value={decision.alternative_amount} onChange={e => setDecisionField('alternative_amount', e.target.value)} /></Form.Group>
          <Button variant="outline-primary" disabled={busy || !(Number(decision.amount) > 0) || !decision.category.trim()} className="mb-3" onClick={() => run(async () => {
            const result = await assessPurchase({ amount: Number(decision.amount), category: decision.category });
            let alternative = null;
            if (Number(decision.alternative_amount) > 0) alternative = await assessPurchase({ amount: Number(decision.alternative_amount), category: decision.category });
            setComparison({ result, alternative });
          }, '试算已更新，请结合生活需要做选择。')}>比较对预算的影响</Button>
          {comparison && <Alert variant="light"><p>{comparison.result.suggestion}</p><p>现在购买：按已记录数据，购买后本月余量 ¥{(comparison.result.budget.remaining - Number(decision.amount)).toFixed(2)}。</p><p>延后考虑：这次暂不支出 ¥{Number(decision.amount).toFixed(2)}，未来需要和价格仍可能变化。</p>{comparison.alternative && <p>调整预算：按已记录数据，购买后本月余量 ¥{(comparison.alternative.budget.remaining - Number(decision.alternative_amount)).toFixed(2)}。</p>}<small>{comparison.result.basis?.message || '仅基于已记录消费估算，尚未记录的必要开支仍需预留。'}</small></Alert>}
          <Form.Group controlId="choice-result" className="mb-3"><Form.Label>我目前的选择</Form.Label><Form.Select value={decision.choice} onChange={e => setDecision({ ...decision, choice: e.target.value })}>{Object.entries(choiceLabels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</Form.Select></Form.Group>
          <WritingField label="我这样选的理由，以及愿意接受的取舍" value={decision.reason} onChange={v => setDecision({ ...decision, reason: v })} />
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

    {tab === 'review' && <Card className="border-0 shadow-sm"><Card.Body className="p-4"><h2 className="h4">每周一次，把经历变成自己的方法</h2>
      {factsError && <Alert variant="warning">{factsError}<Button variant="link" onClick={() => setRetry(v => v + 1)}>重试</Button></Alert>}
      {facts && <Alert variant="light">{facts.start} 至 {facts.end}：已记录 {facts.count} 笔，共 ¥{facts.total.toFixed(2)}。<div className="small">{facts.message}{facts.limited && ' 当前只读取最近 2000 笔，汇总可能不完整。'}</div></Alert>}
      {previousReview && <Alert variant="info">上次想尝试：{previousReview.next_action}</Alert>}
      {reviews.find(e => e.week === facts?.start) && <p className="text-success">本周已复盘，重新保存会更新本周记录。<Button variant="link" onClick={() => setReview(reviews.find(e => e.week === facts?.start))}>继续编辑</Button></p>}
      <Form onSubmit={e => { e.preventDefault(); run(() => saveLearningEntry('review', review), '本周复盘已保存，下周可以回看这次行动。'); }}>
        <WritingField label="上次的小行动有没有帮助？（首次可跳过）" required={false} maxLength={500} value={review.previous_action_result} onChange={v => setReview({ ...review, previous_action_result: v })} />
        <WritingField label="本周一件值得回看的事：发生了什么，是否符合预期？" value={review.observation} onChange={v => setReview({ ...review, observation: v })} />
        <WritingField label="下周想试的一件小事：何时、怎样做？" maxLength={500} value={review.next_action} onChange={v => setReview({ ...review, next_action: v })} />
        <WritingField label="我的理财原则初稿" maxLength={500} value={review.principle} onChange={v => setReview({ ...review, principle: v })} />
        <Form.Group controlId="review-pressure" className="mb-3"><Form.Label>这些练习带给我的感受</Form.Label><Form.Select value={review.pressure} onChange={e => setReview({ ...review, pressure: e.target.value })}><option value="helpful">更清楚自己的想法</option><option value="neutral">暂时没有明显变化</option><option value="pressure">有些压力，想放慢节奏</option></Form.Select></Form.Group>
        <Button type="submit" disabled={busy}>保存本周复盘</Button>
      </Form>
    </Card.Body></Card>}

    {tab === 'growth' && <>
      <Row className="g-3 mb-4">{[['完成练习', data.summary.practice_count], ['自主选择', data.summary.decision_count], ['每周复盘', data.summary.review_count], ['参与天数', data.summary.checkin.total_days]].map(([label, count]) => <Col xs={6} md={3} key={label}><Card className="h-100"><Card.Body><div className="text-muted">{label}</div><strong className="fs-2">{count}</strong></Card.Body></Card></Col>)}</Row>
      <p className="text-muted">成长记录展示你练习过什么，不以省钱金额、连续天数或自评分数评判能力。</p>
      {data.summary.abilities.map(a => <div key={a.topic} className="mb-3"><div className="d-flex justify-content-between"><span>{a.title}</span><span>{a.completed} / {a.total} 次练习</span></div><ProgressBar now={a.completed / a.total * 100} aria-label={a.title} /></div>)}
      <h2 className="h4 mt-4">我逐渐形成的原则</h2>{!reviews.length && <p>完成第一次每周复盘后，你的原则会出现在这里。</p>}
      {reviews.map(r => <Card key={r.id} className="mb-3"><Card.Body><small className="text-muted">{r.week} 这一周</small><p className="fw-bold mt-2">{r.principle}</p><p>我的观察：{r.observation}</p><p className="mb-0">下一步：{r.next_action}</p>{r.previous_action_result && <p className="mt-2 mb-0">上次行动反馈：{r.previous_action_result}</p>}</Card.Body></Card>)}
    </>}
  </Container>;
}

import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { questions, draftOwner, freshDraft, readDraft, writeDraft, normalizedAnswers, previewSummary } from '../data/firstVisit';
import LivingFundsStressTest from '../components/LivingFundsStressTest';
import './FirstVisit.css';
import { PRODUCT_GUIDE_ENABLED } from '../config/features';

const ledgerIntent = { from: '/dashboard' };

export function Welcome() {
  return <main className="first-visit welcome-page">
    <nav className="first-visit-top" aria-label="首页导航">
      <Link to="/" className="first-visit-brand">青盈<span>·</span></Link>
      <div className="welcome-access"><Link to="/login">学生登录</Link><Link to="/research">学校端</Link><Link to="/admin/login">管理端</Link></div>
    </nav>
    <div className="welcome-glow" aria-hidden="true" />
    <section className="welcome-content">
      <p className="first-visit-eyebrow">给大学生的财商练习</p>
      <h1>这一笔花出去，<br /><em>生活费还够用吗？</em></h1>
      <p className="welcome-intro">先用一个校园生活示例，看看一笔消费会怎样影响下次到账前的生活费。登录后就能记账、安排开支、练习消费决策。</p>
      <div className="welcome-actions">
        {PRODUCT_GUIDE_ENABLED && <Link className="first-visit-primary" to="/guide">30 秒，认识青盈 <span aria-hidden="true">→</span></Link>}
        <Link className={PRODUCT_GUIDE_ENABLED ? 'first-visit-secondary' : 'first-visit-primary'} to="/try">免登录试一笔 <span aria-hidden="true">→</span></Link>
        <Link className="first-visit-secondary" to="/login" state={ledgerIntent}>登录去记账</Link>
      </div>
    </section>
    <section className="welcome-questionnaire" aria-label="可选问卷">
      <Link to="/start">做一份财商自评 →</Link>
      <span>可选 · 12 道题，约 3 分钟</span>
    </section>
  </main>;
}

export function TryLivingFunds() {
  const { workspace } = useAuth();
  const signedIn = workspace === 'student';
  return <main className="first-visit">
    <nav className="first-visit-top" aria-label="试算导航">
      <Link to="/" className="first-visit-brand">青盈<span>·</span></Link>
      <Link to={signedIn ? ledgerIntent.from : '/login'} state={signedIn ? undefined : ledgerIntent}>
        {signedIn ? '打开账本' : '登录去记账'} →
      </Link>
    </nav>
    <section className="guest-trial">
      <p className="first-visit-eyebrow">无需登录</p>
      <h1>试一笔消费</h1>
      <p className="question-hint">可以使用示例金额，也可以换成自己的数字。试算不会写入账本。</p>
      <LivingFundsStressTest guest entries={[]} />
    </section>
  </main>;
}

export default function FirstVisit() {
  const { currentUser, workspace, initializing } = useAuth();
  const owner = draftOwner(workspace === 'student' ? currentUser : null);
  if (initializing) return <p className="p-4" role="status">正在恢复登录状态…</p>;
  return <Questionnaire key={owner || ''} owner={owner} />;
}

function Questionnaire({ owner }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [draft, setDraft] = useState(() => readDraft(owner) || freshDraft(owner));
  const [error, setError] = useState('');
  const question = questions[draft.step];
  const answers = draft.answers;
  const update = changes => {
    const next = { ...draft, ...changes };
    setDraft(next);
    writeDraft(next);
  };
  const choose = value => {
    const updated = { ...answers, [question.id]: value };
    if (question.id === 'q7') {
      if (value === 'none' || value === 'mortgage_only') {
        updated.q8 = 'na'; updated.q9 = 'none';
      } else if (answers.q7 === 'none' || answers.q7 === 'mortgage_only') {
        updated.q8 = null; updated.q9 = null;
      }
    }
    update({ answers: updated });
    setError('');
  };
  const next = (skip = false) => {
    let updated = { ...answers };
    if (skip) {
      updated[question.id] = null;
      if (question.id === 'q7' && ['none', 'mortgage_only'].includes(answers.q7)) { updated.q8 = null; updated.q9 = null; }
    }
    const value = updated[question.id];
    if (question.max && value !== null) {
      const amount = Number(value);
      if (value === '' || !Number.isFinite(amount) || amount < 0 || amount > question.max || !/^\d+(\.\d{0,2})?$/.test(String(value))) {
        setError(`请填写 0 到 ${question.max.toLocaleString('zh-CN')} 元之间的金额，或选择暂不回答。`);
        return;
      }
    }
    if (draft.step === questions.length - 1) update({ answers: updated, complete: true });
    else update({ answers: updated, step: draft.step + 1 });
    setError('');
  };
  const back = () => {
    update({ step: draft.complete ? questions.length - 1 : Math.max(0, draft.step - 1), complete: false });
    setError('');
  };
  const summary = draft.complete ? previewSummary(normalizedAnswers(answers)) : null;
  const saveIntent = { questionnaireIntent: draft.submission_id };
  return <main className="first-visit questionnaire-page">
    <nav className="first-visit-top"><Link to="/" className="first-visit-brand">青盈<span>·</span></Link><Link to="/">返回首页</Link></nav>
    {location.state?.draftUnavailable && <p role="status" className="mx-auto text-center">这份问卷草稿已失效，请重新作答。</p>}
    {draft.complete ? <section className="result-panel" aria-live="polite">
      <p className="first-visit-eyebrow">你的学习起点</p>
      <h1>你的简要财务知识评估</h1>
      <p className="result-sub">这是根据你的回答整理的初步结果，帮助选择下一步学习内容。</p>
      <div className="result-facts">
        <div><span>了解程度 · 自评</span><p>{summary.knowledge}</p></div>
        <div><span>回看开支</span><p>{summary.tracking}</p></div>
        <div><span>应急准备</span><p>{summary.buffer}</p></div>
      </div>
      <div className="result-focus"><span>可以先了解</span><h2>{summary.focus}</h2><p>{summary.reason}</p></div>
      <p className="result-basis">{summary.basis} 金额不会在这里逐项公开。登录后可将问卷保存到“我的”。</p>
      <div className="first-visit-actions">
        <button type="button" className="first-visit-secondary" onClick={back}>修改上一题</button>
        {owner ? <button type="button" className="first-visit-primary" onClick={() => navigate('/onboarding/complete', { state: saveIntent })}>保存到我的问卷 →</button>
          : <Link className="first-visit-primary" to="/login?from=questionnaire" state={saveIntent}>登录并保存到我的问卷 →</Link>}
      </div>
      {!owner && <p className="result-register">还没有账号？<Link to="/register?from=questionnaire" state={saveIntent}>注册后保存</Link></p>}
    </section> : <section className="question-panel">
      <div className="question-progress"><span>{String(draft.step + 1).padStart(2, '0')} / 12</span><span>{question.topic}</span></div>
      <div className="question-track"><div style={{ width: `${(draft.step + 1) / questions.length * 100}%` }} /></div>
      <h1>{question.title}</h1>
      {draft.step === 0 && <p className="question-hint">作答进度在当前标签页保留一小时。你可以直接返回首页，问卷不会影响记账。</p>}
      {question.hint && <p className="question-hint">{question.hint}</p>}
      {question.options ? <div className="question-options">{question.options.map(([id, label]) =>
        <button key={id} type="button" className={answers[question.id] === id ? 'selected' : ''} aria-pressed={answers[question.id] === id} onClick={() => choose(id)}>{label}<span aria-hidden="true">{answers[question.id] === id ? '✓' : '↗'}</span></button>)}</div>
        : <div className="question-amount"><label htmlFor="question-amount">金额（元）</label><input id="question-amount" type="number" inputMode="decimal" min="0" max={question.max} step="0.01" placeholder="可以填 0" value={answers[question.id] ?? ''} onChange={e => choose(e.target.value)} /></div>}
      {error && <p role="alert" className="question-error">{error}</p>}
      <div className="first-visit-actions"><button type="button" className="first-visit-secondary" onClick={back} disabled={draft.step === 0}>上一步</button><button type="button" className="first-visit-secondary" onClick={() => next(true)}>暂不回答</button><button type="button" className="first-visit-primary" onClick={() => next()} disabled={answers[question.id] === null}>下一步 →</button></div>
    </section>}
  </main>;
}

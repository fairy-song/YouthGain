import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { questions, freshDraft, readDraft, writeDraft, normalizedAnswers, previewSummary } from '../data/firstVisit';
import './FirstVisit.css';

export function Welcome() {
  return <main className="first-visit welcome-page">
    <nav className="first-visit-top"><Link to="/" className="first-visit-brand">青盈<span>·</span></Link><Link to="/login">已有账号？登录</Link></nav>
    <div className="welcome-glow" aria-hidden="true" />
    <section className="welcome-content">
      <p className="first-visit-eyebrow">给大学生的财商练习</p>
      <h1>从了解自己开始，<br /><em>一步一步学会用钱。</em></h1>
      <p className="welcome-intro">不用先记一堆账。回答 12 个关于日常收支的问题，先看看自己的学习起点，再开始适合你的练习。</p>
      <Link className="first-visit-primary welcome-cta" to="/start">开始体验 <span aria-hidden="true">→</span></Link>
      <p className="welcome-note">约 3 分钟 · 先看结果，再登录保存</p>
    </section>
    <section className="welcome-steps" aria-label="体验流程">
      <div><span>01</span><strong>了解自己</strong><p>每次只回答一个简单问题</p></div>
      <div><span>02</span><strong>看到起点</strong><p>用简短说明认识自己的现状</p></div>
      <div><span>03</span><strong>每次学一步</strong><p>一张卡、一种新的思考方法</p></div>
    </section>
  </main>;
}

export default function FirstVisit() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [draft, setDraft] = useState(() => readDraft() || freshDraft());
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
    update({ step: Math.max(0, draft.step - 1), complete: false });
    setError('');
  };
  const summary = draft.complete ? previewSummary(normalizedAnswers(answers)) : null;
  return <main className="first-visit questionnaire-page">
    <nav className="first-visit-top"><Link to="/" className="first-visit-brand">青盈<span>·</span></Link><Link to="/">稍后继续</Link></nav>
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
        {currentUser ? <button type="button" className="first-visit-primary" onClick={() => navigate('/onboarding/complete')}>保存到我的问卷 →</button>
          : <Link className="first-visit-primary" to="/login?from=questionnaire">登录并保存到我的问卷 →</Link>}
      </div>
      {!currentUser && <p className="result-register">还没有账号？<Link to="/register?from=questionnaire">注册后保存</Link></p>}
    </section> : <section className="question-panel">
      <div className="question-progress"><span>{String(draft.step + 1).padStart(2, '0')} / 12</span><span>{question.topic}</span></div>
      <div className="question-track"><div style={{ width: `${(draft.step + 1) / questions.length * 100}%` }} /></div>
      <h1>{question.title}</h1>
      {question.hint && <p className="question-hint">{question.hint}</p>}
      {question.options ? <div className="question-options">{question.options.map(([id, label]) =>
        <button key={id} type="button" className={answers[question.id] === id ? 'selected' : ''} aria-pressed={answers[question.id] === id} onClick={() => choose(id)}>{label}<span aria-hidden="true">{answers[question.id] === id ? '✓' : '↗'}</span></button>)}</div>
        : <div className="question-amount"><label htmlFor="question-amount">金额（元）</label><input id="question-amount" type="number" inputMode="decimal" min="0" max={question.max} step="0.01" placeholder="可以填 0" value={answers[question.id] ?? ''} onChange={e => choose(e.target.value)} /></div>}
      {error && <p role="alert" className="question-error">{error}</p>}
      <div className="first-visit-actions"><button type="button" className="first-visit-secondary" onClick={back} disabled={draft.step === 0}>上一步</button><button type="button" className="first-visit-secondary" onClick={() => next(true)}>暂不回答</button><button type="button" className="first-visit-primary" onClick={() => next()} disabled={answers[question.id] === null}>下一步 →</button></div>
    </section>}
  </main>;
}

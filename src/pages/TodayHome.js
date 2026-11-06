import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { listTransactions } from '../services/api';
import { getAdaptiveLearning, getLearning } from '../services/learning';
import { dateKey } from '../components/FinanceVisuals';
import DailyPodcast from '../components/DailyPodcast';
import LivingFundsStressTest from '../components/LivingFundsStressTest';
import MonthlyAvailableFunds from '../components/MonthlyAvailableFunds';
import TodayPracticeMascot from '../components/TodayPracticeMascot';
import { DAILY_FUNDS_BREAKDOWN_ENABLED, LIVING_FUNDS_STRESS_TEST_ENABLED } from '../config/features';
import './TodayHome.css';

const yuan = value => `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TodayHome() {
  const { currentUser } = useAuth();
  const [practice, setPractice] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [entries, setEntries] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const version = useRef(0);
  const requestRefresh = useCallback(() => setReload(value => value + 1), []);

  const refresh = useCallback(async () => {
    const current = ++version.current;
    setLoading(true);
    const [learningResult, ledgerResult, entriesResult] = await Promise.allSettled([
      getAdaptiveLearning(), listTransactions(1), getLearning(),
    ]);
    if (current !== version.current) return;
    setPractice(learningResult.status === 'fulfilled' ? learningResult.value : null);
    setLedger(ledgerResult.status === 'fulfilled' ? ledgerResult.value : null);
    setEntries(entriesResult.status === 'fulfilled' ? entriesResult.value.entries || [] : null);
    setErrors({ learning: learningResult.status === 'rejected', ledger: ledgerResult.status === 'rejected' });
    setLoading(false);
  }, []);

  useEffect(() => {
    setPractice(null); setLedger(null); setEntries(null); setErrors({});
  }, [currentUser?.uid]);

  useEffect(() => {
    refresh();
    return () => { version.current += 1; };
  }, [currentUser?.uid, reload, refresh]);

  useEffect(() => {
    const update = () => setReload(value => value + 1);
    window.addEventListener('transaction-saved', update);
    window.addEventListener('learning-saved', update);
    window.addEventListener('focus', update);
    return () => {
      window.removeEventListener('transaction-saved', update);
      window.removeEventListener('learning-saved', update);
      window.removeEventListener('focus', update);
    };
  }, []);

  const item = practice?.next_item;
  const budget = ledger?.monthly_budget;
  const cashflow = ledger?.monthly_cashflow;
  const today = dateKey();
  const upcoming = (entries || []).filter(entry => entry.kind === 'upcoming' && !entry.handled && entry.due_date >= today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 3);
  const name = currentUser?.displayName?.trim() || '同学';
  return <div className="today-page">
    <div className="today-wrap">
      <header className="today-intro">
        <div className="today-masthead"><span className="today-eyebrow">青盈 · 生活费手账</span><time dateTime={today}>{today}</time></div>
        <h1>{name}，<br />把接下来的钱安排好</h1>
        <p>看看要先留哪笔钱，再决定今天怎么花。</p>
      </header>

      <div className="today-support">
        <section className="today-panel today-money-story" aria-labelledby="today-ledger-title">
          <span className="today-eyebrow">01 / 现在</span>
          <h2 id="today-ledger-title">手里的钱还能怎么安排？</h2>
          {errors.ledger ? <p role="status">账本暂时无法读取。<button type="button" className="today-inline-button" onClick={requestRefresh}>重试</button></p>
            : !budget ? <p role="status">{loading ? '正在读取本月记录…' : '暂无可汇总的账本记录。'}</p>
              : budget.complete !== false && budget.spent != null ? <>
                <MonthlyAvailableFunds key={currentUser?.uid} funds={ledger?.funds} enableDailyBreakdown={DAILY_FUNDS_BREAKDOWN_ENABLED} refreshing={loading} onRefresh={requestRefresh} />
                <div className="today-cashflow" aria-label="本月收支"><div><span>本月支出</span><strong>{yuan(cashflow?.spent ?? budget.spent)}</strong></div><div><span>本月收入</span><strong>{cashflow?.complete ? yuan(cashflow.income) : '暂未汇总'}</strong></div></div>
                <p>仅按已记录收支计算，退款抵减支出。{cashflow?.complete && (cashflow.has_expense_records === false || cashflow.has_income_records === false) && ' 本月有一侧尚无记录，结余可能不完整。'}</p>
              </> : <p>部分记录暂时无法汇总，请到账本核对。</p>}
          {LIVING_FUNDS_STRESS_TEST_ENABLED && <LivingFundsStressTest key={currentUser?.uid} funds={ledger?.funds} entries={entries} refreshing={loading} />}
          <div className="today-panel-links"><Link to="/dashboard">打开账本记一笔 <span aria-hidden="true">→</span></Link></div>
        </section>

        <section className="today-panel today-next" aria-labelledby="today-next-title">
          <span className="today-eyebrow">02 / 接下来</span>
          <h2 id="today-next-title">近期要留的钱</h2>
          {entries == null ? <p role="status">{loading ? '正在读取开支安排…' : '暂时无法读取开支安排。'}</p>
            : upcoming.length ? <ol className="today-timeline">{upcoming.map(entry => <li key={entry.id}>
              <time dateTime={entry.due_date}>{entry.due_date}</time>
              <strong>{entry.title}</strong>
              {entry.amount != null && Number.isFinite(Number(entry.amount)) && <span>{yuan(entry.amount)}</span>}
            </li>)}</ol> : <p>还没有待处理的开支安排。可以先记下一笔考试费、车费或订阅续费。</p>}
          <Link className="today-text-link" to="/dashboard?tab=upcoming">查看未来开支 <span aria-hidden="true">→</span></Link>
        </section>
      </div>

      <section className="today-task" aria-labelledby="today-task-title">
        <div className="today-task-top"><span className="today-eyebrow">03 / 今日练习</span></div>
        {loading && !practice && !errors.learning ? <div role="status" className="today-task-body">正在准备今天的练习…</div>
          : errors.learning ? <div className="today-task-body"><h2 id="today-task-title">暂时没能读取练习</h2><p>你的记录仍在。可以重试，或稍后从学习页进入。</p><button type="button" className="today-retry" onClick={() => setReload(value => value + 1)}>重新加载</button></div>
            : item ? <div className="today-task-body">
              <span className="today-task-step">{item.scenario_title || item.level || '情境练习'}{item.steps_total ? ` · 第 ${item.step} / ${item.steps_total} 步` : ''}</span>
              <h2 id="today-task-title">{item.scenario_context || item.question}</h2>
              {item.scenario_context && <p className="today-task-question">{item.question}</p>}
              <Link className="today-primary" to="/learning?tab=practice">开始这一步 <span aria-hidden="true">→</span></Link>
              {practice.reason && <details className="today-reason"><summary>为什么推荐这个问题？</summary><p>{practice.reason}</p><p className="today-reason-note">{practice.limitation}</p></details>}
            </div> : <div className="today-task-body"><h2 id="today-task-title">今天先到这里</h2><p>当前的新情境已经完成。想继续时，可以回看之前的选择。</p><Link className="today-primary" to="/learning?tab=growth">回看我的学习 <span aria-hidden="true">→</span></Link></div>}
        {/* 青苗鼹仅属于今日练习卡片，定位由卡片容器提供，不改变原内容布局。 */}
        <TodayPracticeMascot />
      </section>

      <DailyPodcast userId={currentUser?.uid} />
    </div>
  </div>;
}

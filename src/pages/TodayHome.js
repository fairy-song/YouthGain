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
import SpendingJourney from '../components/SpendingJourney';
import { DAILY_FUNDS_BREAKDOWN_ENABLED, LIVING_FUNDS_STRESS_TEST_ENABLED, SPENDING_JOURNEY_ENABLED, HOME_FOCUS_ENABLED } from '../config/features';
import TodayNextAction from '../components/TodayNextAction';
import { todayPriority, pendingPayments } from '../utils/todayPriority';
import './TodayHome.css';

const yuan = value => `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const readers = { learning: getAdaptiveLearning, ledger: () => listTransactions(1), upcoming: async () => (await getLearning()).entries || [] };
const pending = { loading: true };

export default function TodayHome() {
  const { currentUser } = useAuth();
  const [sections, setSections] = useState({});
  const requests = useRef({});
  const spendingPanel = useRef(null);
  const studyRequested = useRef(!HOME_FOCUS_ENABLED);
  const [studyOpened, setStudyOpened] = useState(!HOME_FOCUS_ENABLED);
  const refresh = useCallback(async key => {
    const request = Symbol(key);
    requests.current[key] = request;
    setSections(current => ({ ...current, [key]: { ...current[key], loading: true, error: false } }));
    let result;
    try { result = { data: await readers[key]() }; }
    catch { result = { error: true }; }
    if (requests.current[key] === request) setSections(current => ({ ...current, [key]: result }));
  }, []);
  const refreshLedger = useCallback(() => refresh('ledger'), [refresh]);

  useEffect(() => {
    const update = () => ['ledger', 'upcoming', ...(studyRequested.current ? ['learning'] : [])].forEach(refresh);
    update();
    window.addEventListener('transaction-saved', update);
    window.addEventListener('learning-saved', update);
    window.addEventListener('focus', update);
    return () => {
      requests.current = {};
      window.removeEventListener('transaction-saved', update);
      window.removeEventListener('learning-saved', update);
      window.removeEventListener('focus', update);
    };
  }, [refresh]);

  const { data: practice, loading: practiceLoading, error: practiceError } = sections.learning || pending;
  const { data: ledger, loading: ledgerLoading, error: ledgerError } = sections.ledger || pending;
  const { data: entries, loading: entriesLoading, error: entriesError } = sections.upcoming || pending;
  const item = practice?.next_item;
  const budget = ledger?.monthly_budget;
  const cashflow = ledger?.monthly_cashflow;
  const today = dateKey();
  const payments = pendingPayments(entries);
  const upcoming = payments.slice(0, 3);
  const priority = todayPriority({ entries, ledger, today, ledgerError, entriesError });
  const action = priority.kind === 'spending' && !SPENDING_JOURNEY_ENABLED
    ? { ...priority, to: '/dashboard', label: '查看账本' } : priority;
  const explore = () => {
    if (spendingPanel.current) {
      spendingPanel.current.open = true;
      const heading = spendingPanel.current.querySelector('summary');
      heading?.focus(); heading?.scrollIntoView?.({ block: 'start' });
    }
  };
  const name = currentUser?.displayName?.trim() || '同学';
  return <div className={`today-page${HOME_FOCUS_ENABLED ? ' is-focused' : ''}`}>
    <div className="today-wrap">
      <header className="today-intro">
        <div className="today-masthead"><span className="today-eyebrow">青盈 · 财商实践</span><time dateTime={today}>{today}</time></div>
        <h1>{name}，<br />{SPENDING_JOURNEY_ENABLED ? '看懂花费，安排生活' : '把接下来的钱安排好'}</h1>
      </header>

      {HOME_FOCUS_ENABLED && <TodayNextAction action={action} onExplore={explore}
        onRetry={kind => refresh(kind === 'retry-upcoming' ? 'upcoming' : 'ledger')} />}
      {SPENDING_JOURNEY_ENABLED && (HOME_FOCUS_ENABLED ? <details ref={spendingPanel} className="today-disclosure">
        <summary>看见花费 · 展开钱币与消费观察</summary>
        <SpendingJourney cashflow={cashflow} loading={ledgerLoading} error={ledgerError} entries={entries} onRetry={refreshLedger} />
      </details> : <SpendingJourney cashflow={cashflow} loading={ledgerLoading} error={ledgerError} entries={entries} onRetry={refreshLedger} />)}

      <div className="today-support">
        <section className="today-panel today-money-story" aria-labelledby="today-ledger-title">
          <span className="today-eyebrow">01 / 现在</span>
          <h2 id="today-ledger-title">手里的钱还能怎么安排？</h2>
          {ledgerError ? <p role="status">账本暂时无法读取。<button type="button" className="today-inline-button" onClick={refreshLedger}>重试</button></p>
            : !budget ? <p role="status">{ledgerLoading ? '正在读取本月记录…' : '暂无可汇总的账本记录。'}</p>
              : budget.complete !== false && budget.spent != null ? <>
                <MonthlyAvailableFunds key={currentUser?.uid} funds={ledger?.funds} compact={HOME_FOCUS_ENABLED} enableDailyBreakdown={DAILY_FUNDS_BREAKDOWN_ENABLED} refreshing={ledgerLoading} onRefresh={refreshLedger} />
                <div className="today-cashflow" aria-label="本月收支"><div><span>本月支出</span><strong>{yuan(cashflow?.spent ?? budget.spent)}</strong></div><div><span>本月收入</span><strong>{cashflow?.complete ? yuan(cashflow.income) : '暂未汇总'}</strong></div></div>
                <p>仅含已记录收支。{cashflow?.complete && (cashflow.has_expense_records === false || cashflow.has_income_records === false) && ' 本月有一侧尚无记录，结余可能不完整。'}</p>
              </> : <p>部分记录暂时无法汇总，请到账本核对。</p>}
          {LIVING_FUNDS_STRESS_TEST_ENABLED && <LivingFundsStressTest key={currentUser?.uid} funds={ledger?.funds} entries={entries} refreshing={ledgerLoading} />}
          <div className="today-panel-links"><Link to="/dashboard">打开账本记一笔 <span aria-hidden="true">→</span></Link></div>
        </section>

        <section className="today-panel today-next" aria-labelledby="today-next-title">
          <span className="today-eyebrow">02 / 接下来</span>
          <h2 id="today-next-title">待支付事项</h2>
          {entries == null ? <p role="status">{entriesLoading ? '正在读取开支安排…' : <>暂时无法读取开支安排。<button type="button" className="today-inline-button" onClick={() => refresh('upcoming')}>重试开支</button></>}</p>
            : upcoming.length ? <ol className="today-timeline">{upcoming.map(entry => <li key={entry.id}>
              <time dateTime={entry.due_date}>{entry.due_date} {entry.due_date < today ? '· 过期待核对' : entry.due_date === today ? '· 今天' : ''}</time>
              <strong>{entry.title}</strong>
              {entry.amount != null && Number.isFinite(Number(entry.amount)) && <span>{yuan(entry.amount)}</span>}
            </li>)}</ol> : <p>还没有待处理的开支安排。可以先记下一笔考试费、车费或订阅续费。</p>}
          <Link className="today-text-link" to="/dashboard?tab=upcoming">查看全部 {payments.length > 3 ? `（${payments.length} 项）` : ''}<span aria-hidden="true">→</span></Link>
        </section>
      </div>

      <details className="today-disclosure today-optional" open={!HOME_FOCUS_ENABLED || undefined} onToggle={event => {
        if (event.currentTarget.open && !studyRequested.current) {
          studyRequested.current = true; setStudyOpened(true); refresh('learning');
        }
      }}>
      <summary>想继续时 · 情境练习与知识推荐</summary>
      <section className="today-task" aria-labelledby="today-task-title">
        <div className="today-task-top"><span className="today-eyebrow">03 / 今日练习</span></div>
        {practiceLoading && !practice ? <div role="status" className="today-task-body">正在准备今天的练习…</div>
          : practiceError ? <div className="today-task-body"><h2 id="today-task-title">暂时没能读取练习</h2><p>你的记录仍在。可以重试，或稍后从学习页进入。</p><button type="button" className="today-retry" onClick={() => refresh('learning')}>重新加载</button></div>
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

      <div id="today-podcast" tabIndex={-1} aria-label="本次知识推荐">{(!HOME_FOCUS_ENABLED || studyOpened) && <DailyPodcast userId={currentUser?.uid} />}</div>
      </details>
    </div>
  </div>;
}

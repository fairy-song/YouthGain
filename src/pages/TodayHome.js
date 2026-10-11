import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { listTransactions } from '../services/api';
import { getAdaptiveLearning, getLearning } from '../services/learning';
import { dateKey } from '../components/FinanceVisuals';
import DailyPodcast from '../components/DailyPodcast';
import './TodayHome.css';

const yuan = value => `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TodayHome() {
  const { currentUser } = useAuth();
  const [practice, setPractice] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [upcoming, setUpcoming] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const version = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++version.current;
    setLoading(true);
    const [learningResult, ledgerResult, entriesResult] = await Promise.allSettled([
      getAdaptiveLearning(), listTransactions(1), getLearning(),
    ]);
    if (current !== version.current) return;
    setPractice(learningResult.status === 'fulfilled' ? learningResult.value : null);
    setLedger(ledgerResult.status === 'fulfilled' ? ledgerResult.value : null);
    const entries = entriesResult.status === 'fulfilled' ? entriesResult.value.entries || [] : [];
    const today = dateKey();
    setUpcoming(entries.filter(entry => entry.kind === 'upcoming' && !entry.handled && entry.due_date >= today)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] || null);
    setErrors({ learning: learningResult.status === 'rejected', ledger: ledgerResult.status === 'rejected' });
    setLoading(false);
  }, []);

  useEffect(() => {
    setPractice(null); setLedger(null); setUpcoming(null); setErrors({});
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
  const name = currentUser?.displayName?.trim() || '同学';
  return <div className="today-page">
    <div className="today-wrap">
      <header className="today-intro">
        <span className="today-eyebrow">青盈 · 今天</span>
        <h1>{name}，今天先做一步</h1>
        <p>用一个小问题，慢慢练习看清钱的去向与选择。</p>
      </header>

      <section className="today-task" aria-labelledby="today-task-title">
        <div className="today-task-top"><span className="today-tag">今日练习</span><span className="today-task-meta">一次只看一个问题</span></div>
        {loading && !practice && !errors.learning ? <div role="status" className="today-task-body">正在准备今天的练习…</div>
          : errors.learning ? <div className="today-task-body"><h2 id="today-task-title">暂时没能读取练习</h2><p>你的记录仍在。可以重试，或稍后从学习页进入。</p><button type="button" className="today-retry" onClick={() => setReload(value => value + 1)}>重新加载</button></div>
            : item ? <div className="today-task-body">
              <span className="today-task-step">{item.scenario_title || item.level || '情境练习'}{item.steps_total ? ` · 第 ${item.step} / ${item.steps_total} 步` : ''}</span>
              <h2 id="today-task-title">{item.scenario_context || item.question}</h2>
              {item.scenario_context && <p className="today-task-question">{item.question}</p>}
              <Link className="today-primary" to="/learning?tab=practice">开始这一步 <span aria-hidden="true">→</span></Link>
              {practice.reason && <details className="today-reason"><summary>为什么推荐这个问题？</summary><p>{practice.reason}</p><p className="today-reason-note">{practice.limitation}</p></details>}
            </div> : <div className="today-task-body"><h2 id="today-task-title">今天先到这里</h2><p>当前的新情境已经完成。想继续时，可以回看之前的选择。</p><Link className="today-primary" to="/learning?tab=growth">回看我的学习 <span aria-hidden="true">→</span></Link></div>}
      </section>

      <div className="today-support">
        <section className="today-panel" aria-labelledby="today-ledger-title">
          <div className="today-panel-top"><span className="today-panel-icon" aria-hidden="true">¥</span><span>我的账本</span></div>
          <h2 id="today-ledger-title">本月收支</h2>
          {errors.ledger ? <p role="status">账本暂时无法读取。<button type="button" className="today-inline-button" onClick={() => setReload(value => value + 1)}>重试</button></p>
            : !budget ? <p role="status">{loading ? '正在读取本月记录…' : '暂无可汇总的账本记录。'}</p>
              : budget.complete !== false && budget.spent != null ? <><div className="today-cashflow"><div><span>支出</span><strong className="today-amount">{yuan(cashflow?.spent ?? budget.spent)}</strong></div><div><span>收入</span><strong>{cashflow?.complete ? yuan(cashflow.income) : '暂未汇总'}</strong></div><div><span>剩余</span><strong>{cashflow?.complete ? yuan(cashflow.remaining) : '暂未汇总'}</strong></div></div><p>仅按已记录收支计算；退款抵减支出，剩余不是账户余额。{cashflow?.complete && (cashflow.has_expense_records === false || cashflow.has_income_records === false) && ' 本月有一侧尚无记录，结余可能不完整。'}</p></>
                : <p>部分记录暂时无法汇总，请到账本核对。</p>}
          <div className="today-panel-links"><Link to="/dashboard">记一笔</Link><Link to="/dashboard">查看账本</Link></div>
        </section>

        <section className="today-panel today-panel-soft" aria-labelledby="today-next-title">
          <div className="today-panel-top"><span className="today-panel-icon" aria-hidden="true">↗</span><span>接下来</span></div>
          {upcoming ? <><h2 id="today-next-title">有一项开支值得提前看</h2><p className="today-upcoming">{upcoming.title} · {upcoming.due_date}</p><p>这是你的安排，尚未自动扣款。</p><Link className="today-text-link" to="/dashboard?tab=upcoming">查看这项安排 →</Link></>
            : <><h2 id="today-next-title">留一点时间给自己</h2><p>记录一笔真实消费，或回看一次之前的选择，都可以慢慢来。</p><Link className="today-text-link" to="/learning?tab=review">做一次简短回看 →</Link></>}
        </section>
      </div>
      <DailyPodcast userId={currentUser?.uid} />
    </div>
  </div>;
}

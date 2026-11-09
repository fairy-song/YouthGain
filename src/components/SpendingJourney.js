import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import ExpenseMoney from './ExpenseMoney';
import { expenseYuan } from '../utils/expenseMoney';
import { latestReview, perceptionLabels, spendingObservation, spendingSnapshot } from '../utils/spendingJourney';
import { SPENDING_MONEY_VISUAL_ENABLED } from '../config/features';
import './SpendingJourney.css';

export default function SpendingJourney({ cashflow, loading, error, entries, onRetry }) {
  const snapshot = spendingSnapshot(cashflow);
  const previous = latestReview(entries);
  return <section className="spending-journey" aria-labelledby="spending-journey-title">
    <div className="journey-heading"><h2 id="spending-journey-title">钱花出去了，感受跟上了吗？</h2>
      </div>
    {error ? <p role="status">消费汇总暂时不可用。<button type="button" className="today-inline-button" onClick={onRetry}>重试消费汇总</button></p>
      : loading && !snapshot ? <p role="status">正在核对已记录的消费…</p>
        : !snapshot ? <div className="journey-empty"><p>暂时没有可核对的分类汇总，不能据此判断你的消费情况。</p><Link className="today-primary" to="/dashboard">到账本核对或补充记录 →</Link></div>
          : !snapshot.rows.length ? <div className="journey-empty"><h3>先从一笔你关心的花费开始</h3><p>{snapshot.month} 暂无已记录的消费，这不代表你没有花钱。可以记一笔，也可以到账本导入已有账单。</p><Link className="today-primary" to="/dashboard">记一笔或导入账单 →</Link></div>
            : <SpendingObservation key={JSON.stringify(snapshot)} snapshot={snapshot} refreshing={loading} />}
    <div className="journey-return">
      {previous ? <><span className="today-eyebrow">上次，你想试试</span><p className="journey-last-action">{previous.next_action}</p><p className="journey-note">{previous.week ? `${previous.week} 所在周的记录 · ` : ''}</p><Link to="/learning?tab=review">回看上次行动 →</Link></>
        : <><p>想先安排接下来的生活？从一笔已知的开支开始。</p><Link to="/dashboard?tab=upcoming">安排未来开支 →</Link></>}
    </div>
  </section>;
}

function SpendingObservation({ snapshot, refreshing }) {
  const [selected, setSelected] = useState(snapshot.rows[0].category);
  const [perception, setPerception] = useState('');
  const row = snapshot.rows.find(part => part.category === selected);
  const observation = spendingObservation(snapshot, row, perception);
  return <div className="journey-observation">
    {refreshing && <p role="status">正在核对最新记录，更新完成后可继续。你的选择会在金额未变化时保留。</p>}
    <p className="journey-note">{snapshot.month} · 已记录消费 · 不含漏记</p>
    <details className="journey-note"><summary>统计口径</summary><p>仅含已记录消费；退款按发生月份抵减，可能来自更早的消费。</p></details>
    <label className="journey-category">这次想看哪一类？<select disabled={refreshing} value={selected} onChange={e => { setSelected(e.target.value); setPerception(''); }}>
      {snapshot.rows.map(part => <option key={part.category} value={part.category}>{part.category}</option>)}
    </select></label>
    <div className="journey-amount"><span>{row.category} · 已记录净支出</span><strong>{expenseYuan(row.net)}</strong></div>
    <dl className="clarity-inline" aria-label="支出与退款"><div><dt>支出</dt><dd>{expenseYuan(row.gross)}</dd></div><div><dt>退款</dt><dd>− {expenseYuan(row.refunds)}</dd></div></dl>
    {row.net > 0 && SPENDING_MONEY_VISUAL_ENABLED && <details className="journey-money" key={selected}><summary>展开成实实在在的钱</summary><ExpenseMoney showHeading={false} amount={row.net / 100} title={`${row.category}累计净支出`} note="示意图，数量以标注为准。" /></details>}
    {row.net <= 0 && <p className="journey-note">{row.net < 0 ? '本月这类退款超过支出，可能包含以前月份的退款。' : '这类已记录支出与退款抵消。'}不能据此认定本月没有消费。</p>}
    <fieldset className="journey-perception" disabled={refreshing}><legend>和你原来的感觉相比呢？</legend><div>{Object.entries(perceptionLabels).map(([value, label]) => <label key={value}><input type="radio" name="spending-perception" value={value} checked={perception === value} onChange={() => setPerception(value)} /><span>{label}</span></label>)}</div></fieldset>
    {perception && !refreshing && <div className="journey-next-step">
      <p role="status">{perception === 'surprised' ? '先核对大额开支和退款。' : perception === 'expected' ? '记下这次有效的安排。' : '先想想这些钱用在了哪里。'}</p>
      <div className="journey-links"><Link className="today-primary" to="/coach" state={{ returnTo: '/', prompt: `${observation} 请先问我一个问题，了解这些支出的用途和我的生活安排，再帮我分析；不要直接认定我浪费或冲动消费。` }}>带着这次观察问教练 →</Link>
        <Link to="/learning?tab=review" state={{ spendingObservation: observation }}>记下观察与下一步 →</Link>
        <Link to="/dashboard?tab=upcoming">先看看接下来要留的钱 →</Link></div>
      <p className="journey-note">核对并发送后才交给 AI；复盘需确认保存。</p>
    </div>}
    <a className="journey-recommendation" href="#today-podcast" onClick={event => { event.preventDefault(); document.getElementById('today-podcast')?.focus(); document.getElementById('today-podcast')?.scrollIntoView({ block: 'start' }); }}>想先了解一点知识？看看本次推荐 ↓</a>
  </div>;
}

import React from 'react';
import { Link } from 'react-router-dom';
import { formatMoney } from '../utils/availableFunds';

export default function TodayNextAction({ action, onRetry, onExplore }) {
  return <section className="today-priority" aria-labelledby="today-priority-title" data-action={action.kind}>
    <span className="today-eyebrow">现在，先做这一件</span>
    <h2 id="today-priority-title">{action.title}</h2>
    {action.kind === 'loading' ? <p role="status">读取完成后，会显示适合当前情况的下一步。</p> : <>
      {action.text && <p>{action.text}</p>}
      {action.date && <div className="today-priority-facts"><time dateTime={action.date}>{action.date}</time>
        <span>{action.kind === 'overdue' ? '日期已过 · 尚未标记处理' : '待支付'}</span>
        <strong>{formatMoney(action.amount == null || String(action.amount).trim() === '' ? null : Number(action.amount))}</strong></div>}
      {action.count > 1 && <p className="today-priority-note">另有 {action.count - 1} 项过期待核对。</p>}
      {action.to ? <Link className="today-primary" to={action.to}>{action.label} <span aria-hidden="true">→</span></Link>
        : <button className="today-priority-button" type="button" onClick={action.kind.startsWith('retry-') ? () => onRetry(action.kind) : onExplore}>{action.label} <span aria-hidden="true">→</span></button>}
    </>}
  </section>;
}

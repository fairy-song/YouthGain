import React, { useEffect, useState } from 'react';
import { denominationText, expenseMoney, expenseYuan } from '../utils/expenseMoney';
import './ExpenseMoney.css';

const ANIMATION_MS = 1400;

function MoneyArt({ piece }) {
  const layers = Math.min(3, piece.count);
  return <svg className="expense-money-art" viewBox="0 0 146 86" aria-hidden="true" focusable="false">
    {Array.from({ length: layers }, (_, i) => piece.kind === 'note' ? <g key={i} transform={`translate(${i * 4} ${-i * 4})`}>
      <rect x="9" y="24" width="116" height="53" rx="7" fill="var(--expense-note-fill)" stroke="var(--expense-note-line)" />
      <rect x="15" y="30" width="104" height="41" rx="5" fill="none" stroke="var(--expense-note-line)" strokeDasharray="2 3" />
      <circle cx="37" cy="50" r="12" fill="var(--expense-note-medallion)" />
      <text x="37" y="55" textAnchor="middle" fill="var(--expense-note-ink)" fontSize="15">¥</text>
      <text x="85" y="57" textAnchor="middle" fill="var(--expense-note-ink)" fontSize="23" fontWeight="700">{piece.cents / 100}</text>
    </g> : <g key={i} transform={`translate(${i * 9} ${-i * 5})`}>
      <ellipse cx="60" cy="55" rx="31" ry="27" fill="var(--expense-coin-edge)" />
      <circle cx="60" cy="49" r="28" fill="var(--expense-coin-fill)" stroke="var(--expense-coin-edge)" strokeWidth="2" />
      <circle cx="60" cy="49" r="22" fill="none" stroke="var(--expense-coin-edge)" strokeDasharray="1 2" />
      <text x="60" y="54" textAnchor="middle" fill="var(--expense-coin-ink)" fontSize="15" fontWeight="700">{piece.cents / 100}</text>
    </g>)}
  </svg>;
}

export default function ExpenseMoney({ amount, animate = false, title = '这笔花了', note = '' }) {
  const money = expenseMoney(amount);
  const cents = money?.cents;
  const [phase, setPhase] = useState('still');
  useEffect(() => {
    if (!cents || !animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setPhase('still');
      return undefined;
    }
    setPhase('moving');
    const timer = window.setTimeout(() => setPhase('spent'), ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [animate, cents]); // Only a new confirmed amount can start this instance.

  if (!money) return null;
  return <section className={`expense-money expense-money-${phase}`} aria-label={`${title}的钱币展示`} style={{ '--expense-money-duration': `${ANIMATION_MS}ms` }}>
    <div className="expense-money-heading"><span>{title}</span><strong>{expenseYuan(money.cents)}</strong></div>
    <p className="expense-money-caption">把这笔支出，展开成看得见的钱。</p>
    <ul className="expense-money-pieces" aria-label="面额与数量">
      {money.pieces.map(piece => <li key={piece.cents}>
        <MoneyArt piece={piece} />
        <span className="expense-money-denomination">{denominationText(piece.cents)} <b>× {piece.count.toLocaleString('zh-CN')}{piece.kind === 'note' ? '张' : '枚'}</b></span>
        <small>{expenseYuan(piece.cents * piece.count)}</small>
      </li>)}
    </ul>
    <p className="expense-money-total">合计 {expenseYuan(money.cents)}{animate ? ' · 已计入这笔支出' : ''}</p>
    <p className="expense-money-note">{note || '按人民币面额拆分；图形为示意，数量以标注为准。记账不会实际扣款。'}</p>
  </section>;
}

import React from 'react';

function Coin({ x, y }) {
  return <g transform={`translate(${x} ${y})`}>
    <path d="M-19 0v5c0 10 38 10 38 0V0" fill="#c8a365" />
    <ellipse rx="19" ry="7" fill="#f0d9a3" stroke="#b18a4e" />
    <ellipse rx="12" ry="4" fill="none" stroke="#d6b477" />
  </g>;
}

export default function FundsBreakdownVisual({ remainingDays, playing }) {
  return <div className="funds-breakdown-visual">
    <svg viewBox="0 0 280 92" aria-hidden="true" focusable="false" className={playing ? 'funds-breakdown-playing' : ''}>
      <ellipse cx="66" cy="77" rx="44" ry="5" fill="var(--yg-primary-subtle, #E0F1EA)" />
      <ellipse cx="220" cy="77" rx="32" ry="5" fill="var(--yg-primary-subtle, #E0F1EA)" />
      {[0, 1, 2, 3, 4].map(i => <Coin key={i} x={58} y={68 - i * 9} />)}
      {[0, 1, 2].map(i => <Coin key={i} x={91} y={67 - i * 9} />)}
      <path d="M126 45h43m-7-6 7 6-7 6" fill="none" stroke="var(--yg-primary-text, #30775A)" strokeWidth="2" strokeLinecap="round" />
      <g className="funds-breakdown-portion"><Coin x={220} y={68} /><Coin x={220} y={59} /><Coin x={220} y={50} /></g>
    </svg>
    <span>每天一份 × {remainingDays} 天 · 钱币仅作示意</span>
  </div>;
}

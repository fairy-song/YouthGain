import React, { useState } from 'react';
import './FinanceVisuals.css';

const colors = ['#168575', '#527bc1', '#c88735', '#9569b0', '#ce6479', '#6c7c89'];
const money = n => `¥${Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
export function dateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function summarizeTransactions(transactions, today = dateKey()) {
  const rows = transactions.filter(t => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && t.date <= today && Number.isFinite(Number(t.amount)) && Number(t.amount) > 0);
  const categories = new Map();
  rows.forEach(t => categories.set(t.category || '未分类', (categories.get(t.category || '未分类') || 0) + Number(t.amount)));
  const end = new Date(`${today}T12:00:00+08:00`);
  const days = Array.from({ length: 7 }, (_, i) => {
    const key = dateKey(new Date(end.getTime() - (6 - i) * 86400000));
    return { label: key.slice(5), key, value: rows.filter(t => t.date === key).reduce((sum, t) => sum + Number(t.amount), 0) };
  });
  return { rows, categories: [...categories].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value), days };
}

export function ComparisonBars({ items, label = '方案余量比较' }) {
  const valid = items.filter(i => Number.isFinite(i.value));
  const max = Math.max(1, ...valid.map(i => Math.abs(i.value)));
  return <div className="fv-comparison" role="group" aria-label={label}>{valid.map((item, i) => <div key={item.label} className="fv-compare-row">
    <div className="fv-label"><span>{item.label}</span><strong>{money(item.value)}{item.value < 0 ? '（不足）' : ''}</strong></div>
    <div className="fv-signed-track"><span className="fv-zero" /><span className="fv-signed-bar" style={{ left: item.value < 0 ? `${50 - Math.abs(item.value) / max * 50}%` : '50%', width: `${Math.abs(item.value) / max * 50}%`, background: item.value < 0 ? '#b64e62' : colors[i % colors.length] }} /></div>
  </div>)}<small className="text-muted">中线为零；左侧为不足，右侧为剩余。</small></div>;
}

export default function FinanceVisuals({ transactions, onCategory, selectedCategory = '' }) {
  const [view, setView] = useState('category');
  const { rows, categories, days } = summarizeTransactions(transactions);
  const total = categories.reduce((s, c) => s + c.value, 0);
  const [activeDay, setActiveDay] = useState('');
  const selectedDay = days.find(d => d.key === activeDay);
  const top = categories.slice(0, 5);
  const rest = categories.slice(5);
  const slices = rest.length ? [...top, { label: '其他类别', value: rest.reduce((s, c) => s + c.value, 0) }] : top;
  let offset = 0;
  return <section className="fv-panel mb-4" aria-labelledby="spending-visual-title">
    <div className="fv-heading"><div><span className="fv-eyebrow">看见每一笔</span><h2 id="spending-visual-title">消费概览</h2></div><div className="fv-tabs" aria-label="图表类型">{[['category', '支出构成'], ['week', '近七天']].map(([key, title]) => <button type="button" key={key} aria-pressed={view === key} onClick={() => setView(key)}>{title}</button>)}</div></div>
    <p className="fv-caption">基于已加载的最近 {transactions.length} 笔记录（最多 50 笔），可能不完整；不含未来日期及非正数金额。</p>
    {!rows.length ? <div className="fv-empty">还没有可展示的消费。记下第一笔，看看钱花在哪里。</div> : view === 'category' ? <div className="fv-donut-layout">
      <svg viewBox="0 0 240 240" className="fv-donut" role="img" aria-label={`支出构成，已加载记录合计 ${money(total)}；各类别金额见旁边按钮`}>
        {slices.map((c, i) => { const fraction = c.value / total * 100; const start = offset; offset += fraction; return <circle key={c.label} cx="120" cy="120" r="87" fill="none" stroke={colors[i]} strokeWidth="28" pathLength="100" strokeDasharray={`${fraction} ${100 - fraction}`} strokeDashoffset={-start} transform="rotate(-90 120 120)" />; })}
        <text x="120" y="113" textAnchor="middle" className="fv-svg-caption">已记录支出</text><text x="120" y="142" textAnchor="middle" className="fv-svg-total">{money(total)}</text>
      </svg>
      <div className="fv-legend"><p className="mb-2">{categories[0].label}占比最高 · {(categories[0].value / total * 100).toFixed(1)}%</p>{categories.map((c, i) => <button type="button" key={c.label} aria-pressed={selectedCategory === c.label} onClick={() => onCategory(selectedCategory === c.label ? '' : c.label)}><span><i style={{ background: colors[Math.min(i, 5)] }} />{c.label}</span><strong>{money(c.value)} <small>{(c.value / total * 100).toFixed(1)}%</small></strong></button>)}<small className="text-muted">点选类别，筛选下方账单。{rest.length > 0 && '环形图将第六类起合并为其他类别。'}</small></div>
    </div> : <div><div className="fv-columns" role="group" aria-label="近七天已记录支出柱状图">{days.map(d => <button type="button" key={d.key} aria-pressed={activeDay === d.key} aria-label={`${d.key}，已记录 ${money(d.value)}`} onClick={() => setActiveDay(d.key)}><span className="fv-column-value">{money(d.value)}</span><span className="fv-column-track"><span style={{ height: `${d.value / Math.max(1, ...days.map(v => v.value)) * 100}%` }} /></span><span>{d.label}</span></button>)}</div><p className="fv-caption mt-3" role="status">{selectedDay ? `${selectedDay.key}：已记录 ${money(selectedDay.value)}。` : '点选柱形查看当日金额。'} 零表示当前记录中无支出，不代表当天没有消费。</p></div>}
  </section>;
}

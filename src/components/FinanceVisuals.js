import React, { useState } from 'react';
import './FinanceVisuals.css';

const colors = ['#168575', '#527bc1', '#c88735', '#9569b0', '#ce6479', '#6c7c89'];
const money = n => `¥${Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
const ledgerMoney = n => `¥${Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function dateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function ComparisonBars({ items, label = '方案余量比较' }) {
  const valid = items.filter(i => Number.isFinite(i.value));
  const max = Math.max(1, ...valid.map(i => Math.abs(i.value)));
  return <div className="fv-comparison" role="group" aria-label={label}>{valid.map((item, i) => <div key={item.label} className="fv-compare-row">
    <div className="fv-label"><span>{item.label}</span><strong>{money(item.value)}{item.value < 0 ? '（不足）' : ''}</strong></div>
    <div className="fv-signed-track"><span className="fv-zero" /><span className="fv-signed-bar" style={{ left: item.value < 0 ? `${50 - Math.abs(item.value) / max * 50}%` : '50%', width: `${Math.abs(item.value) / max * 50}%`, background: item.value < 0 ? '#b64e62' : colors[i % colors.length] }} /></div>
  </div>)}<small className="text-muted">中线为零；左侧为不足，右侧为剩余。</small></div>;
}

function SpendingDonut({ items, total, net, selectedCategory }) {
  let angle = -Math.PI / 2;
  const amount = ledgerMoney(net);
  const amountSize = Math.max(12, Math.min(22, 128 / (amount.length * 0.65)));
  return <svg className="fv-donut" viewBox="0 0 240 240" role="img" aria-label="本月支出构成圆环图">
    {items.map(item => {
      const start = angle;
      const share = item.value / total;
      angle += share * Math.PI * 2;
      const title = `${item.category}：${ledgerMoney(item.value)}，占比 ${(share * 100).toLocaleString('zh-CN', { maximumFractionDigits: 1 })}%`;
      const appearance = {
        fill: item.color,
        stroke: selectedCategory === item.category ? '#173e30' : '#fff',
        strokeWidth: selectedCategory === item.category ? 4 : 2,
        opacity: selectedCategory && selectedCategory !== item.category ? 0.45 : 1,
      };
      return items.length === 1 ? <circle key={item.category} cx="120" cy="120" r="84" fill="none" stroke={item.color} strokeWidth="32" opacity={appearance.opacity}><title>{title}</title></circle> :
        <path key={item.category} d={`M ${120 + 100 * Math.cos(start)} ${120 + 100 * Math.sin(start)} A 100 100 0 ${share > 0.5 ? 1 : 0} 1 ${120 + 100 * Math.cos(angle)} ${120 + 100 * Math.sin(angle)} L ${120 + 68 * Math.cos(angle)} ${120 + 68 * Math.sin(angle)} A 68 68 0 ${share > 0.5 ? 1 : 0} 0 ${120 + 68 * Math.cos(start)} ${120 + 68 * Math.sin(start)} Z`} {...appearance}><title>{title}</title></path>;
    })}
    <text className="fv-svg-caption" x="120" y="104" textAnchor="middle">{net < 0 ? '本月净回款' : '本月总支出'}</text>
    <text className="fv-svg-total" x="120" y="134" textAnchor="middle" style={{ fontSize: amountSize }}>{amount}</text>
    <text className="fv-svg-note" x="120" y="155" textAnchor="middle">已扣除关联退款</text>
  </svg>;
}

export default function FinanceVisuals({ monthlyCashflow, monthlyBudget, onCategory, selectedCategory = '', showBudgetSummary = true }) {
  const [view, setView] = useState('category');
  const [activeDay, setActiveDay] = useState('');
  const complete = monthlyCashflow?.complete === true &&
    Array.isArray(monthlyCashflow.category_breakdown) && Array.isArray(monthlyCashflow.daily_spending);
  const categories = complete ? monthlyCashflow.category_breakdown : [];
  const days = complete ? monthlyCashflow.daily_spending : [];
  const net = Number(monthlyCashflow?.spent ?? 0);
  const selectedDay = days.find(day => day.date === activeDay);
  const pieItems = categories.map((category, index) => ({ category: category.category, value: Number(category.net), color: colors[index % colors.length] }))
    .filter(item => Number.isFinite(item.value) && item.value > 0);
  const pieTotal = pieItems.reduce((total, item) => total + item.value, 0);
  const hasNetRefunds = categories.some(category => Number(category.net) < 0);
  const maxDay = Math.max(1, ...days.map(day => Math.abs(Number(day.spent))));
  const weekRange = days.length ? `${days[0].date} 至 ${days[days.length - 1].date}` : '近七天';

  return <section className="fv-panel mb-4" aria-labelledby="spending-visual-title">
    <div className="fv-heading"><div><span className="fv-eyebrow">看见每一笔</span><h2 id="spending-visual-title">消费概览</h2></div><div className="fv-tabs" aria-label="图表类型">{[['category', '本月支出构成'], ['week', '近七天']].map(([key, title]) => <button type="button" key={key} aria-pressed={view === key} onClick={() => setView(key)}>{title}</button>)}</div></div>
    {showBudgetSummary && <div className="mb-3 p-3 rounded bg-light" role="status">
      <div className="text-muted">{monthlyBudget?.month || dateKey().slice(0, 7)} · {monthlyBudget?.remaining < 0 ? '本月超支' : '本月预算剩余'}</div>
      <strong className={monthlyBudget?.remaining < 0 ? 'h3 text-danger' : 'h3 text-success'}>{monthlyBudget?.remaining == null ? (monthlyBudget?.budget == null ? '请在“我的”填写月生活费或收入' : '消费记录不完整，暂无法计算') : money(Math.abs(monthlyBudget.remaining))}</strong>
      {monthlyBudget?.spent != null && <div>本月净消费 {money(monthlyBudget.spent)}{monthlyBudget.budget != null && ` · 本月预算 ${money(monthlyBudget.budget)}`}</div>}
      <div className="small text-muted">以月生活费或收入作为预算，仅扣本月已发生的记录，不含历史积蓄；尚未扣除未来开支，漏记会影响结果。</div>
    </div>}
    {!complete ? <div className="fv-empty" role="status">消费概览暂无法汇总，请重试。不会用最近账单代替本月统计。</div> : <>
      <p className="fv-caption" role="status">{monthlyCashflow.month} · {net < 0 ? '本月净回款' : '本月净支出'} <strong>{ledgerMoney(net)}</strong>（原支付 {ledgerMoney(monthlyCashflow.gross_expense)} − 已关联退款 {ledgerMoney(monthlyCashflow.refunds)}）。按全部已记录交易汇总；下方最近账单仅展示部分明细。</p>
      {view === 'category' ? !categories.length ? <div className="fv-empty">本月尚无已记录的消费或关联退款。</div> : <div>
        <p className="fv-caption">{hasNetRefunds ? '圆环仅计算正向净支出的占比；净回款单独列出，仍计入本月总支出。' : '各类别占比按扣除已关联退款后的净支出计算。'}</p>
        <div className="fv-donut-layout">
          {pieTotal > 0 ? <SpendingDonut items={pieItems} total={pieTotal} net={net} selectedCategory={selectedCategory} /> : <div className="fv-empty">本月暂无正向净支出可绘制圆环图。</div>}
          <div className="fv-category-list" role="group" aria-label="本月各类别净支出">{categories.map((category, index) => {
        const value = Number(category.net);
        return <button type="button" className="fv-category-row" key={category.category} aria-pressed={selectedCategory === category.category} onClick={() => onCategory(selectedCategory === category.category ? '' : category.category)}>
          <span className="fv-label"><span><i style={{ background: colors[index % colors.length] }} />{category.category}</span><strong>{ledgerMoney(value)}{value < 0 ? '（净回款）' : ''}{value > 0 && pieTotal > 0 && <small className="fv-category-share">{(value / pieTotal * 100).toLocaleString('zh-CN', { maximumFractionDigits: 1 })}%</small>}</strong></span>
          <small>原支付 {ledgerMoney(category.gross_expense)} − 已退 {ledgerMoney(category.refunds)}；点选可筛选最近账单</small>
        </button>;
      })}</div></div></div> : <div><p className="fv-caption">{weekRange} · 近七天已记录净消费；该范围可能跨月。</p><div className="fv-columns" role="group" aria-label="近七天已记录净消费柱状图">{days.map(day => <button type="button" key={day.date} aria-pressed={activeDay === day.date} aria-label={`${day.date}，净消费 ${ledgerMoney(day.spent)}`} onClick={() => setActiveDay(day.date)}><span className="fv-column-value">{ledgerMoney(day.spent)}</span><span className="fv-column-track"><span style={{ height: `${Math.abs(day.spent) / maxDay * 100}%`, background: day.spent < 0 ? '#b64e62' : undefined }} /></span><span>{day.date.slice(5)}</span></button>)}</div><p className="fv-caption mt-3" role="status">{selectedDay ? `${selectedDay.date}：净消费 ${ledgerMoney(selectedDay.spent)}。` : '点选柱形查看当日金额。'} 负值表示当日退款多于支出；零不代表当天没有交易。</p></div>}
    </>}
  </section>;
}

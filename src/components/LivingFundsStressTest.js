import React, { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ExpenseMoney from './ExpenseMoney';
import { SPENDING_MONEY_VISUAL_ENABLED } from '../config/features';
import { dailyFundsBreakdown, formatFundsCents, fundsDateKey } from '../utils/dailyFundsBreakdown';
import {
  MAX_PROJECTION_DAYS, calendarDaysBetween, parseProjectionAmount, projectLivingFunds, shiftCalendarDay,
} from '../utils/livingFundsProjection';
import './LivingFundsStressTest.css';

const emptyForm = { starting: '', payday: '', daily: '', extra: '', extraDate: '', purchase: '', purchaseDate: '', delay: '0' };

function ResultCard({ label, result }) {
  const { balanceCents, days, firstShortfall, payday, timeline } = result;
  return <article className="living-funds-result">
    <h4>{label}</h4>
    <p>预计到账 {payday} · 试算 {days} 天</p>
    <strong>{balanceCents < 0 ? '预计还差 ' : '预计还剩 '}{formatFundsCents(Math.abs(balanceCents))}</strong>
    {firstShortfall && <p>首次不足 {firstShortfall.date}，当日差 {formatFundsCents(firstShortfall.cents)}</p>}
    <details>
      <summary>查看每日明细</summary>
      <ul className="living-funds-days">
        {timeline.map(({ date, plannedCents, balanceCents: balance }) => <li key={date}>
          <time dateTime={date}>{date}</time>
          {plannedCents > 0 && <span>当日另计 {formatFundsCents(plannedCents)}</span>}
          <span>{balance < 0 ? '还差' : '剩余'} {formatFundsCents(Math.abs(balance))}</span>
        </li>)}
      </ul>
    </details>
  </article>;
}

export default function LivingFundsStressTest({ funds, entries, refreshing, guest = false }) {
  const id = useId();
  const [expanded, setExpanded] = useState(guest);
  const [now, setNow] = useState(() => new Date());
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState([]);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const resultHeading = useRef(null);

  const getToday = time => fundsDateKey(time, funds?.timezone) || fundsDateKey(time, 'Asia/Shanghai');
  const today = getToday(now);
  const reference = dailyFundsBreakdown(funds, now);
  const plan = (entries || []).filter(entry => entry.kind === 'upcoming' && !entry.handled);
  const due = plan.filter(entry => entry.due_date >= today && Number.isFinite(calendarDaysBetween(today, entry.due_date))
    && parseProjectionAmount(entry.amount) > 0).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const chosen = due.filter(entry => selected.includes(entry.id));
  const planKey = JSON.stringify(chosen.map(entry => [entry.id, entry.due_date, entry.amount, entry.title]));
  const shownReport = report?.today === today && report.planKey === planKey ? report : null;
  const canUseReference = !refreshing && ['ready', 'negative', 'zero'].includes(reference.status);

  useEffect(() => {
    if (!expanded) return undefined;
    const refreshDate = () => setNow(new Date());
    const timer = window.setInterval(refreshDate, 60000);
    document.addEventListener('visibilitychange', refreshDate);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshDate);
    };
  }, [expanded]);

  useEffect(() => {
    if (report) resultHeading.current?.focus();
  }, [report]);

  const clearResult = () => { setError(''); setReport(null); };
  const setField = (name, value) => {
    setForm(current => ({ ...current, [name]: value }));
    clearResult();
  };
  const bind = name => ({ value: form[name], onChange: event => setField(name, event.target.value) });
  const moneyField = name => ({ type: 'text', inputMode: 'decimal', maxLength: 15, ...bind(name) });

  const loadExample = () => {
    const time = new Date();
    const date = getToday(time);
    setNow(time);
    setForm({ ...emptyForm, starting: '600', payday: shiftCalendarDay(date, 12), daily: '20',
      extra: '200', extraDate: shiftCalendarDay(date, 3), purchase: '129', delay: '3' });
    setSelected([]);
    clearResult();
  };

  const submit = event => {
    event.preventDefault();
    clearResult();
    const time = new Date();
    setNow(time);
    if (getToday(time) !== today) {
      setError('日期已更新，请核对到账和支出日期后重算。');
      return;
    }
    const startingCents = parseProjectionAmount(form.starting, { signed: true });
    const dailyCents = form.daily.trim() ? parseProjectionAmount(form.daily) : 0;
    const extraCents = form.extra.trim() ? parseProjectionAmount(form.extra) : 0;
    const purchaseCents = form.purchase.trim() ? parseProjectionAmount(form.purchase) : 0;
    if ([startingCents, dailyCents, extraCents, purchaseCents].includes(null)) {
      setError('请填写可用资金。金额最多保留两位小数，支出不能填负数。');
      return;
    }
    const days = calendarDaysBetween(today, form.payday);
    const delay = Number(form.delay);
    if (!Number.isInteger(days) || days < 1 || days + delay > MAX_PROJECTION_DAYS) {
      setError(`预计到账日应在今天之后，计入延迟后最多试算 ${MAX_PROJECTION_DAYS} 天。`);
      return;
    }
    if (selected.length !== chosen.length) {
      setSelected(chosen.map(entry => entry.id));
      setError('部分已选开支已变更，请重新核对勾选项后再试算。');
      return;
    }
    const nextPayday = shiftCalendarDay(form.payday, delay);
    const expenses = chosen.map(entry => ({
      date: entry.due_date, cents: parseProjectionAmount(entry.amount), label: entry.title || '账本计划',
    }));
    const extraOffset = calendarDaysBetween(today, form.extraDate);
    if ((extraCents || form.extraDate) && (!extraCents || !Number.isInteger(extraOffset) || extraOffset < 0)) {
      setError('请为补充开支填写大于零的金额和今天或之后的日期。');
      return;
    }
    if (extraCents) expenses.push({ date: form.extraDate, cents: extraCents, label: '补充开支' });
    const purchaseDate = form.purchaseDate || today;
    const purchaseOffset = calendarDaysBetween(today, purchaseDate);
    if ((purchaseCents || form.purchaseDate) && (!purchaseCents || !Number.isInteger(purchaseOffset) || purchaseOffset < 0)) {
      setError('请为模拟购买填写大于零的金额和今天或之后的日期。');
      return;
    }
    const shared = { today, startingCents, dailyCents };
    const baseline = projectLivingFunds({ ...shared, payday: form.payday, expenses });
    const comparison = purchaseCents || delay ? projectLivingFunds({
      ...shared, payday: nextPayday, expenses: purchaseCents ? [...expenses, { date: purchaseDate, cents: purchaseCents }] : expenses,
    }) : null;
    if (!baseline || ((purchaseCents || delay) && !comparison)) {
      setError('暂时无法计算，请核对金额和日期。');
      return;
    }
    setReport({ today, planKey, baseline, comparison, expenses, startingCents, dailyCents,
      dailyKnown: Boolean(form.daily.trim()), purchaseCents, purchaseDate });
  };

  return <div className="living-funds">
    {!guest && <button type="button" className="living-funds-trigger" aria-expanded={expanded} aria-controls={id}
      onClick={() => { setExpanded(!expanded); setNow(new Date()); }}>
      {expanded ? '收起生活费试算' : '试一笔消费'} <span aria-hidden="true">{expanded ? '−' : '→'}</span>
    </button>}
    <div id={id} hidden={!expanded}>
      {expanded && <>
        <p>看看这笔钱花掉后，能不能撑到下次预计到账。试算只在当前页面使用。</p>
        <form className="living-funds-form" onSubmit={submit} noValidate>
          <div className="living-funds-fields">
            <label>当前可用资金（元）<input {...moneyField('starting')} required /></label>
            <label>下一次预计到账<input type="date" min={shiftCalendarDay(today, 1)} max={shiftCalendarDay(today, MAX_PROJECTION_DAYS)} {...bind('payday')} required /></label>
            <label>每天还需花多少（元，可选）<input {...moneyField('daily')} /></label>
          </div>
          <p>可用资金请填尚未扣除下方待支付开支的金额。每日估计只填未单列的开销。</p>
          <div className="living-funds-actions">
            {canUseReference && <button type="button" onClick={() => {
              const fresh = dailyFundsBreakdown(funds);
              if (['ready', 'negative', 'zero'].includes(fresh.status)) setField('starting', String(fresh.amountCents / 100));
              else { setNow(new Date()); setError('账本参考已过期，请手动核对金额。'); }
            }}>带入账本参考</button>}
            <button type="button" onClick={loadExample}>用示例试试</button>
          </div>
          <details>
            <summary>预留必要开支</summary>
            <p>{guest ? '填写仍未支付且尚未从可用资金扣除的开支。' : '勾选仍未支付且尚未从可用资金扣除的开支。'}</p>
            {entries == null && <p>暂时无法读取账本计划，可在下方补充。</p>}
            {plan.some(entry => entry.due_date < today) && <p>有到期日已过的待处理开支，请到账本核对，或在下方补充。</p>}
            {due.length > 0 && <div className="living-funds-choices">{due.map(entry => <label key={entry.id}>
              <input type="checkbox" checked={selected.includes(entry.id)} onChange={event => {
                const checked = event.target.checked;
                setSelected(current => checked ? [...current, entry.id] : current.filter(value => value !== entry.id));
                clearResult();
              }} />
              <span>{entry.title} · {entry.due_date} · {formatFundsCents(parseProjectionAmount(entry.amount))}</span>
            </label>)}</div>}
            <div className="living-funds-fields">
              <label>补充开支金额（元）<input {...moneyField('extra')} /></label>
              <label>补充开支日期<input type="date" min={today} {...bind('extraDate')} /></label>
            </div>
          </details>
          <div className="living-funds-fields">
            <label>想买的东西（元，可选）<input {...moneyField('purchase')} /></label>
            <label>打算哪天买（默认今天）<input type="date" min={today} {...bind('purchaseDate')} /></label>
            <label>如果到账晚了<select {...bind('delay')}><option value="0">按期到账</option><option value="3">晚 3 天</option><option value="7">晚 7 天</option></select></label>
          </div>
          <button className="living-funds-submit" type="submit">查看试算结果</button>
          {error && <p role="alert">{error}</p>}
        </form>
        {report && !shownReport && <p role="status">日期或已选开支有变化，请重新试算。</p>}
        {shownReport && <section className="living-funds-output" aria-labelledby={`${id}-result`}>
          <h3 id={`${id}-result`} ref={resultHeading} tabIndex={-1}>生活费试算结果</h3>
          <div className="living-funds-results">
            <ResultCard label="按原计划" result={shownReport.baseline} />
            {shownReport.comparison && <ResultCard label="调整后" result={shownReport.comparison} />}
          </div>
          <p>从 {formatFundsCents(shownReport.startingCents)} 起算。{shownReport.dailyKnown
            ? `每日按 ${formatFundsCents(shownReport.dailyCents)} 估计，从今天算到预计到账前一天。`
            : '未填每日开销，结果只覆盖列出的支出。'}</p>
          {shownReport.expenses.length > 0 && <p>待支付开支：{shownReport.expenses.map(item => `${item.label}（${item.date}，${formatFundsCents(item.cents)}）`).join('、')}。仅计入各方案到账前的项目。</p>}
          {shownReport.purchaseCents > 0 && <p>模拟购买：{shownReport.purchaseDate} · {formatFundsCents(shownReport.purchaseCents)}。
            {shownReport.purchaseDate >= shownReport.comparison.payday && '这笔购买安排在该方案预计到账日或之后，未计入本周期。'}</p>}
          {shownReport.purchaseCents > 0 && SPENDING_MONEY_VISUAL_ENABLED && <details>
            <summary>看看这笔钱</summary>
            <ExpenseMoney title="这笔预计花" amount={shownReport.purchaseCents / 100} />
          </details>}
          {!guest && shownReport.purchaseCents > 0 && <Link className="btn btn-outline-success" to="/learning?tab=decision" state={{ trialAmount: shownReport.purchaseCents / 100 }}>带入金额，记录我的选择 →</Link>}
        </section>}
      </>}
    </div>
  </div>;
}

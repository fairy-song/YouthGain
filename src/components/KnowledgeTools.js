import React, { useState } from 'react';
import { ComparisonBars } from './FinanceVisuals';

export function calculateTool(mode, values) {
  const numbers = values.map(value => value === '' ? NaN : Number(value));
  if (numbers.some(n => !Number.isFinite(n) || n < 0)) return { error: '请完整填写非负数字。' };
  const [a, b, c, d = 0, e = 0] = numbers;
  if (mode !== 'budget' && (!Number.isInteger(c) || c < 1 || c > 1200)) return { error: '期数须为 1 至 1200 的整数。' };
  if (mode === 'saving') return { value: Math.ceil(Math.max(0, a - b) / c * 100) / 100, label: '每月需存（元，不计收益）' };
  if (mode === 'installment') return { value: b * c + d + e, label: '分期总付款（元）', extra: `比一次性付款${b * c + d + e >= a ? '多' : '少'} ${Math.abs(b * c + d + e - a).toFixed(2)} 元。这是总价差，不是年化利率。` };
  return { value: a - b - c, label: a - b - c < 0 ? '预算缺口（元）' : '可自由安排（元）', extra: a - b - c < 0 ? '当前安排超出收入，请调整支出或目标。' : '先保障必要生活，再安排弹性消费。' };
}
const configs = {
  budget: { name: '预算分配', labels: ['本月可用收入', '必要支出', '计划储蓄'], defaults: ['2000', '1400', '200'] },
  saving: { name: '储蓄目标', labels: ['目标金额', '已存金额', '剩余月数'], defaults: ['4000', '1000', '6'] },
  installment: { name: '分期成本', labels: ['一次性价格', '每期付款（含期内费用）', '期数', '首付', '另收费用（不重复计入）'], defaults: ['2400', '210', '12', '0', '0'] },
};
export default function KnowledgeTools() {
  const [mode, setMode] = useState('budget');
  const [values, setValues] = useState(configs.budget.defaults);
  const result = calculateTool(mode, values);
  return <section className="kb-tools" aria-labelledby="tools-title">
    <h2 id="tools-title">算清楚，再行动</h2><p className="text-muted">金额单位为元，仅在当前页面计算，不保存财务信息。</p>
    <div className="d-flex flex-wrap gap-2 mb-3">{Object.entries(configs).map(([key, config]) => <button type="button" className={`btn btn-sm ${mode === key ? 'btn-dark' : 'btn-outline-secondary'}`} aria-pressed={mode === key} key={key} onClick={() => { setMode(key); setValues(config.defaults); }}>{config.name}</button>)}</div>
    <div className="row g-3">{configs[mode].labels.map((label, i) => <div className="col-12 col-sm-6 col-lg-4" key={`${mode}-${i}`}><label className="form-label" htmlFor={`calc-${i}`}>{label}</label><input className="form-control" id={`calc-${i}`} type="number" min="0" step={i === 2 && mode !== 'budget' ? '1' : '0.01'} value={values[i]} onChange={event => setValues(values.map((value, j) => i === j ? event.target.value : value))} /></div>)}</div>
    <div className="kb-result" aria-live="polite">{result.error || <><span>{result.label}</span><strong>{result.value.toFixed(2)}</strong><p className="mb-0">{result.extra}</p></>}</div>
    {!result.error && <><p className="small text-muted mt-3">示例试算 · 随输入更新，不是你的实际账目。</p><ComparisonBars label="知识工具金额比较" items={mode === 'installment' ? [
      { label: '一次性付款', value: Number(values[0]) }, { label: '分期总付款', value: result.value },
    ] : mode === 'saving' ? [
      { label: '目标金额', value: Number(values[0]) }, { label: '已存金额', value: Number(values[1]) }, { label: '每月需存', value: result.value },
    ] : [
      { label: '必要支出', value: Number(values[1]) }, { label: '计划储蓄', value: Number(values[2]) }, { label: '剩余预算', value: result.value },
    ]} /></>}
  </section>;
}

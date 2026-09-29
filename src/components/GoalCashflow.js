import React, { useEffect, useState } from 'react';
import { Alert, Button } from 'react-bootstrap';
import { getGoalPlan } from '../services/api';
import { Link } from 'react-router-dom';

const money = n => `¥${Number(n).toFixed(2)}`;

export default function GoalCashflow({ goals, onResult }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setData(null); setError(''); setLoading(true);
    getGoalPlan().then(value => { if (!cancelled) setData(value); })
      .catch(e => { if (!cancelled) setError(e?.response?.data?.message || '暂时无法计算，请重试'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [goals, retry]);
  const result = data?.result || null;
  useEffect(() => { onResult?.(result); }, [result, onResult]);
  if (!goals.some(goal => !goal.status || goal.status === 'active')) return null;
  return <div className="rounded-3 bg-light p-3 mb-3">
    {loading ? <p role="status" className="mb-0">正在自动计算留钱建议…</p> : error ?
      <Alert variant="danger" className="mb-0">{error} <Button size="sm" onClick={() => setRetry(n => n + 1)}>重新计算</Button></Alert> : result ? <>
        <div>预计还能自由花 <strong>{money(result.free_now)}</strong></div>
        {result.basic_shortfall > 0 && <div className="text-danger mt-2">生活开支等还差 {money(result.basic_shortfall)}，暂不新增目标储蓄。</div>}
        {data.balance_deficit > 0 && <div className="text-danger mt-2">已记录消费超出余额 {money(data.balance_deficit)}，当前没有可分配资金。</div>}
        <details className="small text-muted mt-2"><summary>查看依据</summary>
          <p className="mt-2">按首次填写或最近修改的余额与后续记账估算。预计收入只用于未来安排，不自动计入当前余额。月必要开支按剩余天数预留，待支付事项另外计入。</p>
          {data.stale && <p>资料较久未更新或已到预计收入日，结果仍基于现有记录，可能与实际余额不同。</p>}
          <Link to="/profile">我的财务资料</Link>
        </details>
      </> : <><p className="mb-1">财务资料尚不完整，暂时无法自动计算。</p><Link to="/profile">查看我的财务资料</Link></>}
  </div>;
}

export function GoalReserveHint({ goal, result }) {
  const row = result?.goals?.find(g => String(g.id) === String(goal.id));
  if (!row || (goal.status && goal.status !== 'active')) return null;
  const next = row.schedule?.find(item => !item.now);
  return <div className="small mb-2">
    <div>现在建议留 {money(row.reserve_now)}</div>
    {next && <div className="text-muted">{next.date} 预计到账后再留 {money(next.amount)}</div>}
    {row.shortfall > 0 && <div className="text-danger">距目标还差 {money(row.shortfall)}</div>}
    {row.overdue && <div className="text-danger">付款日期已过，请调整目标日期。</div>}
  </div>;
}

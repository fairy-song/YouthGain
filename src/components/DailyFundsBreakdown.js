import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { dailyFundsBreakdown, formatFundsCents, fundsDateKey } from '../utils/dailyFundsBreakdown';
import FundsBreakdownVisual from './FundsBreakdownVisual';
import './FundsBreakdown.css';

export default function DailyFundsBreakdown({ funds, refreshing = false, onRefresh }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [animationKey, setAnimationKey] = useState(null);
  const played = useRef(false);
  const attempted = useRef(null);
  const inFlight = useRef(false);
  // Read actual time on every render, including a new snapshot after background sleep.
  const result = dailyFundsBreakdown(funds);
  const snapshotKey = `${funds?.as_of}|${funds?.available_remaining_month}|${funds?.timezone}|${funds?.available_complete}|${funds?.complete}`;
  const playing = expanded && !refreshing && result.status === 'ready' && animationKey === snapshotKey;

  const requestRefresh = useCallback(() => {
    if (refreshing || inFlight.current || !onRefresh) return;
    inFlight.current = true;
    onRefresh();
  }, [refreshing, onRefresh]);

  useEffect(() => { inFlight.current = refreshing; }, [refreshing, funds]);

  useEffect(() => {
    const check = () => { if (document.visibilityState !== 'hidden') setNow(new Date()); };
    const timer = window.setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, []);

  useEffect(() => {
    if (result.status !== 'stale' && result.status !== 'invalid-time') return;
    const current = new Date();
    const key = fundsDateKey(current, funds?.timezone) || current.toISOString().slice(0, 10);
    if (!refreshing && attempted.current !== key) {
      attempted.current = key;
      requestRefresh();
    }
  }, [result.status, now, funds?.timezone, refreshing, requestRefresh]);

  useEffect(() => {
    setAnimationKey(null);
  }, [snapshotKey, refreshing]);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setTimeout(() => setAnimationKey(null), 850);
    return () => window.clearTimeout(timer);
  }, [playing]);

  const toggle = () => {
    const current = new Date();
    setNow(current);
    if (expanded) { setExpanded(false); setAnimationKey(null); return; }
    setExpanded(true);
    const fresh = dailyFundsBreakdown(funds, current);
    if (fresh.status === 'stale' || fresh.status === 'invalid-time') requestRefresh();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!played.current && !refreshing && fresh.status === 'ready') {
      played.current = true;
      if (!reduced) setAnimationKey(snapshotKey);
    }
  };

  const needsRefresh = ['stale', 'invalid-time', 'invalid'].includes(result.status) || funds?.reason === 'finance_source_unavailable';
  return <div className="funds-breakdown">
    <button type="button" className="funds-breakdown-toggle" aria-expanded={expanded} aria-controls={id} onClick={toggle}>
      {expanded ? '收起换算' : '查看每日均分'}<span aria-hidden="true">{expanded ? ' −' : ' →'}</span>
    </button>
    <div id={id} hidden={!expanded} className="funds-breakdown-content">
      {result.status === 'ready' ? <>
        <p className="funds-breakdown-formula">{formatFundsCents(result.amountCents)} ÷ 剩余{result.remainingDays}天（含今天）</p>
        <span className="funds-breakdown-label">{result.dailyCents ? '接下来平均每天约' : '接下来平均每天'}</span>
        <strong className="funds-breakdown-value">{result.dailyCents ? formatFundsCents(result.dailyCents) : '不足 ¥0.01'}</strong>
        <FundsBreakdownVisual remainingDays={result.remainingDays} playing={playing} />
        <p className="funds-breakdown-note">按已记录的可用资金均分，未额外预留未来开支。这是安排参考，不是今天还能花的金额。</p>
        {refreshing && <p role="status">正在更新资金参考…</p>}
      </> : <p role="status">{refreshing ? '正在更新资金参考…'
        : result.status === 'negative' ? `按已记录资金，本月可用资金不足 ${formatFundsCents(Math.abs(result.amountCents))}。`
          : result.status === 'zero' ? '当前可用剩余为 ¥0.00。'
            : needsRefresh ? '暂无法换算，请更新资金后重试。' : '资金信息确认后可查看均分参考。'}</p>}
      {needsRefresh && onRefresh && <button type="button" className="funds-breakdown-toggle" disabled={refreshing} onClick={requestRefresh}>更新资金参考</button>}
    </div>
  </div>;
}

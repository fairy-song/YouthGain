import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getTodayPodcast, sendPodcastFeedback } from '../services/podcasts';
import { dateKey } from './FinanceVisuals';
import './DailyPodcast.css';

export default function DailyPodcast({ userId }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [day, setDay] = useState(dateKey());
  const version = useRef(0);
  const load = useCallback(async () => {
    const current = ++version.current;
    setError('');
    setBusy('');
    setResult(null);
    try { const value = await getTodayPodcast(); if (current === version.current) setResult(value); }
    catch { if (current === version.current) setError('今天的节目暂时无法读取。'); }
  }, []);
  useEffect(() => {
    load();
    return () => { version.current += 1; };
  }, [userId, day, load]);
  useEffect(() => {
    const refreshDay = () => setDay(dateKey());
    const timer = window.setInterval(refreshDay, 60000);
    window.addEventListener('focus', refreshDay);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refreshDay); };
  }, []);
  const feedback = async kind => {
    if (!result?.program || busy) return;
    const current = version.current;
    setBusy(kind); setError('');
    try {
      await sendPodcastFeedback(result.program.id, kind);
      if (current !== version.current) return;
      if (kind === 'dislike') setResult({ ...result, status: 'dismissed', program: null, message: '今天的节目已收起。' });
      if (kind === 'follow') setResult({ ...result, followed: true });
    } catch { if (current === version.current) setError('反馈暂时没保存，请重试。'); }
    finally { if (current === version.current) setBusy(''); }
  };
  if (!result && !error) return <div className="daily-podcast daily-podcast-loading" role="status">正在挑选今天的一期音频…</div>;
  return <section className="daily-podcast" aria-labelledby="daily-podcast-title">
    <div className="daily-podcast-kicker">每天一期 · 音频博客</div>
    <h2 id="daily-podcast-title">今天推荐这一期</h2>
    {error && <p role="alert">{error} <button type="button" onClick={load}>重试</button></p>}
    {result?.program ? <>
      <h3>{result.program.episode_title}</h3>
      <p className="daily-podcast-publisher">来自《{result.program.name}》 · {result.program.publisher} · {result.program.episode_published_at}</p>
      <p className="daily-podcast-description">{result.program.episode_summary}</p>
      <p className="daily-podcast-reason">为什么适合你：{result.reason}</p>
      <div className="daily-podcast-actions">
        <a href={result.program.episode_url} onClick={() => feedback('view')}>直接听这一期 <span aria-hidden="true">→</span></a>
        <button type="button" disabled={busy || result.followed} onClick={() => feedback('follow')}>{result.followed ? '已收藏本期' : '收藏本期'}</button>
        <button type="button" disabled={!!busy} onClick={() => feedback('dislike')}>不感兴趣</button>
      </div>
      {result.program.platform_links.some(link => link.url !== result.program.episode_url) && <details className="daily-podcast-links"><summary>其他收听链接</summary>{result.program.platform_links.filter(link => link.url !== result.program.episode_url).map(link => <a key={link.url} href={link.url} onClick={() => feedback('view')}>{({ xiaoyuzhou: '小宇宙', ximalaya: '喜马拉雅', website: '网站', other: '其他平台' })[link.platform]} →</a>)}</details>}
    </> : result && <p className="daily-podcast-empty">{result.message || '今天没有合适的新单集。'}</p>}
    <p className="daily-podcast-note">收藏只影响青盈后续推荐，不会在外部平台收藏；收听不代表已经掌握知识。</p>
  </section>;
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getTodayPodcast, sendPodcastFeedback, sendPodcastImpression } from '../services/podcasts';
import { dateKey } from './FinanceVisuals';
import './DailyPodcast.css';

export default function DailyPodcast({ userId }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [day, setDay] = useState(dateKey());
  const version = useRef(0);
  const section = useRef(null);
  const exposed = useRef(new Set());
  const timezone = useRef('Asia/Shanghai');
  const load = useCallback(async () => {
    const current = ++version.current;
    setError('');
    setBusy('');
    setResult(null);
    try {
      const value = await getTodayPodcast();
      if (current === version.current) {
        timezone.current = value.timezone || 'Asia/Shanghai';
        setResult({ ...value, ownerId: userId });
      }
    }
    catch { if (current === version.current) setError('今天的节目暂时无法读取。'); }
  }, [userId]);
  useEffect(() => {
    load();
    return () => { version.current += 1; };
  }, [userId, day, load]);
  useEffect(() => {
    const refreshDay = () => {
      try {
        const parts = new Intl.DateTimeFormat('en', { timeZone: timezone.current, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
        const field = name => parts.find(p => p.type === name).value;
        setDay(`${field('year')}-${field('month')}-${field('day')}`);
      } catch { setDay(dateKey()); }
    };
    const timer = window.setInterval(refreshDay, 60000);
    window.addEventListener('focus', refreshDay);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refreshDay); };
  }, []);
  useEffect(() => {
    if (!result?.program || !result.recommendation_id || result.ownerId !== userId || !section.current || typeof IntersectionObserver === 'undefined') return undefined;
    const key = `${userId}:${result.recommendation_id}`;
    const current = version.current;
    let visible = false;
    const report = () => {
      if (current !== version.current || exposed.current.has(key) || document.visibilityState === 'hidden' || !visible) return;
      exposed.current.add(key);
      sendPodcastImpression(result.program.id, result.recommendation_id).catch(() => exposed.current.delete(key));
    };
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(e => e.isIntersecting && e.intersectionRatio >= 0.1);
      report();
    }, { threshold: 0.1 });
    observer.observe(section.current);
    document.addEventListener('visibilitychange', report);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', report); };
  }, [result, userId]);
  const feedback = async kind => {
    if (!result?.program || result.ownerId !== userId || busy) return;
    const current = version.current;
    setBusy(kind); setError('');
    try {
      if (result.recommendation_id) {
        const eventId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await sendPodcastFeedback(result.program.id, kind, { recommendation_id: result.recommendation_id, event_id: eventId });
      } else { await sendPodcastFeedback(result.program.id, kind); }
      if (current !== version.current) return;
      if (kind === 'dislike') setResult({ ...result, dismissed: true, message: '今天的节目已收起。点下方按钮可恢复。' });
      if (kind === 'undislike') setResult({ ...result, dismissed: false });
      if (kind === 'follow') setResult({ ...result, followed: true });
      if (kind === 'helpful') setResult({ ...result, helpful: true });
    } catch { if (current === version.current) setError('反馈暂时没保存，请重试。'); }
    finally { if (current === version.current) setBusy(''); }
  };
  if ((!result && !error) || (result && result.ownerId !== userId)) return <div className="daily-podcast daily-podcast-loading" role="status">正在挑选今天的一期音频…</div>;
  return <section ref={section} className="daily-podcast" aria-labelledby="daily-podcast-title">
    <div className="daily-podcast-kicker">每天一期 · 音频博客</div>
    <h2 id="daily-podcast-title">今天推荐这一期</h2>
    {error && <p role="alert">{error} <button type="button" onClick={load}>重试</button></p>}
    {result?.program ? <>
      {result.dismissed && <div className="daily-podcast-dismissed-banner">
        <p>{result.message}</p>
        <button type="button" onClick={() => feedback('undislike')} disabled={!!busy}>恢复本期推荐</button>
      </div>}
      <div style={result.dismissed ? { filter: 'grayscale(0.8)', opacity: 0.5 } : undefined}>
      <h3>{result.program.episode_title}</h3>
      <p className="daily-podcast-publisher">来自《{result.program.name}》 · {result.program.publisher} · {result.program.episode_published_at}</p>
      <p className="daily-podcast-description">{result.program.episode_summary}</p>
      <p className="daily-podcast-reason">为什么适合你：{result.reason}</p>
      {result.evidence?.length > 0 && <details><summary>查看推荐依据</summary>
        <p>依据时间：{result.as_of?.slice(0, 10)}。只使用已记录数据，收支结余不等于账户余额。</p>
        <ul>{result.evidence.map(item => <li key={item.feature}>{item.label}：{Number(item.value).toFixed(2)} {item.unit}</li>)}</ul>
      </details>}
      <div className="daily-podcast-actions">
        <a href={result.program.episode_url} onClick={() => feedback('view')}>直接听这一期 <span aria-hidden="true">→</span></a>
        <button type="button" disabled={busy || result.followed} onClick={() => feedback('follow')}>{result.followed ? '已收藏本期' : '收藏本期'}</button>
        <button type="button" disabled={!!busy} onClick={() => feedback('dislike')}>不感兴趣</button>
        <button type="button" disabled={!!busy || result.helpful} onClick={() => feedback('helpful')}>{result.helpful ? '已反馈有帮助' : '对我有帮助'}</button>
      </div>
      {result.program.platform_links.some(link => link.url !== result.program.episode_url) && <details className="daily-podcast-links"><summary>其他收听链接</summary>{result.program.platform_links.filter(link => link.url !== result.program.episode_url).map(link => <a key={link.url} href={link.url} onClick={() => feedback('view')}>{({ xiaoyuzhou: '小宇宙', ximalaya: '喜马拉雅', website: '网站', other: '其他平台' })[link.platform]} →</a>)}</details>}
      </div>
    </> : result?.status === 'dismissed' && result.program_id ? (
      <div className="daily-podcast-dismissed-banner">
        <p>{result.message}</p>
        <button type="button" disabled={!!busy} onClick={async () => {
          setBusy('undislike');
          try {
            await sendPodcastFeedback(result.program_id, 'undislike', { recommendation_id: result.recommendation_id });
            load();
          } catch { setError('恢复失败，请重试。'); }
          finally { setBusy(''); }
        }}>恢复本期推荐</button>
      </div>
    ) : result && <p className="daily-podcast-empty">{result.message || '今天没有合适的新单集。'}</p>}
    <p className="daily-podcast-note">收藏只影响青盈后续推荐，不会在外部平台收藏；收听不代表已经掌握知识。</p>
  </section>;
}

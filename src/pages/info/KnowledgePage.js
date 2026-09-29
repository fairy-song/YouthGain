import React, { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { fetchKnowledgeArticles } from '../../services/api';
import { knowledgeCategories, legacyCategories } from '../../services/knowledgeCategories';
import KnowledgeTools from '../../components/KnowledgeTools';
import './KnowledgePage.css';

const goals = [
  ['budget', '管好生活费'], ['saving', '开始存钱'], ['spending', '减少冲动消费'],
  ['credit', '看懂借贷成本'], ['investment', '了解投资风险'], ['safety', '保护我的钱'],
];
const markdownComponents = { a: ({ node, children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer">{children}</a> };
function Article({ article, back }) {
  const content = article.content || '正文尚未补充。';
  const answerIndex = content.indexOf('## 参考答案');
  const sourceIndex = content.indexOf('## 资料来源', answerIndex);
  const hasAnswer = answerIndex >= 0 && sourceIndex > answerIndex;
  return <article className="kb-article">
    <Link to={back} className="btn btn-outline-secondary btn-sm mb-4">← 返回知识库</Link>
    <div className="kb-eyebrow">青盈 · 理财实践指南</div><h1>{article.title}</h1>
    <p className="text-muted">更新于 {article.date || '未标注'} · 约 {article.readTime || 3} 分钟阅读</p>
    <p className="kb-summary">{article.summary}</p>
    <ReactMarkdown components={markdownComponents}>{hasAnswer ? content.slice(0, answerIndex) : content}</ReactMarkdown>
    {hasAnswer && <><details className="kb-answer"><summary>想好后，查看参考答案</summary><ReactMarkdown components={markdownComponents}>{content.slice(answerIndex + '## 参考答案'.length, sourceIndex)}</ReactMarkdown></details><ReactMarkdown components={markdownComponents}>{content.slice(sourceIndex)}</ReactMarkdown></>}
    <div className="kb-next"><h2>把知识用起来</h2><Link to="/dashboard" className="btn btn-outline-primary me-2">查看消费与目标</Link><Link to="/learning" className="btn btn-outline-primary">继续学习与练习</Link></div>
  </article>;
}
export default function KnowledgePage() {
  const [params, setParams] = useSearchParams();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const category = params.get('category') || 'all';
  const query = params.get('q') || '';
  const articleId = params.get('article');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setArticles(await fetchKnowledgeArticles()); }
    catch { setError('知识库暂时无法加载，请检查连接后重试。'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { window.scrollTo(0, 0); }, [articleId]);
  function change(key, value) { const next = new URLSearchParams(params); next.delete('article'); value ? next.set(key, value) : next.delete(key); setParams(next, { replace: key === 'q' }); }
  const categoryList = [...knowledgeCategories, ...legacyCategories.filter(c => articles.some(a => a.category === c.id))];
  const unknownCategories = [...new Set(articles.map(a => a.category || 'uncategorized'))].filter(id => !categoryList.some(c => c.id === id));
  unknownCategories.forEach(id => categoryList.push({ id, name: id === 'uncategorized' ? '未分类' : id }));
  const filtered = articles.filter(a => (category === 'all' || (a.category || 'uncategorized') === category) && [a.title, a.summary, ...(a.tags || [])].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const selected = articles.find(a => String(a.id) === articleId);
  const backParams = new URLSearchParams(params); backParams.delete('article');
  const back = `/info/knowledge${backParams.toString() ? '?' + backParams.toString() : ''}`;
  return <div className="kb-page"><div className="container">
    {loading ? <div role="status" className="py-5 text-center">正在加载知识库…</div> : error ? <div role="alert" className="alert alert-warning">{error} <button className="btn btn-sm btn-outline-dark" onClick={load}>重新加载</button></div> : articleId ? selected ? <Article key={selected.id} article={selected} back={back} /> : <div className="kb-empty"><h1>这篇文章暂不可用</h1><p>内容可能已被管理员删除。</p><Link to={back}>返回知识库</Link></div> : <>
      <header className="kb-hero"><div className="kb-eyebrow">YOUTHGAIN · 知识与行动</div><h1>让每一笔钱，<br />都有更清楚的安排。</h1><p>从生活费、储蓄到消费与反诈。读懂一个问题，尝试一个行动。</p><div className="kb-hero-meta">{articles.length} 篇实用指南 · 生活情境 · 行动清单</div></header>
      <section className="kb-goals" aria-labelledby="goal-title"><h2 id="goal-title">你现在最想解决什么？</h2><div className="d-flex flex-wrap gap-2">{goals.map(([id, name]) => <button key={id} className={`btn ${category === id ? 'btn-dark' : 'btn-outline-secondary'}`} aria-pressed={category === id} onClick={() => change('category', id)}>{name}</button>)}</div></section>
      <section className="kb-catalogue" aria-labelledby="catalogue-title"><div className="d-flex flex-wrap gap-3 align-items-center justify-content-between mb-3"><h2 id="catalogue-title">探索知识库</h2><label className="kb-search">搜索文章<input className="form-control" type="search" value={query} onChange={e => change('q', e.target.value)} placeholder="试试：分期、自动续费、应急" /></label></div>
      <div className="d-flex flex-wrap gap-2 mb-3">{[{ id: 'all', name: '全部' }, ...categoryList].map(c => <button className={`btn btn-sm ${category === c.id ? 'btn-primary' : 'btn-light'}`} aria-pressed={category === c.id} key={c.id} onClick={() => change('category', c.id)}>{c.name}</button>)}</div>
      <p className="text-muted" role="status">找到 {filtered.length} 篇文章</p>
      {filtered.length ? <div className="row g-4">{filtered.map((a, i) => { const next = new URLSearchParams(params); next.set('article', a.id); return <div className="col-12 col-md-6 col-xl-4" key={a.id}><article className="kb-card"><div className="kb-card-top"><span>{categoryList.find(c => c.id === a.category)?.name || '未分类'}</span><span>{String(i + 1).padStart(2, '0')}</span></div><h3><Link to={`?${next.toString()}`}>{a.title}</Link></h3><p>{a.summary}</p><div className="kb-card-bottom"><span>约 {a.readTime || 3} 分钟 · {a.date || '日期未标注'}</span><Link to={`?${next.toString()}`} aria-label={`阅读全文：${a.title}`}>阅读全文 →</Link></div></article></div>; })}</div> : <div className="kb-empty"><h3>没有找到相关内容</h3><p>换一个关键词，或者看看其他板块。</p><button className="btn btn-outline-secondary" onClick={() => setParams({})}>清除筛选</button></div>}
      </section><KnowledgeTools />
    </>}
  </div></div>;
}

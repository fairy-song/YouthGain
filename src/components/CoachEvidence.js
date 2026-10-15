import React from 'react';

export default function CoachEvidence({ evidence, validation }) {
  if (!evidence) return null;
  const facts = evidence.facts || [];
  const used = evidence.used_sources || [];
  const unused = (evidence.sources || []).filter(s => !used.some(u => u.source_id === s.source_id));
  return <details className="coach-evidence mt-3 border-top pt-2">
    <summary>查看本次依据</summary>
    {validation?.fallback && <p>本次完整分析暂未生成，已展示可核对的事实或资料。</p>}
    {evidence.retrieval?.degraded && <p>本次知识检索部分功能暂不可用，已采用备用检索。</p>}
    {evidence.knowledge_status === 'unavailable' && <p>知识库暂不可用，本次没有知识片段依据。</p>}
    {facts.length > 0 && <>
      <h6>程序计算与本轮输入</h6>
      <ul>{facts.map(f => <li key={f.id}>
        {f.label}：{Number(f.value).toLocaleString('zh-CN', { maximumFractionDigits: f.unit === '天' ? 1 : 2 })}{f.unit}
        {f.source === 'user_scenario' && '（本轮给定情境）'}
        {f.assumptions?.length > 0 && <p className="small text-muted">{f.assumptions.filter(Boolean).join(' ')}</p>}
      </li>)}</ul>
    </>}
    {evidence.calculation && <p className="small">消费记录区间：{evidence.calculation.start || '未知'} 至 {evidence.calculation.end || '未知'}。{evidence.calculation.limitation}</p>}
    {used.length > 0 && <><h6>回答使用的知识片段</h6>{used.map(s => <blockquote key={s.source_id}><strong>{s.title}</strong><p>{s.excerpt}</p><small>站内知识库 · {s.date || '日期未标注'}</small></blockquote>)}</>}
    {unused.length > 0 && <details><summary>其他检索片段（未作为本次回答依据）</summary>{unused.map(s => <p key={s.source_id}><strong>{s.title}</strong>：{s.excerpt}</p>)}</details>}
    {!facts.length && !used.length && <p>本轮没有引用个人计算事实或知识片段；回答中的通用解释仍需结合具体条件理解。</p>}
    <p className="small text-muted">数值绑定与来源检查有助于排查错误，不能保证全部陈述正确，也不代表学习效果已经得到验证。</p>
  </details>;
}

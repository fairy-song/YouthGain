import React from 'react';

export default function CoachEvidence({ evidence, validation, runtime }) {
  if (!evidence) return null;
  const facts = evidence.facts || [];
  const used = evidence.used_sources || [];
  const unused = (evidence.sources || []).filter(s => !used.some(u => u.source_id === s.source_id));
  return <details className="coach-evidence mt-3 border-top pt-2">
    <summary>查看本次依据</summary>
    {runtime && <p className="small">本次回答方式：{({ model: 'AI 生成并经检查', rule: '程序事实或资料整理', guided: '确认关键信息后再继续', unavailable: '未生成回答' })[runtime.generation_mode] || '未标注'}。
</p>}
    {runtime && <details><summary>技术信息</summary><p className="small">模型：{runtime.model || '未标注'} · 版本：{runtime.protocol_version || '未标注'}</p></details>}
    {evidence.policy && <p className="small">本轮处理：{({ clarify: '先确认缺失条件', retrieve: '补充检索', calculate: '解释已有计算', answer: '结合现有信息回答', defer: '暂缓确定结论' })[evidence.policy.action]}。
      {evidence.policy.mode === 'model+constraints' ? '由模型选择并经过程序约束。' : '当前采用程序规则。'}检索 {evidence.policy.retrieval_rounds} 轮；资料相关不代表足以支持所有结论。</p>}
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
    {used.length > 0 && <><h6>回答使用的知识片段</h6>{used.map(s => <blockquote key={s.source_id}><strong>{s.title}</strong><p>{s.excerpt}</p><small>{s.source_name || '站内知识库'} · {s.date || '发布日期未标注'}{s.checked_at && ` · 采集核验 ${s.checked_at.slice(0, 10)}`}{s.region && ` · ${s.region}`}{s.version && ` · 版本 ${s.version.slice(0, 8)}`}</small>{s.source_url?.startsWith('https://') && <p><a href={s.source_url} target="_blank" rel="noreferrer">查看原始来源</a></p>}</blockquote>)}</>}
    {unused.length > 0 && <details><summary>其他检索片段（未作为本次回答依据）</summary>{unused.map(s => <p key={s.source_id}><strong>{s.title}</strong>：{s.excerpt}</p>)}</details>}
    {!facts.length && !used.length && <p>本轮未引用个人数据或知识片段。</p>}
  </details>;
}

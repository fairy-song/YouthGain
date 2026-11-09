import React, { useCallback, useEffect, useRef, useState } from 'react';
import { knowledgeUpdatesApi } from '../services/api';

const statusLabels = { pending: '待审核', approved: '已审核', rejected: '已拒绝' };
const blankSource = { name: '', url: '', kind: 'page', region: 'CN', enabled: false };
const screeningLabels = { eligible: '筛选通过', review: '需要复核', exclude: '建议排除', capacity_wait: '等待容量', published: '已自动发布', running: '正在筛选' };

export default function KnowledgeUpdatesAdmin() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [selectedId, setSelectedId] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [releaseChange, setReleaseChange] = useState(false);
  const [form, setForm] = useState(blankSource);
  const [policySource, setPolicySource] = useState(null);
  const [usageConfirmed, setUsageConfirmed] = useState(false);
  const heading = useRef(null);
  const selectedButton = useRef(null);

  const load = useCallback(async () => { setData(await knowledgeUpdatesApi('GET')); }, []);
  useEffect(() => { load().catch(() => setError('动态知识更新台账暂无法读取，请重试。')); }, [load]);
  const versions = data?.versions || [];
  const pending = data?.version_counts?.pending ?? versions.filter(version => version.status === 'pending').length;
  const visible = versions.filter(version => filter === 'all' || (filter === 'excluded' ? version.screening?.decision === 'exclude' : version.status === filter && (filter !== 'pending' || version.screening?.decision !== 'exclude')));
  const selected = visible.find(version => version.id === selectedId);
  const published = selected && selected.current_id === selected.id && !selected.withdrawn;
  useEffect(() => { if (selectedId) heading.current?.focus(); }, [selectedId]);

  const resetSelection = () => { setSelectedId(null); setConfirmed(false); setReleaseChange(false); };
  const refresh = async () => {
    setBusy(true); setError(''); setNotice('');
    try { await load(); resetSelection(); }
    catch { setError('动态知识更新台账暂无法读取，请重试。'); }
    finally { setBusy(false); }
  };
  const act = async (method, path, body, message) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await knowledgeUpdatesApi(method, path, body);
      resetSelection();
      if (path === '/sources' && method === 'POST') setForm(blankSource);
      setNotice(message);
      try { await load(); }
      catch { setData(null); setError('操作已完成，最新台账暂未读到，请刷新确认。'); }
    } catch (e) { setError(e.response?.data?.message || '操作失败，请稍后重试。'); }
    finally { setBusy(false); }
  };

  return <section className="admin-editorial-section" aria-label="知识来源与更新审核">
    <div className="review-section-head"><div><h2>知识更新审核</h2></div>
      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={refresh}>刷新更新台账</button></div>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {notice && <p role="status" className="text-success">{notice}</p>}
    {!data && !error && <p role="status">正在读取审核队列…</p>}
    {data?.capacity && <section className="border-top border-bottom py-3 mb-3" aria-label="知识库实际容量">
      <h3 className="h5">知识库实际容量</h3>
      <dl className="clarity-capacity">
        <div><dt>文章</dt><dd><strong>{data.capacity.published_articles}</strong><span> / {data.capacity.limits.articles} 篇配额</span></dd><meter aria-label="文章配额" min="0" max={Math.max(1, data.capacity.limits.articles)} value={Math.min(data.capacity.published_articles, Math.max(1, data.capacity.limits.articles))} /></div>
        <div><dt>知识片段</dt><dd><strong>{data.capacity.passages}</strong><span> / {data.capacity.limits.passages} 个配额</span></dd><meter aria-label="知识片段配额" min="0" max={Math.max(1, data.capacity.limits.passages)} value={Math.min(data.capacity.passages, Math.max(1, data.capacity.limits.passages))} /></div>
      </dl>
      <p className="small"><span className="clarity-state">{data.capacity.index_current ? '✓ 索引已更新' : '索引待更新'}</span>{data.capacity.index_error && <span role="status">{data.capacity.index_error}</span>}</p>
      <details><summary>统计详情</summary><p className="small">正文 {data.capacity.body_characters.toLocaleString()} 字符 · 索引 {data.capacity.index?.passages ?? 0} 片段 · 向量缓存 {data.capacity.index?.cached_vectors ?? 0} 条。配额不是已收录量或性能承诺；教练按适用地区检索。</p></details>
      {data.capacity.over_capacity && <p role="alert" className="text-danger">现有内容已超过配置额度，请先处理容量再发布新内容。</p>}
    </section>}
    {data && <div className="review-workbench">
      <div className="review-queue">
        <p className="small text-muted">最近300个版本 · 待审核数为完整台账统计</p>
        <label className="review-filter">版本状态<select className="form-select" value={filter} onChange={e => { setFilter(e.target.value); resetSelection(); }}>
          <option value="pending">待审核（{pending}，含待复核与排除建议）</option><option value="excluded">自动筛选建议排除</option><option value="approved">已审核</option><option value="rejected">已拒绝</option><option value="all">全部版本</option>
        </select></label>
        {!visible.length && <p className="text-muted mt-3">{filter === 'pending' ? '目前没有待审核版本。' : '此状态暂无版本。'}</p>}
        <ul className="review-queue-list">{visible.map(version => <li key={version.id}>
          <button type="button" disabled={busy} aria-pressed={selectedId === version.id} onClick={event => {
            selectedButton.current = event.currentTarget; setSelectedId(version.id); setConfirmed(false); setReleaseChange(false);
          }}>
            <strong>{version.title}</strong><small>{statusLabels[version.status] || version.status} · {version.region}{version.current_id === version.id && !version.withdrawn && ' · 正在发布'}</small>
            {version.screening && <small>{screeningLabels[version.screening.decision] || '筛选记录'}</small>}
            <span className="review-entry-action">查看正文与变化 <span aria-hidden="true">→</span></span>
          </button>
        </li>)}</ul>
      </div>
      <div className="review-detail" role="region" aria-label="知识版本审核详情">
        {selected ? <>
          <h3 ref={heading} tabIndex={-1}>{selected.title}</h3>
          <p className="text-muted small">原文日期 {selected.date || '未标注'} · 采集于 {selected.checked_at || '未记录'} · {selected.region}</p>
          <a href={selected.source_url} target="_blank" rel="noreferrer">核对原文 ↗</a>
          {selected.screening && <aside className="my-3" aria-label="自动筛选依据"><strong>{screeningLabels[selected.screening.decision] || '筛选结果'}</strong>
            <ul>{(selected.screening.reasons || []).map(reason => <li key={reason}>{reason}</li>)}</ul>
            {selected.screening.semantic?.quotes?.map(quote => <blockquote key={quote}>{quote}</blockquote>)}
            <small>{selected.screening.generation_mode === 'model+rules' ? '模型辅助与程序规则共同筛选' : '程序规则筛选'} · {selected.screening.policy} · 筛选通过不等于已证明所有内容正确。</small>
          </aside>}
          <details className="review-disclosure"><summary>当前发布正文</summary><pre>{selected.previous_content || '尚未发布'}</pre></details>
          <h4>本次采集正文</h4><pre>{selected.content}</pre>
          <details className="review-disclosure"><summary>版本指纹</summary><p className="small">{selected.fingerprint || '未记录'}</p></details>
          {selected.status === 'pending' && <>
            <label className="review-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> 已核对原文、日期、适用地区及内容使用范围，确认可在站内展示并用于检索</label>
            <div className="review-actions">
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => act('POST', `/versions/${selected.id}/screen`, {}, '筛选已完成，请查看结果与发布状态。')}>重新自动筛选</button>
              <button type="button" className="btn btn-success btn-sm" disabled={busy || !confirmed} onClick={() => act('POST', `/versions/${selected.id}/review`, { decision: 'approve', confirmed, expected_current: selected.current_id }, '已发布审核版本。')}>审核通过并发布</button>
              <button type="button" className="btn btn-outline-danger btn-sm" disabled={busy} onClick={() => act('POST', `/versions/${selected.id}/review`, { decision: 'reject' }, '已拒绝本次版本。')}>拒绝本次版本</button>
            </div>
          </>}
          {selected.status === 'approved' && (releaseChange ? <div className="review-actions">
            <p>{published ? '撤回后，此版本将停止在站内展示及用于检索。' : '恢复后，将使用此已审核版本作为当前发布内容。'}</p>
            <button type="button" className="btn btn-outline-danger btn-sm" disabled={busy} onClick={() => act('POST', `/documents/${selected.document_id}/release`, { version_id: published ? null : selected.id }, published ? '已撤回发布。' : '已恢复此版本。')}>{published ? '确认撤回' : '确认恢复'}</button>
            <button type="button" className="btn btn-link btn-sm" disabled={busy} onClick={() => setReleaseChange(false)}>取消</button>
          </div> : <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => setReleaseChange(true)}>{published ? '撤回发布' : '恢复此已审核版本'}</button>)}
          <button type="button" className="btn btn-link btn-sm" disabled={busy} onClick={() => { resetSelection(); selectedButton.current?.focus(); }}>关闭详情</button>
        </> : <p className="text-muted">← 选择待审核内容</p>}
      </div>
    </div>}
    {data && <details className="review-source">
      <summary>管理采集来源</summary>
      <p className="small text-muted">启用来源后按计划检查。停用会停止采集，已发布内容需单独撤回。</p>
      <ul className="list-unstyled">{data.sources.map(source => <li key={source.id} className="border-top py-2">
        <strong>{source.name}</strong> · {source.region} · {source.enabled ? '已启用' : '已停用'}
        <span className="small"> · {source.publish_policy === 'basic_auto' ? '合格基础内容自动发布' : '自动筛选后人工发布'}</span>
        <div className="small"><a href={source.url} target="_blank" rel="noreferrer">查看来源</a> · 最近检查 {source.last_checked || '尚未检查'} · 下次 {source.next_check || '启用后检查'}</div>
        {source.last_error && <p className="small text-danger">{source.last_error}</p>}
        <div className="review-actions">
          <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => act('PUT', `/sources/${source.id}`, { enabled: !source.enabled }, '已更新来源状态。')}>{source.enabled ? '停用' : '启用'}</button>
          <button type="button" className="btn btn-sm btn-outline-success" disabled={busy || !source.enabled} onClick={() => act('POST', `/sources/${source.id}/check`, undefined, '已提交来源检查。')}>立即检查</button>
          <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => { setPolicySource(source.id); setUsageConfirmed(false); }}>设置发布策略</button>
        </div>
        {policySource === source.id && <div className="py-2">
          <p className="small">仅对该来源的合格基础教育内容自动发布。费用、政策、冲突与无法核验的内容继续进入复核；模型不可用时不自动发布。</p>
          <label className="review-check"><input type="checkbox" checked={usageConfirmed} onChange={e => setUsageConfirmed(e.target.checked)} /> 已确认该来源允许在站内展示和检索，并了解自动筛选需抽检</label>
          <button type="button" className="btn btn-sm btn-success me-2" disabled={busy || !usageConfirmed} onClick={() => { act('PUT', `/sources/${source.id}`, { usage_confirmed: true, publish_policy: 'basic_auto' }, '已启用合格基础内容自动发布；异常仍需复核。'); setPolicySource(null); }}>启用基础内容自动发布</button>
          <button type="button" className="btn btn-sm btn-outline-secondary me-2" disabled={busy} onClick={() => { act('PUT', `/sources/${source.id}`, { publish_policy: 'manual' }, '已恢复人工发布，自动筛选继续运行。'); setPolicySource(null); }}>保持人工发布</button>
          <button type="button" className="btn btn-sm btn-link" onClick={() => setPolicySource(null)}>取消设置</button>
        </div>}
      </li>)}</ul>
      <details><summary>添加可信来源</summary><form onSubmit={event => { event.preventDefault(); act('POST', '/sources', form, '来源已保存，默认停用。'); }} className="d-grid gap-2 py-2">
        <label>来源名称<input className="form-control" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label>来源网址<input className="form-control" type="url" placeholder="可信主机下的 HTTPS 网址" required value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} /></label>
        <label>来源类型<select className="form-select" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}><option value="page">正文页面</option><option value="index">文章目录</option></select></label>
        <label>适用地区<select className="form-select" value={form.region} onChange={e => setForm({ ...form, region: e.target.value })}><option value="CN">中国内地</option><option value="HK">中国香港</option><option value="general">境外通用教育</option></select></label>
        <button type="submit" className="btn btn-sm btn-outline-success" disabled={busy}>保存来源（默认停用）</button>
      </form></details>
    </details>}
  </section>;
}

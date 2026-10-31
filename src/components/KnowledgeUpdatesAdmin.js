import React, { useCallback, useEffect, useState } from 'react';
import { knowledgeUpdatesApi } from '../services/api';

export default function KnowledgeUpdatesAdmin() {
  const [data, setData] = useState({ sources: [], versions: [] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', kind: 'page', region: 'CN', enabled: false });
  const load = useCallback(async () => { setData(await knowledgeUpdatesApi('GET')); }, []);
  useEffect(() => { load().catch(() => setError('动态知识更新台账暂无法读取，请重试')); }, [load]);
  const act = async (method, path = '', body) => {
    setBusy(true); setError('');
    try { await knowledgeUpdatesApi(method, path, body); await load(); setSelected(null); setConfirmed(false); }
    catch (e) { setError(e.response?.data?.message || '操作失败，请稍后重试'); }
    finally { setBusy(false); }
  };
  return <section className="border rounded-4 p-3 mb-4" aria-label="知识来源与更新审核">
    <h5>知识来源与更新审核</h5>
    <p className="small text-muted">自动检查只生成待审核版本。来源默认停用，启用后每天检查；关机期间暂停，下次启动后台补查。关闭来源停止采集，已发布内容需单独撤回。</p>
    {error && <p role="alert" className="text-danger">{error}</p>}
    <button className="btn btn-sm btn-outline-secondary mb-2" disabled={busy} onClick={() => act('GET')}>刷新更新台账</button>
    <ul className="list-unstyled">{data.sources.map(source => <li key={source.id} className="border-top py-2">
      <strong>{source.name}</strong> · {source.region} · {source.enabled ? '已启用' : '已停用'}
      <div className="small"><a href={source.url} target="_blank" rel="noreferrer">查看来源</a> · 最近检查 {source.last_checked || '尚未检查'} · 下次 {source.next_check || '启用后检查'}</div>
      {source.last_error && <p className="small text-danger">{source.last_error}</p>}
      <button className="btn btn-sm btn-outline-secondary me-2" disabled={busy} onClick={() => act('PUT', `/sources/${source.id}`, { enabled: !source.enabled })}>{source.enabled ? '停用' : '启用'}</button>
      <button className="btn btn-sm btn-outline-success" disabled={busy || !source.enabled} onClick={() => act('POST', `/sources/${source.id}/check`)}>立即检查</button>
    </li>)}</ul>
    <details><summary>添加可信来源</summary><form onSubmit={event => { event.preventDefault(); act('POST', '/sources', form); }} className="d-grid gap-2 py-2">
      <input className="form-control" aria-label="来源名称" placeholder="来源名称" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <input className="form-control" aria-label="来源网址" type="url" placeholder="可信主机下的HTTPS网址" required value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} />
      <select className="form-select" aria-label="来源类型" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}><option value="page">正文页面</option><option value="index">文章目录</option></select>
      <select className="form-select" aria-label="适用地区" value={form.region} onChange={e => setForm({ ...form, region: e.target.value })}><option value="CN">中国内地</option><option value="HK">中国香港</option><option value="general">境外通用教育（首版不进入内地教练检索）</option></select>
      <button className="btn btn-sm btn-outline-success" disabled={busy}>保存来源（默认停用）</button>
    </form></details>
    <h6 className="mt-3">版本记录 · 待审核 {data.versions.filter(v => v.status === 'pending').length}</h6>
    {data.versions.length === 0 && <p className="small text-muted">尚无采集版本。启用来源并检查后，在这里核对正文变化。</p>}
    {data.versions.map(version => <div key={version.id} className="border-top py-2">
      <strong>{version.title}</strong> · {{ pending: '待审核', approved: '已审核', rejected: '已拒绝' }[version.status]}
      {version.current_id === version.id && !version.withdrawn && ' · 当前发布版本'}
      <div className="small">发布于 {version.date || '原文未标注'} · 采集于 {version.checked_at} · {version.region}</div>
      <button className="btn btn-sm btn-link" disabled={busy} onClick={() => { setSelected(version); setConfirmed(false); }}>查看正文与变化</button>
      {version.status === 'approved' && <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => act('POST', `/documents/${version.document_id}/release`, { version_id: version.current_id === version.id && !version.withdrawn ? null : version.id })}>{version.current_id === version.id && !version.withdrawn ? '撤回发布' : '恢复此已审核版本'}</button>}
    </div>)}
    {selected && <div className="border rounded p-3 mt-2" role="region" aria-label="知识版本审核详情">
      <h6>{selected.title}</h6><a href={selected.source_url} target="_blank" rel="noreferrer">核对原文</a>
      <p className="small">指纹 {selected.fingerprint}</p>
      <details><summary>当前发布正文</summary><pre style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>{selected.previous_content || '尚未发布'}</pre></details>
      <h6 className="mt-2">本次采集正文</h6><pre style={{ whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto' }}>{selected.content}</pre>
      {selected.status === 'pending' && <>
        <label className="d-block my-2"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> 已核对原文、日期、适用地区及内容使用范围，确认可在站内展示并用于检索</label>
        <button className="btn btn-success btn-sm me-2" disabled={busy || !confirmed} onClick={() => act('POST', `/versions/${selected.id}/review`, { decision: 'approve', confirmed, expected_current: selected.current_id })}>审核通过并发布</button>
        <button className="btn btn-outline-danger btn-sm" disabled={busy} onClick={() => act('POST', `/versions/${selected.id}/review`, { decision: 'reject' })}>拒绝本次版本</button>
      </>}
      <button className="btn btn-link btn-sm" disabled={busy} onClick={() => setSelected(null)}>关闭详情</button>
    </div>}
  </section>;
}

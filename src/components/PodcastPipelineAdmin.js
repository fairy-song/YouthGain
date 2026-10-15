import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Table } from 'react-bootstrap';
import { getPodcastPipeline, savePodcastSource, queuePodcastSource, discoverPodcastSources,
  submitPodcastSource, reviewPodcastSource, retryPodcastJob } from '../services/podcasts';

const states = { queued: '排队中', running: '处理中', done: '已完成', failed: '失败' };
const kinds = { fetch: '采集', process: '内容整理', discover: '发现来源', subscribe: '订阅更新' };
const date = value => value ? value.slice(0, 16).replace('T', ' ') : '暂无';

export default function PodcastPipelineAdmin({ onCatalogueChange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', permission: 'public_rss' });
  const [page, setPage] = useState('');
  const load = useCallback(async () => {
    try { setData(await getPodcastPipeline()); setError(''); }
    catch (e) { setError(e?.response?.data?.message || '采集状态暂时无法读取。'); }
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(() => { load(); onCatalogueChange?.(); }, 15000);
    return () => clearInterval(timer);
  }, [load, onCatalogueChange]);
  const act = async (action, message) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await load(); await onCatalogueChange?.(); setNotice(message); }
    catch (e) { setError(e?.response?.data?.message || '操作失败，请稍后重试。'); }
    finally { setBusy(false); }
  };
  return <Card className="mb-4"><Card.Body>
    <h2 className="h5">内容发现与自动更新</h2>
    <p className="small text-muted">接入公开订阅源后，后台自动发现新单集、整理主题与学习要点，再进入审核。仅保存文字资料和原始链接。</p>
    {error && <Alert variant="danger">{error}</Alert>}
    {notice && <Alert variant="success" role="status">{notice}</Alert>}
    {data && <p className="small">来源 {data.counts.sources} 个 · 正常 {data.counts.healthy_sources} 个 · 单集 {data.counts.episodes} 期 · 待审核 {data.counts.pending_review} 期</p>}
    <details className="mb-3"><summary>添加 RSS 来源</summary>
      <Form className="mt-3" onSubmit={event => { event.preventDefault(); act(async () => {
        const source = await savePodcastSource(form); await queuePodcastSource(source.id);
        setForm({ name: '', url: '', permission: 'public_rss' });
      }, '来源已保存，首次采集已排队。'); }}>
        <Form.Group controlId="podcast-source-name" className="mb-2"><Form.Label>来源名称</Form.Label><Form.Control required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Form.Group>
        <Form.Group controlId="podcast-source-url" className="mb-2"><Form.Label>公开 RSS 地址</Form.Label><Form.Control required type="url" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} /><Form.Text>来源主机须加入服务端允许列表。重定向后的主机也需要核准。</Form.Text></Form.Group>
        <Form.Group controlId="podcast-source-permission" className="mb-2"><Form.Label>采集许可</Form.Label><Form.Select value={form.permission} onChange={e => setForm({ ...form, permission: e.target.value })}><option value="public_rss">已核对公开 RSS</option><option value="licensed">已获授权</option></Form.Select></Form.Group>
        <Button type="submit" size="sm" disabled={busy}>保存来源并采集</Button>
      </Form>
    </details>
    <div className="d-flex gap-2 flex-wrap mb-3">
      <Button size="sm" variant="outline-secondary" disabled={busy} onClick={load}>刷新采集状态</Button>
      {['podcastindex', 'listennotes'].map(provider => <Button key={provider} size="sm" variant="outline-primary" disabled={busy || !data?.integrations?.[provider]} onClick={() => act(() => discoverPodcastSources(provider), '目录发现任务已排队，候选来源将在下方显示。')}>{provider === 'podcastindex' ? 'Podcast Index 搜索' : 'Listen Notes 搜索'}{!data?.integrations?.[provider] ? '（未配置）' : ''}</Button>)}
    </div>
    <details className="mb-3"><summary>从公开页面发现订阅地址</summary>
      <Form className="mt-2" onSubmit={event => { event.preventDefault(); act(async () => {
        await submitPodcastSource({ url: page, kind: 'page', title: '公开页面订阅发现' }); setPage('');
      }, '页面发现任务已排队；解析出的 RSS 仍需确认接入。'); }}>
        <Form.Group controlId="podcast-source-page" className="mb-2"><Form.Label>已获准采集的公开页面</Form.Label><Form.Control required type="url" value={page} onChange={e => setPage(e.target.value)} /><Form.Text>仅解析公开页面声明的 RSS/Atom 链接，不登录平台或下载音频。</Form.Text></Form.Group>
        <Button size="sm" type="submit" disabled={busy}>发现订阅地址</Button>
      </Form>
    </details>
    {data?.sources.map(source => <div className="border rounded p-3 mb-2" key={source.id}>
      <strong>{source.name}</strong><span className="small ms-2">{source.enabled ? '更新已开启' : '已停用'} · 最近成功 {date(source.last_success_at)}</span>
      <p className="small text-break mb-1">{source.url}</p>
      <p className="small text-muted mb-2">下次检查 {date(source.next_poll_at)}{source.websub_state ? ` · 更新通知：${source.websub_state === 'verified' ? '已验证' : '等待验证'}` : ''}</p>
      {source.last_error && <p className="small text-danger">{source.last_error}</p>}
      <div className="d-flex gap-2 flex-wrap mb-2"><Button size="sm" variant="outline-primary" disabled={busy || !source.enabled} onClick={() => act(() => queuePodcastSource(source.id), '采集任务已排队。')}>检查新单集</Button>
        <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => act(() => savePodcastSource({ ...source, enabled: !source.enabled }, source.id), source.enabled ? '来源已停用，相关单集退出推荐。' : '来源已启用。')}>{source.enabled ? '停用来源' : '启用来源'}</Button></div>
      <Form.Check id={`trusted-${source.id}`} label="已人工核准为可信来源" checked={source.trusted} disabled={busy} onChange={e => act(() => savePodcastSource({ ...source, trusted: e.target.checked, auto_approve: false }, source.id), '来源信任设置已保存。')} />
      <Form.Check id={`auto-${source.id}`} label="完整资料通过规则检查后自动发布（默认关闭）" checked={source.auto_approve} disabled={busy || !source.trusted} onChange={e => act(() => savePodcastSource({ ...source, auto_approve: e.target.checked }, source.id), '发布设置已保存。AI 生成的整理结果仍需人工审核。')} />
    </div>)}
    {data?.discoveries.some(item => item.status === 'pending') && <details className="my-3"><summary>候选来源待确认</summary>
      {data.discoveries.filter(item => item.status === 'pending').map(item => <div className="border-bottom py-2" key={item.id}><strong>{item.title}</strong><p className="small text-break mb-1">{item.url} · {item.provider}</p>
        <Button size="sm" disabled={busy} onClick={() => act(() => reviewPodcastSource(item.id, true), '已按公开 RSS 接入，等待后台采集；请核准服务端来源主机。')}>已核对公开 RSS，接入</Button>{' '}
        <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => act(() => reviewPodcastSource(item.id, false), '候选来源已忽略。')}>忽略</Button></div>)}
    </details>}
    {data?.jobs.length > 0 && <details className="mt-3"><summary>后台任务与失败重试</summary><Table responsive size="sm" className="mt-2"><thead><tr><th>任务</th><th>状态</th><th>次数</th><th>说明</th></tr></thead><tbody>{data.jobs.map(job => <tr key={job.id}><td>{kinds[job.kind] || job.kind}</td><td>{states[job.state]}</td><td>{job.attempts}</td><td>{job.error || '—'} {job.state === 'failed' && <Button size="sm" variant="link" disabled={busy} onClick={() => act(() => retryPodcastJob(job.id), '重试任务已排队。')}>重试</Button>}</td></tr>)}</tbody></Table></details>}
  </Card.Body></Card>;
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Col, Form, Row, Spinner } from 'react-bootstrap';
import { listPodcastPrograms, reviewPodcastProgram, savePodcastProgram, syncPodcastProgram, syncDuePodcasts } from '../services/podcasts';
import PodcastPipelineAdmin from '../components/PodcastPipelineAdmin';

const TOPICS = [['budget', '安排收支'], ['choice', '理解取舍'], ['buffer', '留有余地'], ['risk', '理解风险']];
const blank = { name: '', publisher: '', description: '', canonical_url: '', episode_title: '', episode_url: '',
  episode_summary: '', episode_published_at: '', xiaoyuzhou_url: '', ximalaya_url: '',
  rss_url: '', source_permission: 'manual', topics: [], difficulty: 1, quality_score: 0.8,
  last_episode_at: '', promotion_flag: false, product_pitch: false, language: 'zh', region: 'CN' };

function formValue(program) {
  return { ...blank, ...program,
    xiaoyuzhou_url: program.platform_links?.find(item => item.platform === 'xiaoyuzhou')?.url || '',
    ximalaya_url: program.platform_links?.find(item => item.platform === 'ximalaya')?.url || '' };
}

export default function PodcastAdmin() {
  const [programs, setPrograms] = useState(null);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('draft');
  const [confirmReview, setConfirmReview] = useState(false);
  const editorHeading = useRef(null);
  const detailHeading = useRef(null);
  const queueFilter = useRef(null);
  const detailTrigger = useRef(null);
  useEffect(() => { if (editorOpen) editorHeading.current?.focus(); }, [editorOpen, editing]);
  useEffect(() => { if (selectedId) detailHeading.current?.focus(); }, [selectedId]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try { setPrograms(await listPodcastPrograms()); setLoadError(''); }
    catch (e) { setLoadError(e?.response?.data?.message || '节目目录暂时无法读取。'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const operate = async (action, message) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await load(); setNotice(message); }
    catch (e) { setError(e?.response?.data?.message || '操作失败，请重试。'); }
    finally { setBusy(false); }
  };
  const save = event => {
    event.preventDefault();
    const payload = { ...form, difficulty: Number(form.difficulty), quality_score: Number(form.quality_score),
      platform_links: [
        ...(form.xiaoyuzhou_url ? [{ platform: 'xiaoyuzhou', url: form.xiaoyuzhou_url }] : []),
        ...(form.ximalaya_url ? [{ platform: 'ximalaya', url: form.ximalaya_url }] : []),
      ] };
    operate(async () => { await savePodcastProgram(payload, editing); setEditing(null); setForm(blank); setEditorOpen(false); queueFilter.current?.focus(); },
      '单集资料已保存为待审核。');
  };
  const selected = (programs || []).find(program => program.id === selectedId);
  const visible = (programs || []).filter(program => filter === 'all' || program.status === filter);
  const pending = (programs || []).filter(program => program.status === 'draft').length;
  const statusLabel = { draft: '待审核', approved: '已发布', withdrawn: '已撤回' };
  const blockers = selected?.review_blockers || [];
  const closeDetail = () => {
    setSelectedId(null); setConfirmReview(false);
    detailTrigger.current?.focus();
  };
  return <div className="podcast-admin">
    <section className="admin-editorial-section" aria-label="播客单集审核">
      <div className="review-section-head"><div><h2>单集审核</h2><p>核对一期音频的来源、发布日期和内容，再决定是否发布。</p></div>
        <Button variant="outline-success" size="sm" disabled={busy || editorOpen} onClick={() => { setEditing(null); setForm(blank); setEditorOpen(true); }}>添加单集</Button></div>
      {error && <Alert variant="danger" role="alert">{error}</Alert>}
      {loadError && <Alert variant="warning" role="alert">{loadError} <Button size="sm" variant="link" disabled={busy} onClick={load}>重试读取目录</Button></Alert>}
      {notice && <Alert variant="success" role="status">{notice}</Alert>}
      <div className="review-workbench">
        <div className="review-queue">
          <label className="review-filter">单集状态<select ref={queueFilter} className="form-select" value={filter} onChange={e => { setFilter(e.target.value); setSelectedId(null); setConfirmReview(false); }}>
            <option value="draft">待审核（{pending}）</option><option value="approved">已发布</option><option value="withdrawn">已撤回</option><option value="all">全部单集</option>
          </select></label>
          {!programs && !loadError && <Spinner role="status" className="mt-3" />}
          {programs && !visible.length && <p className="text-muted mt-3">{programs.length ? '此状态暂无单集。' : '目录还没有单集。请先添加并审核。'}</p>}
          <ul className="review-queue-list">{visible.map(program => <li key={program.id}>
            <button type="button" disabled={busy} aria-pressed={selectedId === program.id} onClick={e => { detailTrigger.current = e.currentTarget; setSelectedId(program.id); setConfirmReview(false); }}>
              <strong>{program.episode_title || '待补充单集'}</strong>
              <small>{statusLabel[program.status] || program.status} · {program.name}</small>
              <span className="review-entry-action">核对单集 <span aria-hidden="true">→</span></span>
            </button>
          </li>)}</ul>
        </div>
        <div className="review-detail" role="region" aria-label="播客审核详情">
          {selected ? <>
            <h3 tabIndex={-1} ref={detailHeading}>{selected.episode_title || '待补充单集'}</h3>
            <p className="small text-muted">{selected.publisher} · {selected.episode_published_at || '发布日期待填写'} · {statusLabel[selected.status]}</p>
            {selected.episode_url && <p><a href={selected.episode_url} target="_blank" rel="noreferrer">打开原始单集 ↗</a></p>}
            <p>{selected.episode_summary || '待补充本期简介。'}</p>
            <p className="small text-muted">学习主题：{(selected.topics || []).map(topic => TOPICS.find(([id]) => id === topic)?.[1]).filter(Boolean).join('、') || '待补充'} · {selected.promotion_flag || selected.product_pitch ? '含推广或产品推介' : '未标记推广'}</p>
            {selected.source_synced_at && <p className="small text-muted">RSS 更新：{selected.source_synced_at.slice(0, 16)}</p>}
            {selected.source_error && <p className="small text-danger">同步失败：{selected.source_error}</p>}
            {selected.processing?.suggestions && <details className="review-disclosure"><summary>内容整理依据与学习要点</summary>
              {selected.processing.superseded_by_editor && <p className="small">资料已由编辑修订，以下保留原始整理参考。</p>}
              <p className="small">整理依据为发布者标题与简介，未审听完整音频。{selected.processing.ai_used ? 'AI 整理建议需人工核对。' : '采用可追溯的文字摘录。'}</p>
              <p>{selected.processing.suggestions.summary}</p>
              <ul className="small">{(selected.processing.suggestions.knowledge_points || []).map((point, index) => <li key={index}>{point.text}（原文依据：{point.quote}）</li>)}</ul>
              <p className="small text-muted">主题识别：{selected.processing.semantic_used ? '关键词与语义模型' : '关键词规则'} · 整理版本 {selected.processing.version}</p>
              {!!selected.processing.fallback_reasons?.length && <p className="small text-muted">回退记录：{selected.processing.fallback_reasons.join('、')}</p>}
            </details>}
            {!!blockers.length && <Alert variant="warning">{blockers.join('；')}。请编辑核对后再审核发布。</Alert>}
            <div className="review-actions">
              <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => { setEditing(selected.id); setForm(formValue(selected)); setEditorOpen(true); }}>编辑</Button>
              {selected.rss_url && <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => operate(() => syncPodcastProgram(selected.id), '来源简介已更新。')}>同步 RSS</Button>}
              {!confirmReview && <Button size="sm" variant={selected.status === 'approved' ? 'outline-danger' : 'success'} disabled={busy || (selected.status !== 'approved' && blockers.length > 0)} onClick={() => setConfirmReview(true)}>{selected.status === 'approved' ? '撤回' : '审核发布'}</Button>}
              <Button size="sm" variant="link" disabled={busy} onClick={closeDetail}>关闭详情</Button>
            </div>
            {confirmReview && <div className="review-confirm">
              <p>{selected.status === 'approved' ? '撤回后，这期音频将退出推荐目录。' : '发布后，这期音频可以参与学生端的每日推荐。'}</p>
              <Button size="sm" variant={selected.status === 'approved' ? 'danger' : 'success'} disabled={busy || (selected.status !== 'approved' && blockers.length > 0)} onClick={() => {
                const approve = selected.status !== 'approved';
                operate(async () => { await reviewPodcastProgram(selected.id, approve); setConfirmReview(false); setSelectedId(null); queueFilter.current?.focus(); }, approve ? '单集已审核发布。' : '单集已撤回。');
              }}>{selected.status === 'approved' ? '确认撤回' : '确认发布'}</Button>
              <Button size="sm" variant="link" disabled={busy} onClick={() => setConfirmReview(false)}>取消</Button>
            </div>}
          </> : <p className="text-muted">选择一条单集，核对证据和发布条件。</p>}
        </div>
      </div>
    </section>
    {editorOpen && <section className="admin-editorial-section">
      <h2 className="h5" tabIndex={-1} ref={editorHeading}>{editing ? '编辑单集' : '添加单集'}</h2>
      <Form onSubmit={save}>
        <Row><Col md={6}><Form.Group controlId="podcast-name" className="mb-3"><Form.Label>节目名称</Form.Label><Form.Control required maxLength={120} value={form.name} onChange={e => update('name', e.target.value)} /></Form.Group></Col>
          <Col md={6}><Form.Group controlId="podcast-publisher" className="mb-3"><Form.Label>发布者</Form.Label><Form.Control required maxLength={120} value={form.publisher} onChange={e => update('publisher', e.target.value)} /></Form.Group></Col></Row>
        <Form.Group controlId="podcast-description" className="mb-3"><Form.Label>发布者填写的节目简介</Form.Label><Form.Control required as="textarea" rows={3} maxLength={3000} value={form.description} onChange={e => update('description', e.target.value)} /></Form.Group>
        <Form.Group controlId="podcast-url" className="mb-3"><Form.Label>节目主页（HTTPS）</Form.Label><Form.Control required type="url" value={form.canonical_url} onChange={e => update('canonical_url', e.target.value)} /></Form.Group>
        <Form.Group controlId="podcast-episode-title" className="mb-3"><Form.Label>单集标题</Form.Label><Form.Control required maxLength={180} value={form.episode_title} onChange={e => update('episode_title', e.target.value)} /></Form.Group>
        <Form.Group controlId="podcast-episode-url" className="mb-3"><Form.Label>单集直达链接（HTTPS）</Form.Label><Form.Control required type="url" value={form.episode_url} onChange={e => update('episode_url', e.target.value)} /></Form.Group>
        <Form.Group controlId="podcast-episode-summary" className="mb-3"><Form.Label>本期内容简介</Form.Label><Form.Control required as="textarea" rows={3} maxLength={2000} value={form.episode_summary} onChange={e => update('episode_summary', e.target.value)} /></Form.Group>
        <Row><Col md={6}><Form.Group controlId="podcast-episode-date" className="mb-3"><Form.Label>单集发布日期</Form.Label><Form.Control required type="date" value={form.episode_published_at} onChange={e => update('episode_published_at', e.target.value)} /></Form.Group></Col>
          <Col md={6}><Form.Group controlId="podcast-updated" className="mb-3"><Form.Label>节目最近更新日期</Form.Label><Form.Control required type="date" value={form.last_episode_at} onChange={e => update('last_episode_at', e.target.value)} /></Form.Group></Col></Row>
        <Row><Col md={6}><Form.Group controlId="podcast-xiaoyuzhou" className="mb-3"><Form.Label>小宇宙本期其他链接（可选）</Form.Label><Form.Control type="url" value={form.xiaoyuzhou_url} onChange={e => update('xiaoyuzhou_url', e.target.value)} /></Form.Group></Col>
          <Col md={6}><Form.Group controlId="podcast-ximalaya" className="mb-3"><Form.Label>喜马拉雅本期链接（可选）</Form.Label><Form.Control type="url" value={form.ximalaya_url} onChange={e => update('ximalaya_url', e.target.value)} /></Form.Group></Col></Row>
        <Form.Group className="mb-3"><Form.Label as="div">主要主题</Form.Label><div className="d-flex flex-wrap gap-3">{TOPICS.map(([id, label]) => <Form.Check id={`podcast-topic-${id}`} key={id} type="checkbox" label={label} checked={form.topics.includes(id)} onChange={e => update('topics', e.target.checked ? [...form.topics, id] : form.topics.filter(topic => topic !== id))} />)}</div></Form.Group>
        <Row><Col md={3}><Form.Group controlId="podcast-difficulty" className="mb-3"><Form.Label>难度</Form.Label><Form.Select value={form.difficulty} onChange={e => update('difficulty', e.target.value)}><option value="1">入门</option><option value="2">基础</option><option value="3">进阶</option></Form.Select></Form.Group></Col>
          <Col md={3}><Form.Group controlId="podcast-quality" className="mb-3"><Form.Label>内容质量（0～1）</Form.Label><Form.Control type="number" min="0" max="1" step="0.01" value={form.quality_score} onChange={e => update('quality_score', e.target.value)} /></Form.Group></Col>
          <Col md={3}><Form.Group controlId="podcast-permission" className="mb-3"><Form.Label>来源许可</Form.Label><Form.Select value={form.source_permission} onChange={e => update('source_permission', e.target.value)}><option value="manual">人工核对链接</option><option value="public_rss">公开 RSS</option><option value="licensed">已获授权</option></Form.Select></Form.Group></Col></Row>
        {form.source_permission !== 'manual' && <Form.Group controlId="podcast-rss" className="mb-3"><Form.Label>RSS 地址（须在服务端允许列表）</Form.Label><Form.Control type="url" value={form.rss_url} onChange={e => update('rss_url', e.target.value)} /></Form.Group>}
        <div className="d-flex flex-wrap gap-3 mb-3"><Form.Check id="podcast-promotion" type="checkbox" label="含商业推广" checked={form.promotion_flag} onChange={e => update('promotion_flag', e.target.checked)} /><Form.Check id="podcast-product-pitch" type="checkbox" label="推介具体金融产品" checked={form.product_pitch} onChange={e => update('product_pitch', e.target.checked)} /></div>
        <Button type="submit" disabled={busy || !form.topics.length}>{busy ? '保存中…' : '保存待审核'}</Button>
        <Button type="button" variant="link" disabled={busy} onClick={() => { setEditing(null); setForm(blank); setEditorOpen(false); queueFilter.current?.focus(); }}>取消编辑</Button>
      </Form>
    </section>}
    <details className="review-source">
      <summary>采集来源与同步记录</summary>
      <div className="review-actions mt-3"><Button variant="outline-secondary" size="sm" disabled={busy} onClick={() => operate(syncDuePodcasts, '到期来源已加入后台采集队列。')}>同步到期来源</Button></div>
      <PodcastPipelineAdmin onCatalogueChange={load} />
    </details>
  </div>;
}

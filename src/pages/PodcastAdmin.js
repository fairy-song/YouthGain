import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap';
import { listPodcastPrograms, reviewPodcastProgram, savePodcastProgram, syncPodcastProgram, syncDuePodcasts } from '../services/podcasts';

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try { setPrograms(await listPodcastPrograms()); setError(''); }
    catch (e) { setError(e?.response?.data?.message || '节目目录暂时无法读取。'); }
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
    operate(async () => { await savePodcastProgram(payload, editing); setEditing(null); setForm(blank); },
      '单集资料已保存为待审核。');
  };
  return <div className="podcast-admin">
    <p>每条目录记录对应一期音频。先核对单集内容、发布日期和直达链接，再发布给学生；同一节目可收录多期。</p>
    {error && <Alert variant="danger" role="alert">{error}</Alert>}
    {notice && <Alert variant="success" role="status">{notice}</Alert>}
    <Card className="mb-4"><Card.Body>
      <h2 className="h5">{editing ? '编辑单集' : '添加单集'}</h2>
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
        {editing && <Button type="button" variant="link" onClick={() => { setEditing(null); setForm(blank); }}>取消编辑</Button>}
      </Form>
    </Card.Body></Card>
    <div className="d-flex justify-content-between align-items-center mb-3"><h2 className="h5 mb-0">单集目录</h2><Button variant="outline-secondary" size="sm" disabled={busy} onClick={() => operate(syncDuePodcasts, '已尝试同步到期的来源。')}>同步到期来源</Button></div>
    {!programs ? <Spinner role="status" /> : programs.length === 0 ? <p>目录还没有单集。请先添加并审核。</p> : programs.map(program => <Card key={program.id} className="mb-3"><Card.Body>
      <div className="d-flex justify-content-between gap-3 flex-wrap"><div><h3 className="h6 mb-1">{program.episode_title || '待补充单集'} · {program.name}</h3><p className="small text-muted mb-1">{program.publisher} · {program.topics.map(topic => TOPICS.find(([id]) => id === topic)?.[1]).join('、')}</p><p className="small mb-1">状态：{({ draft: '待审核', approved: '已发布', withdrawn: '已撤回' })[program.status]} · 发布日期：{program.episode_published_at || '待填写'}</p>{program.source_synced_at && <p className="small text-muted mb-1">RSS 更新：{program.source_synced_at.slice(0, 16)}</p>}{program.source_error && <p className="small text-danger mb-1">同步失败：{program.source_error}</p>}</div>
      <div className="d-flex gap-2 flex-wrap align-content-start"><Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => { setEditing(program.id); setForm(formValue(program)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>编辑</Button>
        {program.rss_url && <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => operate(() => syncPodcastProgram(program.id), '来源简介已更新。')}>同步 RSS</Button>}
        {program.status !== 'approved' ? <Button size="sm" disabled={busy} onClick={() => operate(() => reviewPodcastProgram(program.id, true), '单集已审核发布。')}>审核发布</Button>
          : <Button size="sm" variant="outline-danger" disabled={busy} onClick={() => operate(() => reviewPodcastProgram(program.id, false), '单集已撤回。')}>撤回</Button>}</div></div>
    </Card.Body></Card>)}
  </div>;
}

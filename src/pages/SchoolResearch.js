import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Spinner } from 'react-bootstrap';
import { getResearchAccess, createResearchProject, setResearchMember, getResearchReleases, publishResearchRelease, exportResearchRelease, sendResearchVerification, refreshResearchIdentity, researchError } from '../services/research';

export default function SchoolResearch() {
  const [access, setAccess] = useState(null);
  const [selected, setSelected] = useState('');
  const [releases, setReleases] = useState([]);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [error, setError] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [month, setMonth] = useState('');
  const [member, setMember] = useState({ email: '', expires: '' });
  const [form, setForm] = useState({ title: '', school: '', purpose: '', start_month: '', end_month: '', mode: 'demo' });
  useEffect(() => {
    let active = true;
    getResearchAccess().then(data => {
      if (!active) return;
      setAccess(data);
      setSelected(value => data.projects.some(p => p.id === value) ? value : data.projects[0]?.id || '');
    }).catch(e => { if (active) setError(researchError(e)); });
    return () => { active = false; };
  }, [reload]);
  useEffect(() => {
    let active = true;
    setReleases([]);
    if (!selected) return () => { active = false; };
    setLoadingReleases(true);
    getResearchReleases(selected).then(data => { if (active) setReleases(data.releases); })
      .catch(e => { if (active) setError(researchError(e)); }).finally(() => { if (active) setLoadingReleases(false); });
    return () => { active = false; };
  }, [selected, reload]);
  const project = access?.projects.find(p => p.id === selected);
  async function run(action) {
    setBusy(true); setError('');
    try { await action(); setReload(v => v + 1); }
    catch (e) { setError(researchError(e)); }
    finally { setBusy(false); }
  }
  const field = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  return <Container className="py-4" style={{ maxWidth: 1100 }}>
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <div><span className="text-success small">YOUTHGAIN · 群体消费研究</span><h1 className="h3 mt-1">学校研究</h1></div>
      <Link to="/research/participation">学生研究参与</Link>
    </div>
    <p className="text-muted">查看获授权项目的月度群体统计，了解消费结构与预算安排。统计来自自愿参与者，不直接代表全校学生。</p>
    {error && <Alert variant="danger">{error}<Button variant="link" onClick={() => { setError(''); setReload(v => v + 1); }}>重试</Button></Alert>}
    {!access && !error && <Spinner animation="border" aria-label="加载研究权限" />}
    {access?.requires_email_verification && <Alert variant="info">
      <p>学校研究权限需要验证登录邮箱。</p>
      {verificationSent && <p>验证邮件已发送，请打开邮件中的链接，再点击“已验证，刷新权限”。</p>}
      <Button size="sm" variant="outline-primary" className="me-2" disabled={busy || verificationSent} onClick={() => run(async () => { await sendResearchVerification(); setVerificationSent(true); })}>发送邮箱验证链接</Button>
      <Button size="sm" variant="outline-primary" disabled={busy} onClick={() => run(refreshResearchIdentity)}>已验证，刷新权限</Button>
    </Alert>}
    {access && !access.can_manage && !access.projects.length && <Alert variant="light">当前账号没有有效的学校研究授权。请由项目管理者绑定已验证的登录邮箱及授权期限。</Alert>}
    {access?.can_manage && <Card className="mb-4 border-0 shadow-sm"><Card.Body>
      <h2 className="h5">研究项目管理</h2>
      <p className="small text-muted">真实研究平台累计隐私预算：已用 {access.global_budget.spent_milli / 1000} / {access.global_budget.total_milli / 1000} ε。各项目共用此上限，模拟发布不消耗真实预算。</p>
      <details className="mb-3"><summary>查看发布预算记录</summary>
        {!access.global_budget.entries?.length ? <p className="small mt-2">暂无发布记录。</p> : <div className="table-responsive mt-2"><table className="table table-sm">
          <thead><tr><th>项目与月份</th><th>来源</th><th>真实预算消耗</th><th>发布时间</th></tr></thead>
          <tbody>{access.global_budget.entries.map(entry => <tr key={entry.release}>
            <td>{access.projects.find(p => entry.release.startsWith(`${p.id}:`))?.title || '研究项目'} · {entry.release.slice(-7)}</td>
            <td>{entry.mode === 'demo' ? '模拟' : '真实'}</td><td>{entry.epsilon_milli / 1000} ε</td><td>{entry.at}</td>
          </tr>)}</tbody>
        </table></div>}
      </details>
      <details><summary>建立研究项目</summary>
        <Form className="mt-3" onSubmit={e => { e.preventDefault(); run(async () => { const data = await createResearchProject(form); setSelected(data.project.id); }); }}>
          <Row className="g-3">
            <Col md={6}><Form.Label htmlFor="research-title">项目名称</Form.Label><Form.Control id="research-title" value={form.title} onChange={e => field('title', e.target.value)} maxLength={100} required /></Col>
            <Col md={6}><Form.Label htmlFor="research-school">学校名称</Form.Label><Form.Control id="research-school" value={form.school} onChange={e => field('school', e.target.value)} maxLength={100} required /></Col>
            <Col md={12}><Form.Label htmlFor="research-purpose">研究目的与用途</Form.Label><Form.Control as="textarea" id="research-purpose" value={form.purpose} onChange={e => field('purpose', e.target.value)} maxLength={1000} required /></Col>
            <Col md={4}><Form.Label htmlFor="research-start">开始月份</Form.Label><Form.Control type="month" id="research-start" value={form.start_month} onChange={e => field('start_month', e.target.value)} required /></Col>
            <Col md={4}><Form.Label htmlFor="research-end">结束月份</Form.Label><Form.Control type="month" id="research-end" value={form.end_month} onChange={e => field('end_month', e.target.value)} required /></Col>
            <Col md={4}><Form.Label htmlFor="research-mode">数据来源</Form.Label><Form.Select id="research-mode" value={form.mode} onChange={e => field('mode', e.target.value)}><option value="demo">模拟演示数据</option><option value="live" disabled={!access.live_enabled}>自愿参与的真实记录</option></Form.Select></Col>
          </Row>
          <p className="small text-muted mt-3">研究期为1至6个月，每月固定一次发布、ε=1；这是一套待试点评估的参数，不代表对所有研究都足够。真实研究由服务器配置开启。</p>
          <Button type="submit" variant="success" disabled={busy}>建立项目</Button>
        </Form>
      </details>
    </Card.Body></Card>}
    {access?.projects.length > 0 && <Form.Group className="mb-4"><Form.Label htmlFor="research-project">选择研究项目</Form.Label><Form.Select id="research-project" value={selected} onChange={e => setSelected(e.target.value)} disabled={busy}>
      {access.projects.map(p => <option key={p.id} value={p.id}>{p.school} · {p.title}{p.mode === 'demo' ? '（模拟）' : ''}</option>)}
    </Form.Select></Form.Group>}
    {project && <>
      <Card className="mb-4 border-0 shadow-sm"><Card.Body>
        <h2 className="h5">{project.title} {project.mode === 'demo' && <Badge bg="warning" text="dark">模拟数据</Badge>}</h2>
        <p>{project.purpose}</p>
        <p className="small text-muted">{project.start_month} 至 {project.end_month} · 项目发布预算已用 {project.epsilon_spent} / {project.epsilon_total} ε</p>
        {project.mode === 'demo' && <Alert variant="warning">本项目使用程序生成的模拟数据，与真实学生记录无关，不能用于研究结论。</Alert>}
        {access.can_manage && <>
          <Form className="d-flex flex-wrap align-items-end gap-2 mb-3" onSubmit={e => { e.preventDefault(); run(() => publishResearchRelease(selected, month)); }}>
            <div><Form.Label htmlFor="publish-month">发布月份</Form.Label><Form.Control type="month" id="publish-month" value={month} min={project.start_month} max={project.end_month} onChange={e => setMonth(e.target.value)} required /></div>
            <Button type="submit" variant="success" disabled={busy}>生成月度快照</Button>
          </Form>
          <p className="small text-muted">仅发布已结束的月份。重复操作复用同一快照；统计信号不足的发布也计入预算。</p>
          <details><summary>管理学校研究授权</summary>
            <Form className="d-flex flex-wrap align-items-end gap-2 mt-3" onSubmit={e => { e.preventDefault(); run(() => setResearchMember(selected, member)); }}>
              <div><Form.Label htmlFor="member-email">研究者登录邮箱</Form.Label><Form.Control id="member-email" type="email" value={member.email} onChange={e => setMember(v => ({ ...v, email: e.target.value }))} required /></div>
              <div><Form.Label htmlFor="member-expires">授权截止日期</Form.Label><Form.Control id="member-expires" type="date" value={member.expires} onChange={e => setMember(v => ({ ...v, expires: e.target.value }))} required /></div>
              <Button type="submit" variant="outline-success" disabled={busy}>保存授权</Button>
            </Form>
            <ul className="mt-3">{Object.entries(project.researchers || {}).map(([email, expires]) => <li key={email}>{email} · 截止 {expires} <Button size="sm" variant="link" disabled={busy} onClick={() => run(() => setResearchMember(selected, { email, revoke: true }))}>撤销授权</Button></li>)}</ul>
          </details>
        </>}
      </Card.Body></Card>
      {loadingReleases ? <Spinner animation="border" aria-label="加载研究快照" /> : !releases.length && <Alert variant="light">该项目尚未发布月度统计。</Alert>}
      {releases.map(snapshot => <Card key={snapshot.month} className="mb-4 border-0 shadow-sm"><Card.Body>
        <div className="d-flex flex-wrap justify-content-between gap-2"><h2 className="h5">{snapshot.month} · 月度统计 {snapshot.mode === 'demo' && '（模拟）'}</h2>
          <Button size="sm" variant="outline-success" disabled={busy} onClick={() => run(() => exportResearchRelease(selected, snapshot.month))}>导出本月快照</Button></div>
        {snapshot.status !== 'published' && <Alert variant="info">{snapshot.message}</Alert>}
        <Row className="g-4 mt-1">{snapshot.charts.map(chart => <Col md={4} key={chart.title}><h3 className="h6">{chart.title}</h3>
          <div role="group" aria-label={chart.title}>{chart.bins.map(bin => <div className="mb-3" key={bin.label}>
            <div className="d-flex justify-content-between small"><span>{bin.label}</span><strong>{bin.percent.toFixed(1)}%</strong></div>
            <div className="progress mt-1" style={{ height: 8 }}><div className="progress-bar bg-success" style={{ width: `${bin.percent}%` }} /></div>
          </div>)}</div>
        </Col>)}</Row>
        <p className="small text-muted mt-3">{snapshot.notice}</p>
        <details className="small"><summary>统计口径与隐私说明</summary><p className="mt-2">{snapshot.record_scope}</p><p>{snapshot.trust_boundary}</p>
          <p>版本 {snapshot.version} · ε={snapshot.epsilon}，δ={snapshot.delta} · {snapshot.privacy_unit}</p>
          <p>单个统计坐标的理论95%噪声范围约 ±{snapshot.coordinate_noise_95}。{snapshot.noise_note}</p>
          <p>发布时间：{snapshot.published_at}。查看和导出复用同一结果。</p>
        </details>
      </Card.Body></Card>)}
    </>}
  </Container>;
}

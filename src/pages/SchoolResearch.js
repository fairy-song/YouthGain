import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Col, Form, Row, Spinner } from 'react-bootstrap';
import { useAuth } from '../contexts/AuthContext';
import ResearchCharts from '../components/ResearchCharts';
import { getResearchAccess, createResearchProject, setResearchMember, getResearchReleases, publishResearchRelease, exportResearchRelease, sendResearchVerification, refreshResearchIdentity, researchError } from '../services/research';
import './SchoolResearch.css';

export default function SchoolResearch({ managementMode = false }) {
  const { currentUser } = useAuth() || {};
  const [access, setAccess] = useState(null);
  const [selected, setSelected] = useState('');
  const [releases, setReleases] = useState([]);
  const [releasesFor, setReleasesFor] = useState('');
  const [reportMonth, setReportMonth] = useState('');
  const [releaseError, setReleaseError] = useState('');
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [error, setError] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [month, setMonth] = useState('');
  const [pendingPublish, setPendingPublish] = useState(null);
  const [member, setMember] = useState({ email: '', expires: '' });
  const [form, setForm] = useState({ title: '', school: '', purpose: '', start_month: '', end_month: '', mode: 'demo' });
  useEffect(() => {
    let active = true;
    getResearchAccess().then(data => {
      if (!active) return;
      if (Boolean(data.can_manage) !== managementMode) {
        setAccess(null);
        setSelected('');
        setError(managementMode ? '当前账号无法管理研究项目。' : '请使用研究项目授权的教师或研究人员账号。');
        return;
      }
      setAccess(data);
      setSelected(value => data.projects.some(p => p.id === value) ? value : data.projects[0]?.id || '');
    }).catch(e => { if (active) { setAccess(null); setSelected(''); setError(researchError(e)); } });
    return () => { active = false; };
  }, [managementMode, reload]);
  useEffect(() => {
    let active = true;
    setReleases([]);
    setReleasesFor('');
    setReleaseError('');
    if (!selected) return () => { active = false; };
    setLoadingReleases(true);
    getResearchReleases(selected).then(data => {
      if (!active) return;
      setReleases([...data.releases].sort((a, b) => b.month.localeCompare(a.month)));
      setReleasesFor(selected);
    }).catch(e => {
      if (active) setReleaseError(researchError(e));
    }).finally(() => { if (active) setLoadingReleases(false); });
    return () => { active = false; };
  }, [selected, reload]);
  const project = access?.projects.find(p => p.id === selected);
  const noAccess = access && !access.requires_email_verification && !access.can_manage && !access.projects.length;
  const snapshot = releasesFor === selected ? releases.find(entry => entry.month === reportMonth) || releases[0] : null;
  async function run(action, message = '', refresh = true) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(message); if (refresh) setReload(v => v + 1); }
    catch (e) { setError(researchError(e)); }
    finally { setBusy(false); }
  }
  const field = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  return <div className="school-research">
    {!managementMode && <header className="research-masthead">
      <div><span>YOUTHGAIN / 校园研究</span><h1>学校研究</h1></div>
      {!noAccess && <Link to="/research/login">切换账号</Link>}
    </header>}
    {!managementMode && <p className="research-intro">获授权项目的月度群体统计，仅代表自愿参与者。</p>}
    {error && <Alert variant="danger">{error}<Button variant="link" onClick={() => { setError(''); setReload(v => v + 1); }}>重试</Button></Alert>}
    {notice && <p role="status" className="text-success">{notice}</p>}
    {!access && !error && <p role="status">正在核对学校端访问权限…</p>}
    {access?.requires_email_verification && <section className="research-access-state" aria-labelledby="research-verify-title">
      <h2 id="research-verify-title">先验证邮箱</h2>
      {currentUser?.email && <p>当前账号：<strong>{currentUser.email}</strong></p>}
      <p>验证通过后，系统会用这个邮箱核对项目授权。请先打开验证邮件里的链接，再返回此页刷新权限。</p>
      {verificationSent && <p role="status">验证邮件已发送，请查看收件箱和垃圾邮件。</p>}
      <Button size="sm" variant="outline-primary" className="me-2" disabled={busy || verificationSent} onClick={() => run(async () => { await sendResearchVerification(); setVerificationSent(true); })}>发送邮箱验证链接</Button>
      <Button size="sm" variant="outline-primary" disabled={busy} onClick={() => run(refreshResearchIdentity)}>已验证，刷新权限</Button>
    </section>}
    {noAccess && <section className="research-access-state" aria-labelledby="research-denied-title">
      <h2 id="research-denied-title">当前账号没有有效的学校研究授权</h2>
      {currentUser?.email && <p>当前账号：<strong>{currentUser.email}</strong></p>}
      <p>请把当前登录邮箱发给项目负责人，请对方添加项目授权并确认截止日期。若授权的是另一个邮箱，请切换账号。</p>
      <div className="research-access-actions"><Button size="sm" variant="outline-success" disabled={busy} onClick={() => {
        setError(''); setAccess(null); setReload(value => value + 1);
      }}>重新检查授权</Button><Link to="/research/login">切换账号</Link><Link to="/research/demo">先看演示月报</Link></div>
    </section>}
    {access?.can_manage && <details className="research-management">
      <summary>项目设置与发布指南</summary>
      <ol className="small text-muted mt-3">
        <li>建立或选择研究项目，核对学校、研究期和数据来源。</li>
        <li>在下方「发布与授权」生成已结束月份的月报。</li>
        <li>用老师注册青盈时的邮箱添加授权，设置截止日期，再把学校端入口发给老师。</li>
      </ol>
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
    </details>}
    {access?.projects.length > 0 && <div className="research-selectors"><Form.Group><Form.Label htmlFor="research-project">选择研究项目</Form.Label><Form.Select id="research-project" value={selected} onChange={e => {
      setSelected(e.target.value); setReportMonth(''); setMonth(''); setPendingPublish(null); setNotice(''); setError(''); setReleaseError('');
    }} disabled={busy}>
      {access.projects.map(p => <option key={p.id} value={p.id}>{p.school} · {p.title}{p.mode === 'demo' ? '（模拟）' : ''}</option>)}
    </Form.Select></Form.Group>
      {snapshot && <Form.Group><Form.Label htmlFor="research-report-month">查看月份</Form.Label><Form.Select id="research-report-month" value={snapshot.month}
        disabled={busy} onChange={e => { setReportMonth(e.target.value); setNotice(''); setError(''); }}>
        {releases.map(entry => <option value={entry.month} key={entry.month}>{entry.month}{entry.status !== 'published' ? ' · 暂无可解读数据' : ''}</option>)}
      </Form.Select></Form.Group>}
    </div>}
    {project && <>
      <section className="research-project-summary" aria-label="当前研究项目">
        <p className="research-kicker">{project.school} · {project.start_month} 至 {project.end_month}</p>
        <h2>{project.title}</h2><p>{project.purpose}</p>
        {project.mode === 'demo' ? <p className="research-source" data-kind="demo"><strong>模拟数据</strong> · 仅用于演示，不能用于研究结论。</p>
          : <p className="research-source"><strong>自愿参与统计</strong> · 仅涵盖本项目的受保护月度快照。</p>}
      </section>
      {releaseError ? <Alert variant="danger">{releaseError}<Button variant="link" onClick={() => setReload(v => v + 1)}>重试读取月报</Button></Alert>
        : loadingReleases || releasesFor !== selected ? <Spinner animation="border" aria-label="加载研究快照" />
          : !snapshot && <p className="research-empty" role="status">该项目尚未发布月度统计。</p>}
      {snapshot && <article className="research-report" aria-label="项目月报">
        <header className="research-report-heading">
          <div><span className="research-kicker">月度报告 {snapshot.mode === 'demo' && ' / 模拟'}</span><h2>{snapshot.month}</h2></div>
          <Button size="sm" variant="outline-success" disabled={busy} onClick={() => run(() => exportResearchRelease(selected, snapshot.month), '本月快照已导出。', false)}>导出本月快照</Button>
        </header>
        {snapshot.status !== 'published' ? <Alert variant="info">{snapshot.message || '本月统计信号不足，暂不能解读。'}</Alert> : <ResearchCharts charts={snapshot.charts} />}
        <p className="research-report-note">{snapshot.notice}</p>
        <details className="research-notes"><summary>统计口径与隐私说明</summary>
          <p>{snapshot.record_scope}</p><p>{snapshot.trust_boundary}</p>
          <p>版本 {snapshot.version} · ε={snapshot.epsilon}，δ={snapshot.delta} · {snapshot.privacy_unit}</p>
          <p>单个统计坐标的理论95%噪声范围约 ±{snapshot.coordinate_noise_95}。{snapshot.noise_note}</p>
          <p>发布时间：{snapshot.published_at}。查看和导出复用同一结果。</p>
        </details>
      </article>}
        {access.can_manage && <section className="research-project-controls" aria-label="发布与授权">
          <h2>发布与授权</h2>
          <p className="small text-muted">项目发布预算已用 {project.epsilon_spent} / {project.epsilon_total} ε。</p>
          <Form className="d-flex flex-wrap align-items-end gap-2 mb-3" onSubmit={e => {
            e.preventDefault(); setPendingPublish({ projectId: selected, month });
          }}>
            <div><Form.Label htmlFor="publish-month">发布月份</Form.Label><Form.Control type="month" id="publish-month" value={month} min={project.start_month} max={project.end_month} onChange={e => setMonth(e.target.value)} required /></div>
            <Button type="submit" variant="outline-success" disabled={busy}>生成月度快照</Button>
          </Form>
          <p className="small text-muted">仅发布已结束的月份。重复操作复用同一快照；统计信号不足的发布也计入预算。</p>
          {pendingPublish?.projectId === selected && pendingPublish.month === month && <div className="research-confirm">
            <p>确认生成 {month} 的{project.mode === 'demo' ? '模拟' : '真实研究'}快照。{project.mode !== 'demo' && '首次发布会占用真实研究隐私预算。'}</p>
            <Button type="button" size="sm" variant="success" disabled={busy} onClick={() => run(async () => {
              await publishResearchRelease(pendingPublish.projectId, pendingPublish.month); setReportMonth(pendingPublish.month); setPendingPublish(null);
            }, '月度快照已生成。')}>确认生成</Button>
            <Button type="button" size="sm" variant="link" disabled={busy} onClick={() => setPendingPublish(null)}>取消</Button>
          </div>}
          <details><summary>管理学校研究授权</summary>
            <Form className="d-flex flex-wrap align-items-end gap-2 mt-3" onSubmit={e => { e.preventDefault(); run(() => setResearchMember(selected, member)); }}>
              <div><Form.Label htmlFor="member-email">研究者登录邮箱</Form.Label><Form.Control id="member-email" type="email" value={member.email} onChange={e => setMember(v => ({ ...v, email: e.target.value }))} required /></div>
              <div><Form.Label htmlFor="member-expires">授权截止日期</Form.Label><Form.Control id="member-expires" type="date" value={member.expires} onChange={e => setMember(v => ({ ...v, expires: e.target.value }))} required /></div>
              <Button type="submit" variant="outline-success" disabled={busy}>保存授权</Button>
            </Form>
            <ul className="mt-3">{Object.entries(project.researchers || {}).map(([email, expires]) => <li key={email}>{email} · 截止 {expires} <Button size="sm" variant="link" disabled={busy} onClick={() => run(() => setResearchMember(selected, { email, revoke: true }))}>撤销授权</Button></li>)}</ul>
          </details>
        </section>}
    </>}
  </div>;
}

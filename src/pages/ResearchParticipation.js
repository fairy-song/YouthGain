import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Container, Form, Spinner } from 'react-bootstrap';
import { getResearchParticipation, setResearchConsent, researchError } from '../services/research';

export default function ResearchParticipation() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [agreed, setAgreed] = useState({});
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    getResearchParticipation().then(data => { if (active) setProjects(data.projects); })
      .catch(e => { if (active) setError(researchError(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);
  async function change(project, participate) {
    setError(''); setBusy(project.id);
    try {
      await setResearchConsent(project.id, participate, project.consent_version);
      setAgreed(values => ({ ...values, [project.id]: false }));
      setReload(value => value + 1);
    } catch (e) { setError(researchError(e)); }
    finally { setBusy(''); }
  }
  return <Container className="py-4" style={{ maxWidth: 900 }}>
    <h1 className="h3">参与消费研究</h1>
    <p className="text-muted">自主选择是否提供研究贡献，帮助学校了解参与者的消费结构与预算安排。</p>
    <p><Link to="/profile">返回我的资料</Link> · <Link to="/research">学校研究入口</Link></p>
    {error && <Alert variant="danger">{error}<Button variant="link" onClick={() => { setError(''); setReload(v => v + 1); }}>重试</Button></Alert>}
    {loading ? <Spinner animation="border" aria-label="加载研究项目" /> : !projects.length && <Alert variant="light">暂无开放的真实研究项目。你可以继续使用记账和学习功能。</Alert>}
    {projects.map(project => <Card key={project.id} className="mb-4 border-0 shadow-sm"><Card.Body>
      <h2 className="h5">{project.title}</h2>
      <p>{project.school} · {project.start_month} 至 {project.end_month}</p>
      <p>{project.purpose}</p>
      <ul>
        <li>研究指标：月度已记录支出区间、类别占比、支出与预算的比较。</li>
        <li>青盈后端处理已保存的消费记录和月预算；学校仅接收经过差分隐私处理的群体统计，不接收你的账单、备注或聊天内容。</li>
        <li>加入从下一个完整自然月起生效。预算使用发布时的资料；统计基于每人最近最多2000笔记录，可能漏记或不完整。</li>
        <li>你可随时退出，停止参与之后的新发布；个人账本保留。已经发布或下载的群体结果无法追回其中的统计影响。</li>
        <li>不参加不影响记账、学习或 AI 教练。此授权独立于 AI 教练资料授权。</li>
        <li>研究特征即时计算、不另存明细；项目结束90天后，同意状态在下一次研究服务访问时清除。群体快照及预算审计记录保留，用于防止重复发布。</li>
      </ul>
      {project.consent?.active ? <>
        <Alert variant="success">已参与 · 从 {project.consent.effective_month} 起贡献</Alert>
        <Button variant="outline-secondary" disabled={Boolean(busy)} onClick={() => change(project, false)}>退出本研究</Button>
      </> : <>
        {project.consent?.withdrawn_at && <p className="text-muted">已退出，之后的新发布不会包含你的贡献。</p>}
        <Form.Check id={`consent-${project.id}`} label={`我已阅读说明，自愿参与“${project.title}”`} checked={Boolean(agreed[project.id])}
          onChange={e => setAgreed(values => ({ ...values, [project.id]: e.target.checked }))} disabled={!project.can_join || Boolean(busy)} />
        <Button className="mt-3" variant="success" disabled={!agreed[project.id] || !project.can_join || Boolean(busy)} onClick={() => change(project, true)}>
          {project.can_join ? '确认参与' : '已停止接收新参与者'}
        </Button>
      </>}
    </Card.Body></Card>)}
  </Container>;
}

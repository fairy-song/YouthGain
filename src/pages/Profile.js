import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Col, Container, Form, Row, Spinner } from 'react-bootstrap';
import { useAuth } from '../contexts/AuthContext';
import { getLearning, getQuestionnaires, saveLearningProfile, learningError } from '../services/learning';
import { questions } from '../data/firstVisit';

function ProfileWritingField({ label, value, onChange, maxLength }) {
  const id = React.useId();
  return <Form.Group controlId={id} className="mb-3"><Form.Label>{label}</Form.Label><Form.Control as="textarea" rows={2} maxLength={maxLength} value={value || ''} onChange={e => onChange(e.target.value)} /></Form.Group>;
}
export default function Profile() {
  const { currentUser, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [questionnaires, setQuestionnaires] = useState(null);
  const [questionnaireError, setQuestionnaireError] = useState('');
  const [profile, setProfile] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const refresh = () => setRetry(v => v + 1);
    window.addEventListener('transaction-saved', refresh);
    return () => window.removeEventListener('transaction-saved', refresh);
  }, []);
  useEffect(() => {
    let active = true;
    setData(null); setError('');
    getLearning().then(result => {
      if (!active) return;
      setData(result); setProfile({ ...result.profile, monthly_income: result.profile.monthly_income ?? '', income_day: result.profile.income_day ?? '' });
    }).catch(e => { if (active) setError(learningError(e)); });
    return () => { active = false; };
  }, [currentUser?.uid, retry]);
  useEffect(() => {
    let active = true;
    setQuestionnaires(null); setQuestionnaireError('');
    getQuestionnaires().then(result => { if (active) setQuestionnaires(result); })
      .catch(e => { if (active) setQuestionnaireError(learningError(e)); });
    return () => { active = false; };
  }, [currentUser?.uid, retry]);
  const run = async (action, message) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(message); window.dispatchEvent(new Event('learning-saved')); }
    catch (e) { setError(learningError(e)); }
    finally { setBusy(false); }
  };
  const handleLogout = async () => {
    setLeaving(true);
    setLogoutError('');
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (e) {
      setLogoutError('退出登录失败，请重试。');
      setLeaving(false);
    }
  };
  return <Container className="py-4 pb-5" style={{ maxWidth: 900 }}>
    <h1>我的</h1><p className="text-muted">账户与财务资料，统一在这里管理。</p>
    <div className="profile-hero" style={{ flexWrap: 'wrap' }}>
      <div className="profile-hero-avatar">{((currentUser?.displayName || currentUser?.email || '?')[0]).toUpperCase()}</div>
      <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
        <div className="profile-hero-name">{currentUser?.displayName || '我的账号'}</div>
        <div className="profile-hero-email">{currentUser?.email}</div>
      </div>
      <Button type="button" variant="outline-light" className="ms-auto flex-shrink-0" disabled={leaving} onClick={handleLogout}>
        {leaving ? '退出中…' : '退出登录'}
      </Button>
    </div>
    {logoutError && <Alert variant="danger" role="alert">{logoutError}</Alert>}
    <Card className="mb-4" id="questionnaire"><Card.Body className="p-4">
      <h2 className="h4">用户问卷</h2>
      <p className="text-muted small">新版 12 题与原有记录分开保存。之前填写的财务资料仍在本页下方，原有知识测验可从本卡片底部查看；两种结果不会合并成同一个分数。</p>
      {location.state?.questionnaireSaved && <Alert variant="success" role="status">问卷已保存到你的账户。</Alert>}
      {questionnaireError ? <Alert variant="warning">{questionnaireError}<Button variant="link" onClick={() => setRetry(v => v + 1)}>重试</Button></Alert>
        : !questionnaires ? <Spinner role="status" />
          : questionnaires.latest ? <>
            <p className="text-muted">最新填写于 {new Date(questionnaires.latest.created_at).toLocaleDateString('zh-CN')}。以下只反映你的问卷自述。</p>
            <div className="p-3 rounded mb-3" style={{ background: '#edf5eb' }}>
              <strong>可以先了解：{questionnaires.latest.summary.focus}</strong>
              <p className="mb-0 mt-1">{questionnaires.latest.summary.reason}</p>
            </div>
            <Row className="g-3 mb-3">{[['了解程度', 'knowledge'], ['回看开支', 'tracking'], ['应急准备', 'buffer']].map(([label, key]) =>
              <Col md={4} key={key}><div className="p-3 border rounded h-100"><small className="text-muted">{label}</small><p className="mb-0 mt-1">{questionnaires.latest.summary[key]}</p></div></Col>)}</Row>
            <details className="mb-3"><summary className="text-primary" style={{ cursor: 'pointer' }}>查看这次的 12 题回答</summary>
              <ol className="mt-3 ps-4">{questions.map(q => <li key={q.id} className="mb-2"><strong>{q.title}</strong><div className="text-muted">{q.options ? (q.options.find(([id]) => id === questionnaires.latest.answers[q.id])?.[1] || '暂未回答') : (questionnaires.latest.answers[q.id] == null ? '暂未回答' : `¥${Number(questionnaires.latest.answers[q.id]).toLocaleString('zh-CN')}`)}</div></li>)}</ol>
            </details>
            {questionnaires.history.length > 1 && <details className="mb-3"><summary className="text-primary" style={{ cursor: 'pointer' }}>查看过往问卷（{questionnaires.history.length - 1}）</summary><ul className="mt-3">{questionnaires.history.slice(1).map(item => <li key={item.id}>{new Date(item.created_at).toLocaleDateString('zh-CN')} · {item.summary.focus}</li>)}</ul></details>}
            <Button as={Link} to="/start" variant="outline-primary">重新填写问卷</Button>
          </> : <><p className="text-muted">你还没有保存新版问卷。回答后可先看简要结果，再保存到这里。</p><Button as={Link} to="/start" variant="primary">开始 12 题</Button></>}
      <div className="mt-3 small"><Link to="/assessment">查看原有知识测验</Link></div>
    </Card.Body></Card>
    <Card className="mb-4"><Card.Body className="p-4">
      <h2 className="h5">研究与隐私</h2>
      <p className="text-muted mb-3">你可以自主决定是否参与研究；学校研究功能按账户授权开放。</p>
      <div className="d-flex flex-wrap gap-2">
        <Button as={Link} to="/research/participation" variant="outline-primary">参与研究</Button>
        <Button as={Link} to="/research" variant="outline-secondary">学校研究</Button>
      </div>
    </Card.Body></Card>
    {error && <Alert variant="warning">{error}<Button variant="link" onClick={() => setRetry(v => v + 1)}>重新加载</Button></Alert>}
    {notice && <Alert variant="success" role="status">{notice}</Alert>}
    {!data ? !error && <Spinner role="status" /> : <Card><Card.Body className="p-4">
      <h2 className="h4">我的财务资料</h2><p className="text-muted">首次引导的信息已保留，修改后目标规划和消费试算自动使用新资料。</p>
      <Alert variant={data.profile.estimated_balance < 0 ? 'warning' : 'info'}>
        <strong>按记账估算的当前余额：{data.profile.estimated_balance == null ? '请先核对实际余额' : `¥${Number(data.profile.estimated_balance).toFixed(2)}`}</strong>
        {data.profile.current_balance != null && <div>上次核对余额：¥{Number(data.profile.current_balance).toFixed(2)}（{data.profile.balance_confirmed_on || '日期未记录'}）</div>}
        <div className="small">仅扣除核对后新增的已发生支出；预计收入未计入，漏记可能导致估算与实际不同。</div>
      </Alert>
      <Form onSubmit={e => { e.preventDefault(); run(async () => { const updates = Object.fromEntries(Object.entries(profile).filter(([key, value]) => String(value ?? '') !== String(data.profile[key] ?? ''))); delete updates.estimated_balance; const saved = await saveLearningProfile(updates); setData(previous => ({ ...previous, profile: saved })); setProfile({ ...saved, monthly_income: saved.monthly_income ?? '', income_day: saved.income_day ?? '' }); }, '资料已保存。'); }}>
        <Row>{[['current_balance', '核对实际余额'], ['essential_monthly', '每月必要生活开支'], ['emergency_buffer', '应急预留']].map(([key, label]) => <Col md={4} key={key}><Form.Group controlId={`finance-${key}`} className="mb-3"><Form.Label>{label}（元）</Form.Label><Form.Control type="number" min="0" max="100000000" step="0.01" value={profile[key] ?? ''} onChange={e => setProfile({ ...profile, [key]: e.target.value })} /></Form.Group></Col>)}</Row>
        <Row><Col md={6}><Form.Group controlId="learning-income" className="mb-3"><Form.Label>月收入或生活费（元，可暂不填写）</Form.Label><Form.Control type="number" min="0" max="100000000" step="0.01" value={profile.monthly_income} onChange={e => setProfile({ ...profile, monthly_income: e.target.value })} /></Form.Group></Col>
          <Col md={6}><Form.Group controlId="learning-income-day" className="mb-3"><Form.Label>通常每月几号到账（可选）</Form.Label><Form.Control type="number" min="1" max="31" step="1" value={profile.income_day} onChange={e => setProfile({ ...profile, income_day: e.target.value })} /></Form.Group></Col></Row>
        <Form.Group controlId="learning-timezone" className="mb-3"><Form.Label>每日节目按哪个时区更新</Form.Label><Form.Select value={profile.timezone || 'Asia/Shanghai'} onChange={e => setProfile({ ...profile, timezone: e.target.value })}><option value="Asia/Shanghai">北京时间</option><option value="Asia/Hong_Kong">香港时间</option><option value="Asia/Taipei">台北时间</option><option value="Europe/London">伦敦时间</option><option value="America/Los_Angeles">洛杉矶时间</option><option value="UTC">世界协调时</option></Form.Select></Form.Group>
        <Form.Group controlId="learning-topic" className="mb-3"><Form.Label>我想先练习</Form.Label><Form.Select value={profile.topic} onChange={e => setProfile({ ...profile, topic: e.target.value })}>{data.topics.map(t => <option value={t.id} key={t.id}>{t.title}：{t.description}</option>)}</Form.Select></Form.Group>
        <p className="text-muted small">你记下的近期消费会直接用于选择更贴近你的学习情境；记录不足时，仍可根据目标和练习回答继续学习。消费金额不用于判断财商水平，也不会因此共享给学校。</p>
        <ProfileWritingField label="我的自定规则（可选，例如：临时大额消费先考虑一天，紧急需要除外）" value={profile.personal_rule} onChange={v => setProfile({ ...profile, personal_rule: v })} required={false} maxLength={300} />
        <Button variant="outline-primary" className="me-2" disabled={busy || profile.current_balance === '' || profile.current_balance == null} onClick={() => run(async () => { const saved = await saveLearningProfile({ current_balance: profile.current_balance }); setData(previous => ({ ...previous, profile: saved })); setProfile({ ...saved, monthly_income: saved.monthly_income ?? '', income_day: saved.income_day ?? '' }); }, '实际余额已核对。')}>确认实际余额</Button>
        <Button type="submit" disabled={busy}>{busy ? '保存中…' : '保存资料'}</Button> <Button as={Link} to="/dashboard?tab=goals" variant="outline-secondary">查看储蓄目标</Button>
      </Form>
    </Card.Body></Card>}
  </Container>;
}

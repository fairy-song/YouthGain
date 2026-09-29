import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Col, Container, Form, Row, Spinner } from 'react-bootstrap';
import { useAuth } from '../contexts/AuthContext';
import { getLearning, saveLearningProfile, learningError } from '../services/learning';

function ProfileWritingField({ label, value, onChange, maxLength }) {
  const id = React.useId();
  return <Form.Group controlId={id} className="mb-3"><Form.Label>{label}</Form.Label><Form.Control as="textarea" rows={2} maxLength={maxLength} value={value || ''} onChange={e => onChange(e.target.value)} /></Form.Group>;
}
export default function Profile() {
  const { currentUser } = useAuth();
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setError('');
    getLearning().then(result => {
      if (!active) return;
      setData(result); setProfile({ ...result.profile, monthly_income: result.profile.monthly_income ?? '', income_day: result.profile.income_day ?? '' });
    }).catch(e => { if (active) setError(learningError(e)); });
    return () => { active = false; };
  }, [currentUser?.uid, retry]);
  const run = async (action, message) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(message); window.dispatchEvent(new Event('learning-saved')); }
    catch (e) { setError(learningError(e)); }
    finally { setBusy(false); }
  };
  return <Container className="py-4 pb-5" style={{ maxWidth: 900 }}>
    <h1>我的</h1><p className="text-muted">账户与财务资料，统一在这里管理。</p>
    <Card className="mb-4"><Card.Body><strong>{currentUser?.displayName || '我的账号'}</strong><div className="text-muted">{currentUser?.email}</div></Card.Body></Card>
    {error && <Alert variant="warning">{error}<Button variant="link" onClick={() => setRetry(v => v + 1)}>重新加载</Button></Alert>}
    {notice && <Alert variant="success" role="status">{notice}</Alert>}
    {!data ? !error && <Spinner role="status" /> : <Card><Card.Body className="p-4">
      <h2 className="h4">我的财务资料</h2><p className="text-muted">首次引导的信息已保留，修改后目标规划和消费试算自动使用新资料。</p>
      <Form onSubmit={e => { e.preventDefault(); run(async () => { const updates = Object.fromEntries(Object.entries(profile).filter(([key, value]) => String(value ?? '') !== String(data.profile[key] ?? ''))); const saved = await saveLearningProfile(updates); setData(previous => ({ ...previous, profile: saved })); setProfile({ ...saved, monthly_income: saved.monthly_income ?? '', income_day: saved.income_day ?? '' }); }, '资料已保存。'); }}>
        <Row>{[['current_balance', '核对当前余额'], ['essential_monthly', '每月必要生活开支'], ['emergency_buffer', '应急预留']].map(([key, label]) => <Col md={4} key={key}><Form.Group controlId={`finance-${key}`} className="mb-3"><Form.Label>{label}（元）</Form.Label><Form.Control type="number" min="0" max="100000000" step="0.01" value={profile[key] ?? ''} onChange={e => setProfile({ ...profile, [key]: e.target.value })} /></Form.Group></Col>)}</Row>
        <Row><Col md={6}><Form.Group controlId="learning-income" className="mb-3"><Form.Label>月收入或生活费（元，可暂不填写）</Form.Label><Form.Control type="number" min="0" max="100000000" step="0.01" value={profile.monthly_income} onChange={e => setProfile({ ...profile, monthly_income: e.target.value })} /></Form.Group></Col>
          <Col md={6}><Form.Group controlId="learning-income-day" className="mb-3"><Form.Label>通常每月几号到账（可选）</Form.Label><Form.Control type="number" min="1" max="31" step="1" value={profile.income_day} onChange={e => setProfile({ ...profile, income_day: e.target.value })} /></Form.Group></Col></Row>
        <Form.Group controlId="learning-topic" className="mb-3"><Form.Label>我想先练习</Form.Label><Form.Select value={profile.topic} onChange={e => setProfile({ ...profile, topic: e.target.value })}>{data.topics.map(t => <option value={t.id} key={t.id}>{t.title}：{t.description}</option>)}</Form.Select></Form.Group>
        <ProfileWritingField label="我的自定规则（可选，例如：临时大额消费先考虑一天，紧急需要除外）" value={profile.personal_rule} onChange={v => setProfile({ ...profile, personal_rule: v })} required={false} maxLength={300} />
        <Button type="submit" disabled={busy}>{busy ? '保存中…' : '保存资料'}</Button> <Button as={Link} to="/dashboard?tab=goals" variant="outline-secondary">查看储蓄目标</Button>
      </Form>
    </Card.Body></Card>}
  </Container>;
}

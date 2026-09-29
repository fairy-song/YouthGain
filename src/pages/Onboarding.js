import React, { useState } from 'react';
import { Alert, Button, Card, Form, ProgressBar } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { saveLearningProfile, learningError } from '../services/learning';

const questions = [
  { key: 'current_balance', title: '现在手上有多少钱可以安排？', hint: '填现金、微信和支付宝里现在能用的钱。', type: 'number', placeholder: '例如 2000' },
  { key: 'income_sources', title: '你的钱通常从哪里来？', hint: '可以多选。没有固定收入也没关系。', type: 'choices', choices: [['生活费', 'allowance'], ['兼职', 'part_time'], ['奖学金', 'scholarship'], ['其他', 'other']] },
  { key: 'monthly_income', title: '每月大约能收到多少钱？', hint: '不确定可以填一个保守估计。', type: 'number', placeholder: '例如 2000' },
  { key: 'income_day', title: '通常什么时候到账？', hint: '只记得大概日期也可以。', type: 'number', placeholder: '例如 1', min: 1, max: 31 },
  { key: 'essential_monthly', title: '每月必须留出的开支大约多少？', hint: '比如吃饭、住宿、交通和还款。', type: 'number', placeholder: '例如 1200' },
  { key: 'emergency_buffer', title: '想留多少应急钱？', hint: '没有也可以填 0，之后还能调整。', type: 'number', placeholder: '例如 300' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [step, setStep] = useState(0); const [form, setForm] = useState({ income_sources: [] });
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const question = questions[step];
  const value = form[question.key] ?? '';
  const setValue = v => setForm(f => ({ ...f, [question.key]: v }));
  const next = async () => {
    setError('');
    if (question.type === 'number' && (value === '' || Number(value) < (question.min || 0))) { setError('请填一个有效数字，之后也可以修改。'); return; }
    if (step < questions.length - 1) { setStep(s => s + 1); return; }
    setSaving(true);
    try {
      await saveLearningProfile({ ...form, onboarding_complete: true, topic: 'budget', personal_rule: '' });
      if (currentUser?.email) localStorage.setItem(`onboarding_complete:${currentUser.email.toLowerCase()}`, 'true');
      navigate('/dashboard', { replace: true });
    }
    catch (e) { setError(learningError(e)); setSaving(false); }
  };
  return <main className="min-vh-100 d-flex align-items-center justify-content-center bg-light p-3">
    <Card className="border-0 shadow-sm rounded-4" style={{ maxWidth: 520, width: '100%' }}><Card.Body className="p-4 p-md-5">
      <div className="small text-muted mb-2">认识你的钱 · {step + 1}/{questions.length}</div><ProgressBar now={(step + 1) / questions.length * 100} className="mb-4" />
      <h1 className="h3 mb-2">{question.title}</h1><p className="text-muted">{question.hint}</p>
      {question.type === 'choices' ? <div className="d-grid gap-2">{question.choices.map(([label, key]) => <Button key={key} variant={value.includes(key) ? 'primary' : 'outline-secondary'} className="text-start" onClick={() => setValue(value.includes(key) ? value.filter(x => x !== key) : [...value, key])}>{value.includes(key) ? '✓ ' : ''}{label}</Button>)}</div> : <Form.Control autoFocus type="number" min={question.min} max={question.max} step="0.01" placeholder={question.placeholder} value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') next(); }} />}
      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
      <div className="d-flex justify-content-between mt-4"><Button variant="link" disabled={step === 0 || saving} onClick={() => setStep(s => s - 1)}>上一步</Button><Button onClick={next} disabled={saving}>{saving ? '保存中…' : step === questions.length - 1 ? '进入我的主页' : '下一步'}</Button></div>
    </Card.Body></Card>
  </main>;
}

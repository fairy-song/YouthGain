import React, { useState } from 'react';
import { Row, Col, Card, Form, Alert, Button, Badge, ProgressBar } from 'react-bootstrap';
import { FaWallet, FaCoins } from 'react-icons/fa';
import GoalCashflow, { GoalReserveHint } from '../GoalCashflow';
import { createGoal, updateGoal } from '../../services/api';

const BUCKETS = [
  { key: '应急储蓄', desc: '突发情况安全垫', color: '#2F7D5F' },
  { key: '医疗储蓄', desc: '看病体检买药', color: '#C0392B' },
  { key: '学习储蓄', desc: '考证课程书籍', color: '#2980B9' },
  { key: '旅行储蓄', desc: '假期出行回家', color: '#8E44AD' },
  { key: '数码产品', desc: '手机电脑耳机', color: '#D35400' },
  { key: '长期储蓄', desc: '毕业大额支出', color: '#B7950B' },
];

function BucketSwitcher({ goals, onSaved }) {
  const [active, setActive] = useState(0);
  const bucket = BUCKETS[active];
  const goal = goals.find(g => g.title === bucket.key);
  const [target, setTarget] = useState(goal?.target_amount || '');
  const [current, setCurrent] = useState(goal?.current_amount || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const switchTo = (i) => {
    const b = BUCKETS[i];
    const g = goals.find(x => x.title === b.key);
    setActive(i);
    setTarget(g?.target_amount || '');
    setCurrent(g?.current_amount || '');
    setErr('');
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const payload = { title: bucket.key, target_amount: Number(target), current_amount: Number(current || 0), deadline: new Date(new Date().setFullYear(new Date().getFullYear() + 2)).toISOString().slice(0, 10) };
      if (goal?.id) await updateGoal(goal.id, payload);
      else await createGoal(payload);
      onSaved();
    } catch (e) { setErr(e?.response?.data?.message || '保存失败'); }
    finally { setBusy(false); }
  };

  const t = Number(target) || 0;
  const c = Number(current) || 0;
  const pct = t > 0 ? Math.min(100, Math.round(c / t * 100)) : 0;

  return <Card className="border-0 shadow-sm mb-4" style={{ borderTop: `3px solid ${bucket.color}` }}>
    <Card.Body>
      <div className="d-flex flex-wrap gap-1 mb-3">
        {BUCKETS.map((b, i) => <Button key={b.key} size="sm" variant={i === active ? 'primary' : 'outline-secondary'} onClick={() => switchTo(i)} style={i === active ? { background: b.color, borderColor: b.color } : {}}>{b.key}</Button>)}
      </div>
      <strong style={{ color: bucket.color }}>{bucket.key}</strong>
      <div className="text-muted small mb-3">{bucket.desc}</div>
      <Form onSubmit={save}>
        <Row className="g-2">
          <Col md={4}><Form.Label className="small mb-0 text-muted">目标金额</Form.Label><Form.Control size="sm" type="number" min="0" step="0.01" value={target} onChange={e => setTarget(e.target.value)} placeholder="0.00" /></Col>
          <Col md={4}><Form.Label className="small mb-0 text-muted">已存金额</Form.Label><Form.Control size="sm" type="number" min="0" step="0.01" value={current} onChange={e => setCurrent(e.target.value)} placeholder="0.00" /></Col>
          <Col md={4} className="d-flex align-items-end"><Button size="sm" type="submit" className="w-100" disabled={busy} style={{background: bucket.color, borderColor: bucket.color}}>{busy?'保存中…':'保存'}</Button></Col>
        </Row>
        {t > 0 && <div className="mt-2"><ProgressBar now={pct} style={{height:6}} /><div className="d-flex justify-content-between small text-muted mt-1"><span>已存 ¥{c.toFixed(2)}</span><span>目标 ¥{t.toFixed(2)}</span><span>{pct}%</span></div></div>}
        {err && <div className="text-danger small mt-1">{err}</div>}
      </Form>
    </Card.Body>
  </Card>;
}

export default function LedgerGoals({ goals, goalForm, setGoalForm, goalError, savingGoal, handleGoalCreate, handleGoalDelete, handleGoalPaid, handleGoalEdit, goalPlanResult, setGoalPlanResult, currentUser, onRefresh }) {
  return <>
    {/* 储蓄分类切换 */}
    <BucketSwitcher goals={goals} onSaved={onRefresh} />

    {/* 自定义目标 */}
        <Row className="g-4 mb-5">
          <Col md={5}>
            <Card className="h-100 border-0 rounded-4 shadow-sm dashboard-card">
              <Card.Body className="p-4">
                <div className="d-flex align-items-center mb-3">
                  <div className="icon-container bg-warning-light rounded-circle d-flex align-items-center justify-content-center me-3">
                    <FaWallet className="text-warning" />
                  </div>
                  <h5 className="card-title mb-0">设定其他储蓄目标</h5>
                </div>
                <Form onSubmit={handleGoalCreate}>
                  <Form.Group className="mb-3">
                    <Form.Label className="small text-muted">目标名称</Form.Label>
                    <Form.Control type="text" placeholder="例如：换新手机" value={goalForm.title} onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} />
                  </Form.Group>
                  <Row>
                    <Col>
                      <Form.Group className="mb-3">
                        <Form.Label className="small text-muted">目标金额（元）</Form.Label>
                        <Form.Control type="number" min="0" step="0.01" placeholder="8000" value={goalForm.target_amount} onChange={(e) => setGoalForm({ ...goalForm, target_amount: e.target.value })} />
                      </Form.Group>
                    </Col>
                    <Col>
                      <details><summary className="small">已留过钱？（选填）</summary><Form.Group className="mb-3">
                        <Form.Label className="small text-muted">已存金额（元）</Form.Label>
                        <Form.Control type="number" min="0" step="0.01" placeholder="0" value={goalForm.current_amount} onChange={(e) => setGoalForm({ ...goalForm, current_amount: e.target.value })} />
                      </Form.Group></details>
                    </Col>
                  </Row>
                  <Form.Group className="mb-3">
                    <Form.Label className="small text-muted">付款截止日</Form.Label>
                    <Form.Control type="date" required value={goalForm.deadline} onChange={(e) => setGoalForm({ ...goalForm, deadline: e.target.value })} />
                  </Form.Group>
                  {goalError && <Alert variant="danger" className="small py-2">{goalError}</Alert>}
                  <Button type="submit" variant="warning" className="rounded-pill px-4" disabled={savingGoal}>
                    {savingGoal ? '保存中…' : '创建目标'}
                  </Button>
                </Form>
              </Card.Body>
            </Card>
          </Col>
          <Col md={7}>
            <Card className="h-100 border-0 rounded-4 shadow-sm dashboard-card">
              <Card.Body className="p-4">
                <div className="d-flex align-items-center mb-3">
                  <div className="icon-container bg-warning-light rounded-circle d-flex align-items-center justify-content-center me-3">
                    <FaCoins className="text-warning" />
                  </div>
                  <h5 className="card-title mb-0">我的目标</h5>
                </div>
                <GoalCashflow key={currentUser?.uid} goals={goals} onResult={setGoalPlanResult} />
                {goals.length === 0 ? (
                  <p className="text-muted mb-0">还没有设定目标。填写目标预算和付款截止日。</p>
                ) : (
                  <div className="d-flex flex-column gap-3">
                    {goals.filter(g => !BUCKETS.find(b => b.key === g.title)).map((g) => {
                      const target = Number(g.target_amount) || 0;
                      const current = Number(g.current_amount) || 0;
                      const progress = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
                      const statusLabel = g.status === 'active' ? '进行中' : g.status === 'completed' ? '已完成' : '已取消';
                      return (
                        <div key={g.id} className="border rounded-3 p-3">
                          <div className="d-flex align-items-center justify-content-between mb-2">
                            <strong>{g.title}</strong>
                            <div className="d-flex align-items-center gap-2">
                              <Badge pill bg={g.status === 'active' ? 'warning' : 'success'} text={g.status === 'active' ? 'dark' : 'white'}>{statusLabel}</Badge>
                              <Button size="sm" variant="outline-danger" onClick={() => handleGoalDelete(g.id)}>删除</Button>
                              {g.status === 'active' && <Button size="sm" variant="outline-success" onClick={() => handleGoalPaid(g.id)}>结束目标</Button>}
                            </div>
                          </div>
                          <GoalReserveHint goal={g} result={goalPlanResult} />
                          <ProgressBar now={progress} variant="warning" className="mb-2" />
                          <div className="d-flex justify-content-between text-muted small">
                            <span>已存 ¥{current.toLocaleString()} / ¥{target.toLocaleString()}</span><span>{progress}%</span>
                          </div>
                          {g.deadline && <div className="text-muted small mt-1">付款截止：{g.deadline}</div>}
                          {g.status === 'active' && <details className="mt-2"><summary className="small">调整目标</summary><Form className="mt-2" onSubmit={e => handleGoalEdit(e, g.id)}>
                            <Form.Label className="small">更新锁定金额</Form.Label>
                            <Form.Control name="current_amount" type="number" min="0" step="0.01" required defaultValue={current} />
                            <Form.Label className="small mt-2">截止日</Form.Label>
                            <Form.Control name="deadline" type="date" required defaultValue={String(g.deadline || '').slice(0, 10)} />
                            <Button type="submit" variant="outline-primary" size="sm" className="mt-2">保存</Button>
                          </Form></details>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
</>; }

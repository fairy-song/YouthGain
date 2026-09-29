import React from 'react';
import { Row, Col, Card, Form, Alert, Button, Badge, ProgressBar } from 'react-bootstrap';
import { FaWallet, FaCoins } from 'react-icons/fa';
import GoalCashflow, { GoalReserveHint } from '../GoalCashflow';
export default function LedgerGoals({ goals, goalForm, setGoalForm, goalError, savingGoal, handleGoalCreate, handleGoalDelete, handleGoalPaid, handleGoalEdit, goalPlanResult, setGoalPlanResult, currentUser }) { return <>
        {/* 储蓄目标管理 —— 设定目标，让每笔消费都有参照 */}
        <Row className="g-4 mb-5">
          <Col md={5}>
            <Card className="h-100 border-0 rounded-4 shadow-sm dashboard-card">
              <Card.Body className="p-4">
                <div className="d-flex align-items-center mb-3">
                  <div className="icon-container bg-warning-light rounded-circle d-flex align-items-center justify-content-center me-3">
                    <FaWallet className="text-warning" />
                  </div>
                  <h5 className="card-title mb-0">设定储蓄目标</h5>
                </div>
                <Form onSubmit={handleGoalCreate}>
                  <Form.Group className="mb-3">
                    <Form.Label className="small text-muted">目标名称</Form.Label>
                    <Form.Control
                      type="text"
                      placeholder="例如：换新手机"
                      value={goalForm.title}
                      onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
                    />
                  </Form.Group>
                  <Row>
                    <Col>
                      <Form.Group className="mb-3">
                        <Form.Label className="small text-muted">目标金额（元）</Form.Label>
                        <Form.Control
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="8000"
                          value={goalForm.target_amount}
                          onChange={(e) => setGoalForm({ ...goalForm, target_amount: e.target.value })}
                        />
                      </Form.Group>
                    </Col>
                    <Col>
                      <details><summary className="small">已留过钱？（选填）</summary><Form.Group className="mb-3">
                        <Form.Label className="small text-muted">已存金额（元）</Form.Label>
                        <Form.Control
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          value={goalForm.current_amount}
                          onChange={(e) => setGoalForm({ ...goalForm, current_amount: e.target.value })}
                        />
                      </Form.Group></details>
                    </Col>
                  </Row>
                  <Form.Group className="mb-3">
                    <Form.Label className="small text-muted">付款截止日（如买票截止日，而非演出日）</Form.Label>
                    <Form.Control
                      type="date"
                      required
                      value={goalForm.deadline}
                      onChange={(e) => setGoalForm({ ...goalForm, deadline: e.target.value })}
                    />
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
                  <p className="text-muted mb-0">
                    还没有设定目标。填写目标预算和付款截止日，再通过资金安排查看现在需要预留多少钱。
                  </p>
                ) : (
                  <div className="d-flex flex-column gap-3">
                    {goals.map((g) => {
                      const target = Number(g.target_amount) || 0;
                      const current = Number(g.current_amount) || 0;
                      const progress = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
                      const statusLabel = g.status === 'active' ? '进行中' : g.status === 'completed' ? '已完成' : '已取消';
                      return (
                        <div key={g.id} className="border rounded-3 p-3">
                          <div className="d-flex align-items-center justify-content-between mb-2">
                            <strong>{g.title}</strong>
                            <div className="d-flex align-items-center gap-2">
                              <Badge pill bg={g.status === 'active' ? 'warning' : 'success'} text={g.status === 'active' ? 'dark' : 'white'}>
                                {statusLabel}
                              </Badge>
                              <Button size="sm" variant="outline-danger" onClick={() => handleGoalDelete(g.id)}>
                                删除
                              </Button>
                              {g.status === 'active' && <Button size="sm" variant="outline-success" onClick={() => handleGoalPaid(g.id)}>已付款，结束预留</Button>}
                            </div>
                          </div>
                          <GoalReserveHint goal={g} result={goalPlanResult} />
                          <ProgressBar now={progress} variant="warning" className="mb-2" />
                          <div className="d-flex justify-content-between text-muted small">
                            <span>已存 ¥{current.toLocaleString()} / ¥{target.toLocaleString()}</span>
                            <span>{progress}%</span>
                          </div>
                          {g.deadline && <div className="text-muted small mt-1">付款截止：{g.deadline}</div>}
                          {g.status === 'active' && <details className="mt-2"><summary className="small">调整目标</summary><Form className="mt-2" onSubmit={e => handleGoalEdit(e, g.id)}>
                            <Form.Label htmlFor={`reserve-${g.id}`} className="small">更新实际已预留金额（含在账户总余额中，不是新增消费）</Form.Label>
                            <Form.Control id={`reserve-${g.id}`} name="current_amount" type="number" min="0" step="0.01" required defaultValue={current} />
                            <Form.Label htmlFor={`deadline-${g.id}`} className="small mt-2">调整付款截止日</Form.Label>
                            <Form.Control id={`deadline-${g.id}`} name="deadline" type="date" required defaultValue={String(g.deadline || '').slice(0, 10)} />
                            <Button type="submit" variant="outline-primary" size="sm" className="mt-2">保存预留与日期</Button>
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

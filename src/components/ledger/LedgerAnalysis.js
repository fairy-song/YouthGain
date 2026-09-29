import React from 'react';
import { Row, Col, Card, ProgressBar } from 'react-bootstrap';
import { FaWallet, FaChartLine, FaPiggyBank, FaLightbulb, FaExclamationTriangle } from 'react-icons/fa';
export default function LedgerAnalysis({ surplus, income, avgSpending, spending, discretionary, goal, patterns }) { return <>
        <Row className="g-4 mb-5">
          <Col md={4}>
            <Card className="h-100 border-0 rounded-4 shadow-sm dashboard-card">
              <Card.Body className="p-4">
                <div className="d-flex align-items-center mb-3">
                  <div className="icon-container bg-primary-light rounded-circle d-flex align-items-center justify-content-center me-3">
                    <FaChartLine className="text-primary" />
                  </div>
                  <h5 className="card-title mb-0">月结余</h5>
                </div>
                <h2 className={`fw-bold mb-3 ${surplus >= 0 ? 'text-success' : 'text-danger'}`}>
                  ¥{surplus.toLocaleString()}
                </h2>
                <div className="d-flex justify-content-between mb-1">
                  <span className="text-muted">月收入</span>
                  <span className="fw-medium">¥{income.toLocaleString()}</span>
                </div>
                <div className="d-flex justify-content-between">
                  <span className="text-muted">月均支出</span>
                  <span className="fw-medium">¥{Math.round(avgSpending).toLocaleString()}</span>
                </div>
                <div className="mt-3 pt-3 border-top">
                  <span className={`badge rounded-pill px-3 py-2 ${surplus > 0 ? 'bg-success-light text-success' : 'bg-danger-light text-danger'}`}>
                    {surplus > 0 ? '每月还能存下钱' : '支出已超过收入'}
                  </span>
                </div>
              </Card.Body>
            </Card>
          </Col>
          
          <Col md={4}>
            <Card className="h-100 border-0 rounded-4 shadow-sm dashboard-card">
              <Card.Body className="p-4">
                <div className="d-flex align-items-center mb-3">
                  <div className="icon-container bg-info-light rounded-circle d-flex align-items-center justify-content-center me-3">
                    <FaPiggyBank className="text-info" />
                  </div>
                  <h5 className="card-title mb-0">支出结构</h5>
                </div>
                {spending ? (
                  <>
                    <div className="progress-container mb-3">
                      <ProgressBar className="progress-bar-thick">
                        <ProgressBar
                          now={spending.total > 0 ? (spending.fixed_total / spending.total) * 100 : 0}
                          variant="secondary"
                        />
                        <ProgressBar
                          now={spending.total > 0 ? (spending.variable_total / spending.total) * 100 : 0}
                          variant="info"
                        />
                      </ProgressBar>
                    </div>
                    <div className="d-flex justify-content-between mb-1">
                      <span className="text-muted">改不了（固定）</span>
                      <span className="fw-medium">¥{Math.round(spending.fixed_total).toLocaleString()}</span>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span className="text-muted">能调整（变动）</span>
                      <span className="fw-bold text-info">¥{Math.round(spending.variable_total).toLocaleString()}</span>
                    </div>
                    <div className="mt-3 pt-3 border-top">
                      <span className="text-muted small">
                        你真正有决定权的钱：¥{Math.round(discretionary).toLocaleString()}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-muted mb-0">记录几笔消费后，这里会显示你的支出结构。</p>
                )}
              </Card.Body>
            </Card>
          </Col>
          
          <Col md={4}>
            <Card className="h-100 border-0 rounded-4 shadow-sm dashboard-card">
              <Card.Body className="p-4">
                <div className="d-flex align-items-center mb-3">
                  <div className="icon-container bg-warning-light rounded-circle d-flex align-items-center justify-content-center me-3">
                    <FaWallet className="text-warning" />
                  </div>
                  <h5 className="card-title mb-0">储蓄目标</h5>
                </div>
                {goal ? (
                  <>
                    <h4 className="fw-bold mb-3">{goal.goal_name}</h4>
                    <div className="d-flex justify-content-between mb-1">
                      <span className="text-muted">还差</span>
                      <span className="fw-medium">¥{Math.round(goal.remaining).toLocaleString()}</span>
                    </div>
                    <div className="d-flex justify-content-between mb-1">
                      <span className="text-muted">按当前结余需要</span>
                      <span className="fw-medium">
                        {goal.months_needed != null ? `${goal.months_needed} 个月` : '无法达成'}
                      </span>
                    </div>
                    <div className="mt-3 pt-3 border-top">
                      <span className={`badge rounded-pill px-3 py-2 ${
                        ['可达', '已达成'].includes(goal.status)
                          ? 'bg-success-light text-success'
                          : 'bg-warning-light text-warning'
                      }`}>
                        {goal.status}
                      </span>
                      {goal.shortfall > 0 && (
                        <span className="text-muted small ms-2">
                          每月还差 ¥{Math.round(goal.shortfall).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-muted mb-0">还没有设定储蓄目标。</p>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>

        <Row className="g-4 mb-5">
          <Col md={12}>
            <Card className="h-100 border-0 rounded-4 shadow-sm dashboard-card">
              <Card.Body className="p-4">
                <div className="d-flex align-items-center mb-3">
                  <div className="icon-container bg-success-light rounded-circle d-flex align-items-center justify-content-center me-3">
                    <FaLightbulb className="text-success" />
                  </div>
                  <h5 className="card-title mb-0">你注意不到的模式</h5>
                </div>
                {patterns.length === 0 ? (
                  <p className="text-muted mb-0">
                    数据还不够多，或者你的消费习惯相当稳定——目前没有发现值得提醒的模式。
                  </p>
                ) : (
                  patterns.slice(0, 3).map((p, index, arr) => (
                    <div
                      key={p.kind}
                      className={index === arr.length - 1 ? '' : 'mb-3 pb-3 border-bottom'}
                    >
                      <div className="d-flex align-items-center mb-1">
                        {p.severity === 'warning' && (
                          <FaExclamationTriangle className="text-warning me-2" size={14} />
                        )}
                        <strong>{p.title}</strong>
                      </div>
                      <p className="text-muted small mb-0">{p.detail}</p>
                    </div>
                  ))
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>


</>; }

import React from 'react';
import { Row, Col, Card, ProgressBar } from 'react-bootstrap';
import { FaWallet, FaChartLine, FaPiggyBank, FaLightbulb, FaExclamationTriangle } from 'react-icons/fa';
export default function LedgerAnalysis({ surplus, income, avgSpending, spending, discretionary, goal, patterns, pca }) { return <>
        <Row className="g-4 mb-5">
          <Col md={4}>
            <Card className="h-100 border-0 rounded-4 shadow-sm dashboard-card">
              <Card.Body className="p-4">
                <div className="d-flex align-items-center mb-3">
                  <div className="icon-container bg-primary-light rounded-circle d-flex align-items-center justify-content-center me-3">
                    <FaChartLine className="text-primary" />
                  </div>
                  <h5 className="card-title mb-0">月均结余估算</h5>
                </div>
                <h2 className={`fw-bold mb-3 ${surplus >= 0 ? 'text-success' : 'text-danger'}`}>
                  ¥{surplus.toLocaleString()}
                </h2><p className="small text-muted">月收入减去记录区间的月均支出；不是账户余额，也不是本月预算剩余。漏记会影响估算。</p>
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
                    {surplus > 0 ? '按记录估算有结余' : '按记录估算结余不足'}
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
        {pca && <Card className="border-0 rounded-4 shadow-sm mb-5">
          <Card.Body className="p-4">
            <h5>消费模式探索</h5>
            <p className="text-muted small">{pca.message}</p>
            {pca.status === 'ready' && <>
              <p className="small">{pca.start} 至 {pca.end} · 保留约 {(pca.retained_variance_ratio * 100).toFixed(1)}% 的指标变化信息</p>
              {pca.components.map(component => <div key={component.id} className="mb-3">
                <strong>{component.title}</strong>
                <p className="small text-muted mb-1">{component.detail}</p>
                <ProgressBar now={component.explained_variance_ratio * 100}
                  aria-label={`${component.title}解释的变化比例`}
                  label={`${(component.explained_variance_ratio * 100).toFixed(1)}%`} />
              </div>)}
              <details className="small mb-3">
                <summary>查看计算依据</summary>
                <p className="mt-2">各指标先标准化，再通过主成分分析（PCA）提取共同变化方向。最多展示 3 个方向，目标保留 80% 的变化信息；达不到时仍显示实际比例。解释比例不是准确率。</p>
                {pca.components.map(component => <div key={component.id}>
                  <strong>{component.title}</strong>
                  <ul>{component.contributions.map(f => <li key={f.feature}>
                    {f.label}：贡献 {(f.contribution * 100).toFixed(1)}%，{f.loading >= 0 ? '同向' : '反向'}
                  </li>)}</ul>
                </div>)}
                {pca.excluded_features?.length > 0 && <p>未参与计算的无变化指标：{pca.excluded_features.join('、')}</p>}
              </details>
            </>}
            <p className="text-muted small mb-0">{pca.limitation}</p>
          </Card.Body>
        </Card>}
</>; }

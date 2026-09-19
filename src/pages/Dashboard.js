import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Container, Row, Col, Card, Button, Badge, ProgressBar, Form, Spinner, Alert } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaChartLine, FaPiggyBank, FaWallet, FaExchangeAlt, FaRobot, FaCoins, FaChartPie, FaMoneyBillWave, FaLightbulb, FaExclamationTriangle, FaCalculator } from 'react-icons/fa';
import 'bootstrap/dist/css/bootstrap.min.css';
import { getDecisionReport, listTransactions, getOpportunityCost } from '../services/api';

// 增强型徽章组件
const EnhancedBadge = ({ children, bg, className = '' }) => {
  return (
    <Badge 
      bg={bg} 
      className={`custom-badge px-3 py-2 rounded-pill fw-normal position-relative overflow-hidden ${className}`}
    >
      <span className="badge-content position-relative">{children}</span>
      <span className="badge-glow"></span>
    </Badge>
  );
};

// 月收入默认值。
// TODO: 月收入应作为用户档案的一部分持久化，目前由前端写死传入后端。
const DEFAULT_MONTHLY_INCOME = 2000;

const Dashboard = () => {
  const { currentUser } = useAuth();

  const [report, setReport] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 机会成本试算
  const [costAmount, setCostAmount] = useState('');
  const [costResult, setCostResult] = useState(null);
  const [costError, setCostError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        // 报告与流水并发拉取，两者互不依赖
        const [reportData, txnData] = await Promise.all([
          getDecisionReport({ monthlyIncome: DEFAULT_MONTHLY_INCOME }),
          listTransactions(20),
        ]);
        if (cancelled) return;
        setReport(reportData);
        setTransactions(txnData.transactions || []);
      } catch (e) {
        if (cancelled) return;
        setError(e?.response?.data?.message || e?.message || '加载数据失败，请确认后端服务已启动');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  // 试算机会成本——回答"这笔钱花了会怎样"
  const handleCostCheck = async (event) => {
    event.preventDefault();
    setCostError('');
    setCostResult(null);

    const amount = parseFloat(costAmount);
    if (isNaN(amount) || amount <= 0) {
      setCostError('请输入大于 0 的金额');
      return;
    }

    try {
      const result = await getOpportunityCost(amount, DEFAULT_MONTHLY_INCOME);
      setCostResult(result);
    } catch (e) {
      // 用户入不敷出时后端返回 409，把原因原样告诉用户，
      // 而不是显示"计算失败"这种没有信息量的提示。
      setCostError(e?.response?.data?.message || e?.message || '计算失败');
    }
  };

  // 派生展示值——集中算好，避免可选链散落在 JSX 里
  const reportData = report?.has_data ? report.report : null;
  const surplus = reportData?.monthly_surplus ?? 0;
  const income = reportData?.monthly_income ?? DEFAULT_MONTHLY_INCOME;
  const avgSpending = reportData ? Math.max(0, income - surplus) : 0;
  const spending = reportData?.spending ?? null;
  const patterns = reportData?.patterns ?? [];
  const goal = reportData?.goal_feasibility?.[0] ?? null;
  const discretionary = spending ? income - spending.fixed_total : 0;

  if (loading) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <Spinner animation="border" variant="primary" />
        <p className="text-muted mt-3">正在分析你的消费数据…</p>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      {/* 背景动态元素 */}
      <div className="animated-background">
        <div className="floating-shape shape1"></div>
        <div className="floating-shape shape2"></div>
        <div className="floating-shape shape3"></div>
        
        {/* 金融相关元素 */}
        <div className="finance-icon finance-icon-1">
          <FaCoins size={24} color="rgba(78, 115, 223, 0.15)" />
        </div>
        <div className="finance-icon finance-icon-2">
          <FaChartPie size={36} color="rgba(72, 187, 120, 0.15)" />
        </div>
        <div className="finance-icon finance-icon-3">
          <FaMoneyBillWave size={32} color="rgba(255, 193, 7, 0.15)" />
        </div>
      </div>

      <Container className="py-5">
        <Row className="justify-content-center mb-4">
          <Col md={10}>
            <div className="mb-4">
              <EnhancedBadge bg="primary" className="mb-3">
                <span className="fw-medium text-white">个人中心</span>
              </EnhancedBadge>
              <h1 className="display-5 fw-bold mb-3">
                欢迎回来，{currentUser?.displayName || '同学'}
              </h1>
              <p className="lead text-muted">
                下面的数字来自你记录的真实消费，不是估算。
              </p>
            </div>
          </Col>
        </Row>

        {error && (
          <Alert variant="danger" className="rounded-4">
            <FaExclamationTriangle className="me-2" />
            {error}
          </Alert>
        )}

        {report && !report.has_data && (
          <Alert variant="info" className="rounded-4">
            <FaLightbulb className="me-2" />
            {report.message || '暂无消费记录。记录第一笔消费后即可生成分析报告。'}
          </Alert>
        )}

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
        
        {/* 机会成本试算 + 行为模式发现 —— 产品核心机制 */}
        <Row className="g-4 mb-5">
          <Col md={5}>
            <Card className="h-100 border-0 rounded-4 shadow-sm dashboard-card">
              <Card.Body className="p-4">
                <div className="d-flex align-items-center mb-3">
                  <div className="icon-container bg-primary-light rounded-circle d-flex align-items-center justify-content-center me-3">
                    <FaCalculator className="text-primary" />
                  </div>
                  <h5 className="card-title mb-0">这笔钱花了会怎样？</h5>
                </div>
                <p className="text-muted small">
                  输入一笔想买的金额，看看它会让你的储蓄目标推迟多久。
                </p>
                <Form onSubmit={handleCostCheck} className="d-flex gap-2 mb-3">
                  <Form.Control
                    type="number"
                    min="0"
                    step="0.01"
                    value={costAmount}
                    onChange={(e) => setCostAmount(e.target.value)}
                    placeholder="金额（元）"
                  />
                  <Button type="submit" variant="primary" className="rounded-pill px-4">算算</Button>
                </Form>

                {costError && <Alert variant="warning" className="mb-0 small">{costError}</Alert>}

                {costResult && (
                  <div className="text-center py-2">
                    <div className="display-5 fw-bold text-primary">
                      {Math.round(costResult.delay_days)} 天
                    </div>
                    <p className="text-muted mb-0">{costResult.message}</p>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>

          <Col md={7}>
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

        <Row className="mb-5">
          <Col md={12}>
            <Card className="border-0 rounded-4 shadow-sm dashboard-card">
              <Card.Body className="p-4">
                <div className="d-flex align-items-center justify-content-between mb-4">
                  <div className="d-flex align-items-center">
                    <div className="icon-container bg-secondary-light rounded-circle d-flex align-items-center justify-content-center me-3">
                      <FaExchangeAlt className="text-secondary" />
                    </div>
                    <h5 className="card-title mb-0">最近消费</h5>
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="table table-hover">
                    <thead className="table-light">
                      <tr>
                        <th scope="col">日期</th>
                        <th scope="col">类别</th>
                        <th scope="col" className="text-end">金额</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan="3" className="text-center text-muted py-4">
                    还没有消费记录
                  </td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.id}>
                    <td>{t.date}</td>
                    <td>
                      <Badge
                        bg={t.regret === true ? 'danger-light' : 'secondary-light'}
                        text={t.regret === true ? 'danger' : 'secondary'}
                        className="rounded-pill px-2 py-1"
                      >
                        {t.category}
                      </Badge>
                    </td>
                    <td className="text-end fw-medium text-danger">
                      -¥{t.amount.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
        
        <Row className="justify-content-center">
          <Col md={8} lg={6}>
            <Card className="border-0 rounded-4 shadow-sm dashboard-card bg-gradient-primary text-white text-center">
              <Card.Body className="p-4">
                <div className="icon-container bg-white rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3">
                  <FaRobot className="text-primary" size={24} />
      </div>
                <h4 className="mb-3">需要财务建议?</h4>
                <p className="mb-4">与AI金融教练对话，获取个性化财务建议和指导，制定适合您的财务计划。</p>
                <Button 
                  as={Link} 
                  to="/coach" 
                  variant="light" 
                  size="lg" 
                  className="rounded-pill btn-glow px-4 py-2"
                >
                  开始对话 <FaRobot className="ms-2" />
                </Button>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
      
      {/* 自定义CSS */}
      <style jsx>{`
        .dashboard-page {
          position: relative;
          min-height: 100vh;
          padding-bottom: 3rem;
        }
        
        /* 动态背景元素 */
        .animated-background {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          z-index: -2;
          background: linear-gradient(120deg, #f0f8ff 0%, #e6f2ff 100%);
        }
        
        .floating-shape {
          position: absolute;
          background: rgba(78, 115, 223, 0.05);
          border-radius: 50%;
          animation: float 15s infinite ease-in-out;
        }
        
        .shape1 {
          width: 300px;
          height: 300px;
          top: -150px;
          left: 10%;
          animation-delay: 0s;
        }
        
        .shape2 {
          width: 200px;
          height: 200px;
          top: 30%;
          right: -100px;
          animation-delay: 2s;
          background: rgba(34, 74, 190, 0.05);
        }
        
        .shape3 {
          width: 250px;
          height: 250px;
          bottom: -125px;
          left: 20%;
          animation-delay: 4s;
          background: rgba(92, 159, 247, 0.05);
        }
        
        @keyframes float {
          0% {
            transform: translateY(0) rotate(0deg) scale(1);
          }
          50% {
            transform: translateY(30px) rotate(10deg) scale(1.05);
          }
          100% {
            transform: translateY(0) rotate(0deg) scale(1);
          }
        }
        
        /* 金融相关图标 */
        .finance-icon {
          position: absolute;
          opacity: 0.8;
          animation: float 20s infinite ease-in-out;
          z-index: -1;
        }
        
        .finance-icon-1 {
          top: 15%;
          left: 10%;
          animation-delay: 0s;
          transform: rotate(-15deg);
        }
        
        .finance-icon-2 {
          top: 60%;
          left: 5%;
          animation-delay: 5s;
          transform: rotate(10deg);
        }
        
        .finance-icon-3 {
          top: 25%;
          right: 8%;
          animation-delay: 2s;
          transform: rotate(5deg);
        }
        
        /* 增强型徽章样式 */
        .custom-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background-image: linear-gradient(to right, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.2) 100%);
          backdrop-filter: blur(5px);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
          transform: translateY(0);
          transition: all 0.3s ease;
        }
        
        .badge-content {
          z-index: 1;
        }
        
        .badge-glow {
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: linear-gradient(
            to right,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.2) 50%,
            rgba(255, 255, 255, 0) 100%
          );
          transform: rotate(30deg);
          animation: badgeGlow 3s ease-in-out infinite;
        }
        
        @keyframes badgeGlow {
          0% {
            transform: translateX(-100%) rotate(30deg);
          }
          100% {
            transform: translateX(100%) rotate(30deg);
          }
        }
        
        /* 仪表板卡片样式 */
        .dashboard-card {
          transition: all 0.3s ease;
          overflow: hidden;
        }
        
        .dashboard-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1) !important;
        }
        
        .icon-container {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .progress-bar-thick {
          height: 8px;
          border-radius: 4px;
        }
        
        /* 背景色和文本色 */
        .bg-primary-light {
          background-color: rgba(78, 115, 223, 0.1);
        }
        
        .bg-success-light {
          background-color: rgba(72, 187, 120, 0.1);
        }
        
        .bg-info-light {
          background-color: rgba(66, 153, 225, 0.1);
        }
        
        .bg-warning-light {
          background-color: rgba(255, 193, 7, 0.1);
        }
        
        .bg-danger-light {
          background-color: rgba(220, 53, 69, 0.1);
        }
        
        .bg-secondary-light {
          background-color: rgba(108, 117, 125, 0.1);
        }
        
        .bg-gradient-primary {
          background: linear-gradient(135deg, #4e73df 0%, #224abe 100%);
        }
        
        /* 按钮发光效果 */
        .btn-glow {
          position: relative;
          overflow: hidden;
          box-shadow: 0 0 10px rgba(78, 115, 223, 0.3);
          transition: all 0.3s ease;
          border: none;
        }
        
        .btn-glow:hover {
          box-shadow: 0 0 20px rgba(78, 115, 223, 0.5);
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
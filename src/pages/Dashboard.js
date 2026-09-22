import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Container, Row, Col, Card, Button, Badge, ProgressBar, Form, Spinner, Alert } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaChartLine, FaPiggyBank, FaWallet, FaExchangeAlt, FaRobot, FaCoins, FaChartPie, FaMoneyBillWave, FaLightbulb, FaExclamationTriangle, FaCalculator, FaMicrophone } from 'react-icons/fa';
import { getDecisionReport, listTransactions, getOpportunityCost, createTransaction, submitRegret, getUserGoals, createGoal, deleteGoal } from '../services/api';
import VoiceBillModal from '../components/VoiceBillModal';

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

  // 月收入：用户可设置，localStorage 记忆（后端暂未提供画像持久化，先落在本地）
  const [monthlyIncome, setMonthlyIncome] = useState(() => {
    const saved = localStorage.getItem('monthlyIncome');
    return saved && !isNaN(Number(saved)) ? Number(saved) : DEFAULT_MONTHLY_INCOME;
  });

  // 语音记账弹窗开关
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  // 记账表单状态
  const [recordForm, setRecordForm] = useState({
    amount: '',
    category: '餐饮',
    date: new Date().toISOString().slice(0, 10),
    merchant: '',
    note: '',
    hour: '',
  });
  const [recordResult, setRecordResult] = useState(null); // 记账成功后的机会成本即时反馈
  const [recordError, setRecordError] = useState('');
  const [savingRecord, setSavingRecord] = useState(false);

  // 储蓄目标管理状态
  const [goals, setGoals] = useState([]);
  const [goalForm, setGoalForm] = useState({
    title: '',
    target_amount: '',
    current_amount: '0',
    deadline: '',
  });
  const [goalError, setGoalError] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        // 报告、流水与目标并发拉取，三者互不依赖
        const [reportData, txnData, goalData] = await Promise.all([
          getDecisionReport({ monthlyIncome }),
          listTransactions(50),
          getUserGoals().catch(() => ({ data: { goals: [] } })), // 目标读取失败不阻塞看板
        ]);
        if (cancelled) return;
        setReport(reportData);
        setTransactions(txnData.transactions || []);
        setGoals((goalData && goalData.data && goalData.data.goals) || []);
      } catch (e) {
        if (cancelled) return;
        setError(e?.response?.data?.message || e?.message || '加载数据失败，请确认后端服务已启动');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [monthlyIncome]); // 月收入变化时重新拉取报告（机会成本/结余都依赖它）

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
      const result = await getOpportunityCost(amount, monthlyIncome);
      setCostResult(result);
    } catch (e) {
      // 用户入不敷出时后端返回 409，把原因原样告诉用户，
      // 而不是显示"计算失败"这种没有信息量的提示。
      setCostError(e?.response?.data?.message || e?.message || '计算失败');
    }
  };

  // 记一笔消费：保存记录 → 立即给出机会成本反馈 → 刷新报告与流水
  const handleRecordTransaction = async (event) => {
    event.preventDefault();
    setRecordError('');
    setRecordResult(null);

    const amount = parseFloat(recordForm.amount);
    if (isNaN(amount) || amount <= 0) {
      setRecordError('请输入大于 0 的金额');
      return;
    }
    const category = recordForm.category.trim();
    if (!category) {
      setRecordError('请输入消费类别');
      return;
    }

    setSavingRecord(true);
    try {
      const payload = {
        amount,
        category,
        date: recordForm.date,
        merchant: recordForm.merchant.trim(),
        note: recordForm.note.trim(),
      };
      // 小时字段可选，填写后才传给后端（用于深夜消费模式识别）
      if (recordForm.hour !== '') payload.hour = parseInt(recordForm.hour, 10);
      await createTransaction(payload);

      // 即时反馈：这笔消费相当于多少天结余（后端确定性计算，前端不参与数值计算）
      try {
        const cost = await getOpportunityCost(amount, monthlyIncome);
        setRecordResult(cost);
      } catch (costErr) {
        // 入不敷出时后端返回 409：记账已成功，只提示机会成本暂无法计算
        setRecordResult({
          unavailable: true,
          message: costErr?.response?.data?.message || '机会成本暂时无法计算',
        });
      }

      // 刷新报告与流水，让看板数字立刻更新
      const [reportData, txnData] = await Promise.all([
        getDecisionReport({ monthlyIncome }),
        listTransactions(50),
      ]);
      setReport(reportData);
      setTransactions(txnData.transactions || []);

      // 清空金额、商户、备注与时段，保留类别和日期方便连续记账
      setRecordForm((f) => ({ ...f, amount: '', merchant: '', note: '', hour: '' }));
    } catch (err) {
      setRecordError(err?.response?.data?.message || err?.message || '保存失败，请确认后端服务已启动');
    } finally {
      setSavingRecord(false);
    }
  };

  // 消费回访："这笔消费，现在回头看值吗"
  const handleRegret = async (transactionId, regret) => {
    try {
      await submitRegret(transactionId, regret);
      const txnData = await listTransactions(50);
      setTransactions(txnData.transactions || []);
    } catch (err) {
      alert(err?.response?.data?.message || err?.message || '提交回访失败');
    }
  };

  // 创建储蓄目标（后端要求 title / target_amount / deadline 必填）
  const handleGoalCreate = async (event) => {
    event.preventDefault();
    setGoalError('');

    const target = parseFloat(goalForm.target_amount);
    if (!goalForm.title.trim() || isNaN(target) || target <= 0) {
      setGoalError('请填写目标名称和大于 0 的目标金额');
      return;
    }
    if (!goalForm.deadline) {
      setGoalError('请填写截止日期（用于判断目标能否按期达成）');
      return;
    }

    setSavingGoal(true);
    try {
      const payload = {
        title: goalForm.title.trim(),
        target_amount: target,
        current_amount: parseFloat(goalForm.current_amount) || 0,
        deadline: goalForm.deadline,
      };
      await createGoal(payload);

      // 清空表单并刷新目标列表与报告（目标可达性随之变化）
      setGoalForm({ title: '', target_amount: '', current_amount: '0', deadline: '' });
      const goalData = await getUserGoals();
      setGoals((goalData && goalData.data && goalData.data.goals) || []);
      const reportData = await getDecisionReport({ monthlyIncome });
      setReport(reportData);
    } catch (err) {
      setGoalError(err?.response?.data?.message || err?.message || '创建目标失败');
    } finally {
      setSavingGoal(false);
    }
  };

  // 删除储蓄目标（先确认，避免误删）
  const handleGoalDelete = async (goalId) => {
    if (!window.confirm('确定删除这个目标吗？')) return;
    try {
      await deleteGoal(goalId);
      const goalData = await getUserGoals();
      setGoals((goalData && goalData.data && goalData.data.goals) || []);
      const reportData = await getDecisionReport({ monthlyIncome });
      setReport(reportData);
    } catch (err) {
      alert(err?.response?.data?.message || err?.message || '删除目标失败');
    }
  };

  // 语音记账保存成功后刷新看板（报告/流水/目标并发拉取）
  const reloadAll = async () => {
    try {
      const [reportData, txnData, goalData] = await Promise.all([
        getDecisionReport({ monthlyIncome }),
        listTransactions(50),
        getUserGoals().catch(() => ({ data: { goals: [] } })),
      ]);
      setReport(reportData);
      setTransactions(txnData.transactions || []);
      setGoals((goalData && goalData.data && goalData.data.goals) || []);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || '刷新数据失败');
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
          <FaCoins size={24} color="rgba(var(--yg-primary-rgb), 0.15)" />
        </div>
        <div className="finance-icon finance-icon-2">
          <FaChartPie size={36} color="rgba(var(--yg-success-rgb), 0.15)" />
        </div>
        <div className="finance-icon finance-icon-3">
          <FaMoneyBillWave size={32} color="rgba(var(--yg-accent-rgb), 0.15)" />
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

        {/* 月收入设置：机会成本/结余计算的输入，失焦保存到 localStorage */}
        <Row className="mb-4">
          <Col md={4}>
            <Card className="border-0 rounded-4 shadow-sm">
              <Card.Body className="p-3 d-flex align-items-center gap-3">
                <div className="icon-container bg-primary-light rounded-circle d-flex align-items-center justify-content-center">
                  <FaWallet className="text-primary" />
                </div>
                <div className="flex-grow-1">
                  <div className="text-muted small">月收入（元）</div>
                  <Form.Control
                    type="number"
                    min="0"
                    step="100"
                    defaultValue={monthlyIncome}
                    onBlur={(e) => {
                      // 清空时不生效，避免误把月收入改成 0
                      if (e.target.value === '') return;
                      const v = Number(e.target.value);
                      if (!isNaN(v) && v >= 0 && v !== monthlyIncome) {
                        setMonthlyIncome(v);
                        localStorage.setItem('monthlyIncome', String(v));
                      }
                    }}
                    style={{ maxWidth: 160 }}
                  />
                </div>
                <span className="text-muted small" style={{ maxWidth: 110 }}>机会成本按此计算</span>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* 记一笔消费 —— 产品核心闭环的入口：记录当下即反馈 */}
        <Row className="mb-5">
          <Col md={12}>
            <Card className="border-0 rounded-4 shadow-sm dashboard-card">
              <Card.Body className="p-4">
                <div className="d-flex align-items-center mb-3">
                  <div className="icon-container bg-success-light rounded-circle d-flex align-items-center justify-content-center me-3">
                    <FaPiggyBank className="text-success" />
                  </div>
                  <h5 className="card-title mb-0">记一笔消费</h5>
                  <span className="text-muted small ms-2">记录后立即告诉你这笔钱相当于几天结余</span>
                  <Button
                    variant="outline-success"
                    size="sm"
                    className="rounded-pill ms-auto"
                    onClick={() => setShowVoiceModal(true)}
                  >
                    <FaMicrophone className="me-1" />语音录入
                  </Button>
                </div>
                <Form onSubmit={handleRecordTransaction}>
                  <Row className="g-3">
                    <Col md={2}>
                      <Form.Control
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        placeholder="金额（元）"
                        value={recordForm.amount}
                        onChange={(e) => setRecordForm({ ...recordForm, amount: e.target.value })}
                      />
                    </Col>
                    <Col md={2}>
                      <Form.Select
                        value={recordForm.category}
                        onChange={(e) => setRecordForm({ ...recordForm, category: e.target.value })}
                      >
                        <option>餐饮</option>
                        <option>交通</option>
                        <option>购物</option>
                        <option>娱乐</option>
                        <option>学习</option>
                        <option>房租</option>
                        <option>话费</option>
                        <option>医疗</option>
                        <option>其他</option>
                      </Form.Select>
                    </Col>
                    <Col md={2}>
                      <Form.Control
                        type="date"
                        required
                        value={recordForm.date}
                        onChange={(e) => setRecordForm({ ...recordForm, date: e.target.value })}
                      />
                    </Col>
                    <Col md={2}>
                      <Form.Control
                        type="text"
                        placeholder="商户（可选）"
                        value={recordForm.merchant}
                        onChange={(e) => setRecordForm({ ...recordForm, merchant: e.target.value })}
                      />
                    </Col>
                    <Col md={2}>
                      <Form.Select
                        value={recordForm.hour}
                        onChange={(e) => setRecordForm({ ...recordForm, hour: e.target.value })}
                      >
                        <option value="">时段（可选）</option>
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>{i} 时</option>
                        ))}
                      </Form.Select>
                    </Col>
                    <Col md={2} className="d-flex align-items-center">
                      <Button type="submit" variant="success" className="rounded-pill w-100" disabled={savingRecord}>
                        {savingRecord ? '保存中…' : '记一笔'}
                      </Button>
                    </Col>
                  </Row>
                  <Row className="mt-2">
                    <Col md={8}>
                      <Form.Control
                        type="text"
                        placeholder="备注（可选，例如：和室友吃饭）"
                        value={recordForm.note}
                        onChange={(e) => setRecordForm({ ...recordForm, note: e.target.value })}
                      />
                    </Col>
                  </Row>
                </Form>

                {recordError && <Alert variant="danger" className="mt-3 mb-0 small">{recordError}</Alert>}

                {recordResult && !recordResult.unavailable && (
                  <div className="mt-3 p-3 rounded-4 bg-success-light">
                    <div className="d-flex align-items-baseline gap-2 flex-wrap">
                      <span className="display-6 fw-bold text-success">¥{recordResult.amount}</span>
                      <span className="fw-medium">
                        相当于你 <b className="fs-4">{Math.round(recordResult.delay_days)} 天</b> 的结余
                      </span>
                    </div>
                    <p className="text-muted small mb-0">{recordResult.message}</p>
                  </div>
                )}
                {recordResult && recordResult.unavailable && (
                  <Alert variant="warning" className="mt-3 mb-0 small">{recordResult.message}</Alert>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>

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
                      <Form.Group className="mb-3">
                        <Form.Label className="small text-muted">已存金额（元）</Form.Label>
                        <Form.Control
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          value={goalForm.current_amount}
                          onChange={(e) => setGoalForm({ ...goalForm, current_amount: e.target.value })}
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  <Form.Group className="mb-3">
                    <Form.Label className="small text-muted">截止日期</Form.Label>
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
                {goals.length === 0 ? (
                  <p className="text-muted mb-0">
                    还没有设定目标。设定一个目标后，每次消费都会显示它让你离目标更远了多少天。
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
                            </div>
                          </div>
                          <ProgressBar now={progress} variant="warning" className="mb-2" />
                          <div className="d-flex justify-content-between text-muted small">
                            <span>已存 ¥{current.toLocaleString()} / ¥{target.toLocaleString()}</span>
                            <span>{progress}%</span>
                          </div>
                          {g.deadline && <div className="text-muted small mt-1">截止：{g.deadline}</div>}
                        </div>
                      );
                    })}
                  </div>
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
                        <th scope="col">回访</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center text-muted py-4">
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
                    <td>
                      {t.regret === null || t.regret === undefined ? (
                        // 未回访：提供"值/不值"两个按钮，回访结果用于后悔率统计与"后悔集中"模式识别
                        <div className="d-flex gap-1">
                          <Button size="sm" variant="outline-success" className="py-0 px-2" onClick={() => handleRegret(t.id, false)}>
                            值
                          </Button>
                          <Button size="sm" variant="outline-danger" className="py-0 px-2" onClick={() => handleRegret(t.id, true)}>
                            不值
                          </Button>
                        </div>
                      ) : t.regret ? (
                        <Badge bg="danger" className="rounded-pill px-2 py-1">后悔</Badge>
                      ) : (
                        <Badge bg="success" className="rounded-pill px-2 py-1">值得</Badge>
                      )}
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
      
      {/* 语音记账 + AI 消费评估弹窗 */}
      <VoiceBillModal
        show={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        onSaved={reloadAll}
        monthlyIncome={monthlyIncome}
      />

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
          background: linear-gradient(120deg, var(--yg-wash-from) 0%, var(--yg-wash-to) 100%);
        }
        
        .floating-shape {
          position: absolute;
          background: rgba(var(--yg-primary-rgb), 0.05);
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
          background: rgba(var(--yg-primary-rgb), 0.05);
        }
        
        .shape3 {
          width: 250px;
          height: 250px;
          bottom: -125px;
          left: 20%;
          animation-delay: 4s;
          background: rgba(var(--yg-primary-rgb), 0.05);
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
          background-color: rgba(var(--yg-primary-rgb), 0.1);
        }
        
        .bg-success-light {
          background-color: rgba(var(--yg-success-rgb), 0.1);
        }
        
        .bg-info-light {
          background-color: rgba(var(--yg-secondary-rgb), 0.1);
        }
        
        .bg-warning-light {
          background-color: rgba(var(--yg-accent-rgb), 0.1);
        }
        
        .bg-danger-light {
          background-color: rgba(var(--yg-danger-rgb), 0.1);
        }
        
        .bg-secondary-light {
          background-color: rgba(var(--yg-muted-rgb), 0.1);
        }
        
        .bg-gradient-primary {
          background: linear-gradient(135deg, var(--yg-primary-text) 0%, var(--yg-primary-deep) 100%);
        }
        
        /* 按钮发光效果 */
        .btn-glow {
          position: relative;
          overflow: hidden;
          box-shadow: 0 0 10px rgba(var(--yg-primary-rgb), 0.3);
          transition: all 0.3s ease;
          border: none;
        }
        
        .btn-glow:hover {
          box-shadow: 0 0 20px rgba(var(--yg-primary-rgb), 0.5);
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
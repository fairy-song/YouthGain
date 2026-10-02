import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Container, Row, Col, Card, Button, Badge, Form, Spinner, Alert } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import { FaPiggyBank, FaExchangeAlt, FaCoins, FaChartPie, FaMoneyBillWave, FaLightbulb, FaExclamationTriangle, FaMicrophone } from 'react-icons/fa';
import { getDecisionReport, listTransactions, getOpportunityCost, createTransaction, getUserGoals, createGoal, deleteGoal, updateGoal } from '../services/api';
import FinanceVisuals, { dateKey } from '../components/FinanceVisuals';
import BackfillBillModal from '../components/ledger/BackfillBillModal';
import VoiceBillModal from '../components/VoiceBillModal';
import SectionNav from '../components/SectionNav';
import UpcomingExpenses from '../components/UpcomingExpenses';
import CoachHelp from '../components/CoachHelp';
import LedgerGoals from '../components/ledger/LedgerGoals';
import LedgerAnalysis from '../components/ledger/LedgerAnalysis';
import TransactionReflection from '../components/TransactionReflection';
import TransactionIntent from '../components/TransactionIntent';
import { getLearningProfile, getLearning } from '../services/learning';

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


const Dashboard = () => {
  const { currentUser } = useAuth();
  const [params] = useSearchParams();
  const tab = ['goals', 'upcoming', 'analysis'].includes(params.get('tab')) ? params.get('tab') : 'overview';

  const [categoryFilter, setCategoryFilter] = useState('');
  const [report, setReport] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [monthlyBudget, setMonthlyBudget] = useState(null);
  const [reflections, setReflections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [monthlyIncome, setMonthlyIncome] = useState(undefined);
  const [reload, setReload] = useState(0);
  const budgetDay = useRef(dateKey());
  useEffect(() => {
    const refresh = () => setReload(v => v + 1);
    window.addEventListener('transaction-saved', refresh);
    window.addEventListener('learning-saved', refresh);
    return () => {
      window.removeEventListener('transaction-saved', refresh);
      window.removeEventListener('learning-saved', refresh);
    };
  }, []);

  useEffect(() => {
    const checkDay = () => {
      const today = dateKey();
      if (budgetDay.current !== today) {
        budgetDay.current = today;
        setReload(value => value + 1);
      }
    };
    const onFocus = () => {
      budgetDay.current = dateKey();
      setReload(value => value + 1);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') checkDay(); };
    const timer = window.setInterval(checkDay, 60000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // 语音记账弹窗开关
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showBackfillModal, setShowBackfillModal] = useState(false);

  // 记账表单状态
  const [recordForm, setRecordForm] = useState({
    amount: '',
    category: '餐饮',
    date: dateKey(),
    merchant: '',
    items: '',
    note: '',
    hour: '',
    planned: '', purpose: '',
  });
  const [recordResult, setRecordResult] = useState(null); // 记账成功后的机会成本即时反馈
  const [recordError, setRecordError] = useState('');
  const [savingRecord, setSavingRecord] = useState(false);

  // 储蓄目标管理状态
  const [goals, setGoals] = useState([]);
  const [goalPlanResult, setGoalPlanResult] = useState(null);
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
        const profile = await getLearningProfile();
        if (cancelled) return;
        setMonthlyIncome(profile.monthly_income ?? undefined);
        const [reportData, txnData, goalData, learningData] = await Promise.all([
          getDecisionReport({}),
          listTransactions(50),
          getUserGoals(),
          getLearning(),
        ]);
        if (cancelled) return;
        setReport(reportData);
        setReflections(learningData.entries.filter(e => e.kind === 'reflection'));
        setTransactions(txnData.transactions || []);
      setMonthlyBudget(txnData.monthly_budget || null);
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
  }, [currentUser?.uid, reload]); // 月收入变化时重新拉取报告（机会成本/结余都依赖它）

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
    let saved = false;
    try {
      const payload = {
        amount,
        category,
        date: recordForm.date,
        merchant: recordForm.merchant.trim(),
        items: recordForm.items.trim(),
        note: recordForm.note.trim(),
        planned: recordForm.planned || null, purpose: recordForm.purpose,
      };
      // 小时字段可选，填写后才传给后端（用于深夜消费模式识别）
      if (recordForm.hour !== '') payload.hour = parseInt(recordForm.hour, 10);
      await createTransaction(payload);
      saved = true;
      setRecordForm((f) => ({ ...f, amount: '', merchant: '', items: '', note: '', hour: '', planned: '', purpose: '' }));

      // 即时反馈：这笔消费相当于多少天结余（后端确定性计算，前端不参与数值计算）
      try {
        const cost = await getOpportunityCost(amount, monthlyIncome);
        setRecordResult(cost);
      } catch (costErr) {
        // 入不敷出时后端返回 409：记账已成功，只提示机会成本暂无法计算
        setRecordResult({
          unavailable: true,
          message: '账目已保存。' + (costErr?.response?.data?.message || '机会成本暂时无法计算'),
        });
      }

      // 刷新报告与流水，让看板数字立刻更新
      const [reportData, txnData] = await Promise.all([
        getDecisionReport({ monthlyIncome }),
        listTransactions(50),
      ]);
      setReport(reportData);
      setTransactions(txnData.transactions || []);
      setMonthlyBudget(txnData.monthly_budget || null);

    } catch (err) {
      setRecordError(saved ? '账目已保存，但看板刷新失败，请点击页面上方重试，避免重复记账。' : (err?.response?.data?.message || err?.message || '保存失败，请重试'));
    } finally {
      setSavingRecord(false);
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
  const handleGoalPaid = async (goalId) => {
    try {
      await updateGoal(goalId, { status: 'completed', current_amount: 0 });
      const goalData = await getUserGoals();
      setGoals(goalData?.data?.goals || []);
    } catch (err) { setGoalError(err?.response?.data?.message || '目标更新失败'); }
  };

  const handleGoalEdit = async (event, goalId) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      await updateGoal(goalId, { current_amount: Number(values.get('current_amount')), deadline: values.get('deadline') });
      const goalData = await getUserGoals();
      setGoals(goalData?.data?.goals || []);
    } catch (err) { setGoalError(err?.response?.data?.message || '目标更新失败'); }
  };

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
        getUserGoals(),
      ]);
      setReport(reportData);
      setTransactions(txnData.transactions || []);
      setMonthlyBudget(txnData.monthly_budget || null);
      setGoals((goalData && goalData.data && goalData.data.goals) || []);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || '刷新数据失败');
    }
  };

  // 派生展示值——集中算好，避免可选链散落在 JSX 里
  const reportData = report?.has_data ? report.report : null;
  const surplus = reportData?.monthly_surplus ?? 0;
  const income = reportData?.monthly_income ?? monthlyIncome ?? 0;
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
                <span className="fw-medium text-white">我的账本</span>
              </EnhancedBadge>
              <h1 className="display-5 fw-bold mb-3">
                欢迎回来，{currentUser?.displayName || '同学'}
              </h1>
              <p className="lead text-muted">
                记录消费，看清去向。分析仅基于已有记录。
              </p>
            </div>
          </Col>
        </Row>

        {error && (
          <Alert variant="danger" className="rounded-4">
            <FaExclamationTriangle className="me-2" />
            {error}
            <Button variant="link" onClick={() => setReload(v => v + 1)}>重试</Button>
          </Alert>
        )}

        {report && !report.has_data && (
          <Alert variant="info" className="rounded-4">
            <FaLightbulb className="me-2" />
            {report.message || '暂无消费记录。记录第一笔消费后即可生成分析报告。'}
          </Alert>
        )}

        <SectionNav label="账本功能" active={tab} items={[["overview", "收支记录", "/dashboard"], ["goals", "储蓄目标", "/dashboard?tab=goals"], ["upcoming", "未来开支", "/dashboard?tab=upcoming"], ["analysis", "详细分析", "/dashboard?tab=analysis"]]} />
        {tab === 'overview' && <FinanceVisuals monthlyBudget={monthlyBudget} transactions={transactions} selectedCategory={categoryFilter} onCategory={setCategoryFilter} />}


        <div className="d-flex flex-wrap gap-2 mb-4">
          <Link to="/learning?tab=decision" className="btn btn-outline-success btn-sm">买之前，比较选择</Link>
          <CoachHelp prompt="我正在查看账本，请帮我理解已记录的收支与未来安排。先问我想了解哪一部分。" />
        </div>
        {tab === 'analysis' && <><Alert variant="light">
          <strong>月收入或生活费：{monthlyIncome == null ? '尚未设置' : `¥${monthlyIncome}`}</strong>
          <Button as={Link} to="/profile" variant="link">修改财务资料</Button>
          {report?.basis && <p className="small mt-2">分析范围：{report.basis.start} 至 {report.basis.end}，{report.basis.record_count} 笔。{report.basis.message}</p>}
          {report?.warnings?.map((warning, index) => <p key={index} className="small mb-0">{warning}</p>)}
        </Alert><LedgerAnalysis {...{ surplus, income, avgSpending, spending, discretionary, goal, patterns }} /></>}
        {tab === 'upcoming' && <UpcomingExpenses key={currentUser?.uid} />}
        {tab === 'overview' && <>
        {/* 记一笔消费 —— 产品核心闭环的入口：记录当下即反馈 */}
        <Row className="mb-5" id="record-expense">
          <Col md={12}>
            <Card className="border-0 rounded-4 shadow-sm dashboard-card">
              <Card.Body className="p-4">
                <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
                  <div className="icon-container bg-success-light rounded-circle d-flex align-items-center justify-content-center me-3">
                    <FaPiggyBank className="text-success" />
                  </div>
                  <h5 className="card-title mb-0">记一笔消费</h5>
                  <span className="text-muted small ms-2">记录后立即告诉你这笔钱相当于几天结余</span>
                  <Button variant="outline-success" size="sm" className="rounded-pill" onClick={() => setShowBackfillModal(true)}>补记账单</Button>
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
                  <Row className="mt-2 g-3">
                    <Col md={4}>
                      <Form.Group controlId="record-items">
                        <Form.Label>消费内容（可选）</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="例如：午餐、奶茶、教材"
                          value={recordForm.items}
                          onChange={(e) => setRecordForm({ ...recordForm, items: e.target.value })}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={8}>
                      <Form.Group controlId="record-note">
                        <Form.Label>备注（可选）</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="备注（可选，例如：和室友吃饭）"
                          value={recordForm.note}
                          onChange={(e) => setRecordForm({ ...recordForm, note: e.target.value })}
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  <TransactionIntent value={recordForm} onChange={setRecordForm} />
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

        </>}
        {tab === 'goals' && <LedgerGoals {...{ goals, goalForm, setGoalForm, goalError, savingGoal, handleGoalCreate, handleGoalDelete, handleGoalPaid, handleGoalEdit, goalPlanResult, setGoalPlanResult, currentUser }} />}
        {tab === 'overview' && <Row className="mb-5">
          <Col md={12}>
            <Card className="border-0 rounded-4 shadow-sm dashboard-card">
              <Card.Body className="p-4">
                <div className="d-flex align-items-center justify-content-between mb-4">
                  <div className="d-flex align-items-center">
                    <div className="icon-container bg-secondary-light rounded-circle d-flex align-items-center justify-content-center me-3">
                      <FaExchangeAlt className="text-secondary" />
                    </div>
                    <h5 className="card-title mb-0">最近消费</h5>{categoryFilter && <Button variant="link" onClick={() => setCategoryFilter('')}>{categoryFilter} · 清除筛选</Button>}
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="table table-hover recent-transactions">
                    <thead className="table-light">
                      <tr>
                        <th scope="col">日期</th>
                        <th scope="col">类别</th>
                        <th scope="col">商户</th>
                        <th scope="col">消费内容</th>
                        <th scope="col">备注</th>
                        <th scope="col" className="text-end">金额</th>
                        <th scope="col">回访</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center text-muted py-4">
                    还没有消费记录
                  </td>
                </tr>
              ) : (
                transactions.filter(t => !categoryFilter || (t.category || '未分类') === categoryFilter).map((t) => (
                  <tr key={t.id}>
                    <td className="text-nowrap">
                      {t.date}
                      {t.hour !== null && t.hour !== undefined && t.hour !== '' && (
                        <div className="small text-muted">{String(t.hour).padStart(2, '0')} 时</div>
                      )}
                    </td>
                    <td>
                      <Badge
                        bg="secondary-light"
                        text="secondary"
                        className="rounded-pill px-2 py-1"
                      >
                        {t.category}
                      </Badge>
                    </td>
                    <td className="transaction-detail">{t.merchant || '—'}</td>
                    <td className="transaction-detail">{t.items || '—'}</td>
                    <td className="transaction-detail">{t.note || '—'}{t.purpose && <div className="small text-muted">当时的需要：{t.purpose}</div>}{t.planned && <div className="small text-muted">{{ planned: '提前计划', spontaneous: '临时决定', necessary: '临时必要开支' }[t.planned]}</div>}</td>
                    <td className="text-end fw-medium text-danger text-nowrap">
                      -¥{t.amount.toLocaleString()}
                    </td>
                    <td>
                      <TransactionReflection transactionId={t.id} saved={reflections.find(r => r.transaction_id === String(t.id))} />
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
        </Row>}
        
      </Container>
      
      {/* 语音记账 + AI 消费评估弹窗 */}
      {showBackfillModal && <BackfillBillModal onClose={() => setShowBackfillModal(false)} onSaved={async () => {
        const [updatedReport, updatedTransactions] = await Promise.all([getDecisionReport({ monthlyIncome }), listTransactions(50)]);
        setReport(updatedReport);
        setTransactions(updatedTransactions.transactions || []);
        setMonthlyBudget(updatedTransactions.monthly_budget || null);
        setCategoryFilter('');
      }} />}
      <VoiceBillModal
        show={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        onSaved={reloadAll}
        monthlyIncome={monthlyIncome}
      />

      {/* 自定义CSS */}
      <style jsx>{`
        .recent-transactions .transaction-detail {
          min-width: 8rem;
          max-width: 20rem;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .recent-transactions th {
          white-space: nowrap;
        }
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

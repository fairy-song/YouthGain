import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Container, Row, Col, Card, Button, Badge, Form, Spinner, Alert } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import { FaPiggyBank, FaExchangeAlt, FaLightbulb, FaExclamationTriangle, FaMicrophone } from 'react-icons/fa';
import { getDecisionReport, listTransactions, getOpportunityCost, createTransaction, getUserGoals, createGoal, deleteGoal, updateGoal } from '../services/api';
import FinanceVisuals, { dateKey } from '../components/FinanceVisuals';
import MonthlyAvailableFunds from '../components/MonthlyAvailableFunds';
import BackfillBillModal from '../components/ledger/BackfillBillModal';
import CsvImportModal from '../components/ledger/CsvImportModal';
import VoiceBillModal from '../components/VoiceBillModal';
import SectionNav from '../components/SectionNav';
import UpcomingExpenses from '../components/UpcomingExpenses';
import CoachHelp from '../components/CoachHelp';
import LedgerGoals from '../components/ledger/LedgerGoals';
import LedgerAnalysis from '../components/ledger/LedgerAnalysis';
import TransactionReflection from '../components/TransactionReflection';
import TransactionIntent from '../components/TransactionIntent';
import { getLearningProfile, getLearning } from '../services/learning';
import './DashboardUI.css';

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
  const [funds, setFunds] = useState(null);
  const [monthlyCashflow, setMonthlyCashflow] = useState(null);
  const [reflections, setReflections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [monthlyIncome, setMonthlyIncome] = useState(undefined);
  const [reload, setReload] = useState(0);
  const budgetDay = useRef(dateKey());
  const refreshVersion = useRef(0);
  const feedbackVersion = useRef(0);
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
  const [importMode, setImportMode] = useState(null);

  // 记账表单状态
  const [recordForm, setRecordForm] = useState({
    transaction_type: 'expense',
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
  const isIncome = recordForm.transaction_type === 'income';
  const handleRecordType = (event) => {
    const transaction_type = event.target.value;
    feedbackVersion.current += 1;
    setRecordResult(null);
    setRecordError('');
    setRecordForm(f => ({ ...f, transaction_type,
      category: transaction_type === 'income' ? '生活费' : '餐饮', planned: '', purpose: '' }));
  };

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

  const refreshLedger = useCallback(async () => {
    const version = ++refreshVersion.current;
    const apply = update => { if (version === refreshVersion.current) update(); };
    setError('');
    // Apply each response independently: analysis failures must not freeze the ledger.
    const requests = [
      ['消费概览', listTransactions(50).then(data => apply(() => {
        setTransactions(data.transactions || []);
        setMonthlyBudget(data.monthly_budget || null);
        setMonthlyCashflow(data.monthly_cashflow || null);
        setFunds(data.funds || null);
        setLoading(false);
      }))],
      ['详细分析', getDecisionReport({}).then(data => apply(() => setReport(data)))],
      ['财务资料', getLearningProfile().then(data => apply(() => setMonthlyIncome(data.monthly_income ?? undefined)))],
      ['储蓄目标', getUserGoals().then(data => apply(() => setGoals(data?.data?.goals || [])))],
      ['消费复盘', getLearning().then(data => apply(() => setReflections((data.entries || []).filter(e => e.kind === 'reflection'))))],
    ];
    const results = await Promise.allSettled(requests.map(([, request]) => request));
    apply(() => {
      const failures = results.flatMap((result, index) => result.status === 'rejected' ? [requests[index][0]] : []);
      if (results[0].status === 'rejected') {
        setTransactions([]);
        setMonthlyBudget(null);
        setMonthlyCashflow(null);
        setFunds(null);
      }
      if (results[1].status === 'rejected') setReport(null);
      if (failures.length) setError(`${failures.join('、')}刷新失败，请重试。已保存的账目无需重复记账。`);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    refreshLedger();
    return () => { refreshVersion.current += 1; };
  }, [currentUser?.uid, reload, refreshLedger]);

  useEffect(() => {
    setLoading(true);
    setReport(null);
    setTransactions([]);
    setMonthlyBudget(null);
    setFunds(null);
    setMonthlyIncome(undefined);
    setGoals([]);
    setReflections([]);
    setRecordResult(null);
    return () => { feedbackVersion.current += 1; };
  }, [currentUser?.uid]);

  // 保存收支后刷新；只有支出才请求机会成本反馈。
  const handleRecordTransaction = async (event) => {
    event.preventDefault();
    setRecordError('');
    setRecordResult(null);
    const feedback = ++feedbackVersion.current;

    const amount = parseFloat(recordForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setRecordError('请输入大于 0 的金额');
      return;
    }
    const category = recordForm.category.trim();
    if (!category) {
      setRecordError(isIncome ? '请选择收入来源' : '请选择支出类别');
      return;
    }

    setSavingRecord(true);
    let saved = false;
    try {
      const payload = {
        amount,
        transaction_type: recordForm.transaction_type,
        category,
        date: recordForm.date,
        merchant: recordForm.merchant.trim(),
        items: recordForm.items.trim(),
        note: recordForm.note.trim(),
        ...(isIncome ? {
          receipt_kind: ({ 红包: 'red_packet', 他人转入: 'external_transfer' }[category] || 'other_income'),
        } : { planned: recordForm.planned || null, purpose: recordForm.purpose }),
      };
      // 小时字段可选，填写后才传给后端（用于深夜消费模式识别）
      if (recordForm.hour !== '') payload.hour = parseInt(recordForm.hour, 10);
      await createTransaction(payload);
      saved = true;
      setRecordForm((f) => ({ ...f, amount: '', merchant: '', items: '', note: '', hour: '', planned: '', purpose: '' }));
      // Refresh immediately after saving; optional feedback runs independently.
      refreshLedger();
      if (isIncome) {
        if (feedback === feedbackVersion.current) setRecordResult({ income: true, message: '收入已保存。' });
        return;
      }
      getOpportunityCost(amount, monthlyIncome).then(cost => {
        if (feedback === feedbackVersion.current) setRecordResult(cost);
      }).catch(costErr => {
        // 入不敷出时后端返回 409：记账已成功，只提示机会成本暂无法计算
        if (feedback === feedbackVersion.current) setRecordResult({
          unavailable: true,
          message: '账目已保存。' + (costErr?.response?.data?.message || '机会成本暂时无法计算'),
        });
      });

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
      refreshLedger();

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
      refreshLedger();
      const goalData = await getUserGoals();
      setGoals(goalData?.data?.goals || []);
    } catch (err) { setGoalError(err?.response?.data?.message || '目标更新失败'); }
  };

  const handleGoalEdit = async (event, goalId) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      await updateGoal(goalId, { current_amount: Number(values.get('current_amount')), deadline: values.get('deadline') });
      refreshLedger();
      const goalData = await getUserGoals();
      setGoals(goalData?.data?.goals || []);
    } catch (err) { setGoalError(err?.response?.data?.message || '目标更新失败'); }
  };

  const handleGoalDelete = async (goalId) => {
    if (!window.confirm('确定删除这个目标吗？')) return;
    try {
      await deleteGoal(goalId);
      refreshLedger();
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
    await refreshLedger();
  };

  // 派生展示值——集中算好，避免可选链散落在 JSX 里
  const reportData = report?.has_data ? report.report : null;
  const surplus = reportData?.monthly_surplus ?? 0;
  const income = reportData?.monthly_income ?? monthlyIncome ?? 0;
  const avgSpending = reportData ? Math.max(0, income - surplus) : 0;
  const spending = reportData?.spending ?? null;
  const patterns = reportData?.patterns ?? [];
  const pca = reportData?.pca;
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
      <Container className="ledger-wrap">
        <header className="ledger-intro">
          <span className="ledger-eyebrow">青盈 · 账本</span>
          <h1>看清钱的去向</h1>
          <p>先记下真实的一笔，再慢慢看变化。</p>
        </header>

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
        {tab === 'overview' && <section className="ledger-summary" aria-label="本月收支摘要">
          <div className="ledger-metric"><span className="ledger-summary-label">{monthlyCashflow?.month || monthlyBudget?.month || dateKey().slice(0, 7)} · 本月支出</span>
            <strong className="ledger-summary-amount">{monthlyCashflow?.complete ? `¥${Number(monthlyCashflow.spent).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '暂无法汇总'}</strong>
            <small>{monthlyCashflow?.complete ? `原支付 ¥${Number(monthlyCashflow.gross_expense).toFixed(2)} − 已关联退款 ¥${Number(monthlyCashflow.refunds).toFixed(2)}` : '已记录支出扣除已关联退款'}</small></div>
          <div className="ledger-metric"><span className="ledger-summary-label">本月收入</span><strong className="ledger-summary-amount">{monthlyCashflow?.complete ? `¥${Number(monthlyCashflow.income).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '暂无法汇总'}</strong><small>{monthlyCashflow?.complete ? `红包 ¥${Number(monthlyCashflow.income_breakdown?.red_packet || 0).toFixed(2)} · 他人转入 ¥${Number(monthlyCashflow.income_breakdown?.external_transfer || 0).toFixed(2)}` : '退款和本人转账不计收入'}</small></div>
          <MonthlyAvailableFunds key={currentUser?.uid} funds={funds} editable onSaved={refreshLedger} />
        </section>}
        {tab === 'analysis' && <><Alert variant="light">
          <strong>月收入或生活费：{monthlyIncome == null ? '尚未设置' : `¥${monthlyIncome}`}</strong>
          <Button as={Link} to="/profile" variant="link">修改财务资料</Button>
          {report?.basis && <p className="small mt-2">分析范围：{report.basis.start} 至 {report.basis.end}，{report.basis.record_count} 笔。{report.basis.message}</p>}
          {report?.warnings?.map((warning, index) => <p key={index} className="small mb-0">{warning}</p>)}
        </Alert><LedgerAnalysis {...{ surplus, income, avgSpending, spending, discretionary, goal, patterns, pca }} /></>}
        {tab === 'upcoming' && <UpcomingExpenses key={currentUser?.uid} />}
        {tab === 'overview' && <>
        {/* 保留旧锚点，兼容已有的记账链接。 */}
        <Row className="mb-5" id="record-expense">
          <Col md={12}>
            <Card className="border-0 rounded-4 shadow-sm dashboard-card">
              <Card.Body className="p-4">
                <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
                  <div className="icon-container bg-success-light rounded-circle d-flex align-items-center justify-content-center me-3">
                    <FaPiggyBank className="text-success" />
                  </div>
                  <h5 className="card-title mb-0">记一笔收支</h5>
                  <span className="text-muted small ms-2">{isIncome ? '记录实际到账，更新可用资金；本人转账不算收入' : '记录日常支出，了解这笔钱相当于几天结余'}</span>
                  <Button variant="outline-success" size="sm" className="rounded-pill" onClick={() => setShowBackfillModal(true)}>补记账单</Button>
                  <Button variant="outline-success" size="sm" className="rounded-pill" onClick={() => setImportMode('expense')}>导入支出账单</Button>
                  <Button variant="outline-success" size="sm" className="rounded-pill" onClick={() => setImportMode('receipt')}>导入收款账单</Button>
                  <Button
                    variant="outline-success"
                    size="sm"
                    className="rounded-pill ms-auto"
                    onClick={() => setShowVoiceModal(true)}
                  >
                    <FaMicrophone className="me-1" />语音记支出
                  </Button>
                </div>
                <Form onSubmit={handleRecordTransaction}>
                  <Form.Group controlId="record-type" className="mb-3">
                    <Form.Label>收支类型</Form.Label>
                    <Form.Select value={recordForm.transaction_type} onChange={handleRecordType} disabled={savingRecord} style={{ maxWidth: 180 }}>
                      <option value="expense">支出</option>
                      <option value="income">收入</option>
                    </Form.Select>
                  </Form.Group>
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
                        aria-label={isIncome ? '收入来源' : '支出类别'}
                        value={recordForm.category}
                        onChange={(e) => setRecordForm({ ...recordForm, category: e.target.value })}
                      >
                        {(isIncome ? ['生活费', '工资', '兼职', '奖学金', '红包', '他人转入', '其他收入'] :
                          ['餐饮', '交通', '购物', '娱乐', '学习', '房租', '话费', '医疗', '其他'])
                          .map(category => <option key={category}>{category}</option>)}
                      </Form.Select>
                    </Col>
                    <Col md={2}>
                      <Form.Control
                        type="date"
                        aria-label="收支日期"
                        max={isIncome ? dateKey() : undefined}
                        required
                        value={recordForm.date}
                        onChange={(e) => setRecordForm({ ...recordForm, date: e.target.value })}
                      />
                    </Col>
                    <Col md={2}>
                      <Form.Control
                        type="text"
                        placeholder={isIncome ? '付款方（可选）' : '商户（可选）'}
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
                        <Form.Label>{isIncome ? '收入说明（可选）' : '消费内容（可选）'}</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder={isIncome ? '例如：兼职工资、奖学金' : '例如：午餐、奶茶、教材'}
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
                          placeholder={isIncome ? '备注（可选，例如：十月兼职结算）' : '备注（可选，例如：和室友吃饭）'}
                          value={recordForm.note}
                          onChange={(e) => setRecordForm({ ...recordForm, note: e.target.value })}
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  {!isIncome && <TransactionIntent value={recordForm} onChange={setRecordForm} />}
                </Form>

                {recordError && <Alert variant="danger" className="mt-3 mb-0 small">{recordError}</Alert>}

                {recordResult?.income && <Alert variant="success" className="mt-3 mb-0 small">{recordResult.message}</Alert>}
                {recordResult && !recordResult.unavailable && !recordResult.income && (
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

        <FinanceVisuals showBudgetSummary={false} monthlyBudget={monthlyBudget} monthlyCashflow={monthlyCashflow} selectedCategory={categoryFilter} onCategory={setCategoryFilter} />
        <div className="ledger-help d-flex flex-wrap gap-2 mb-4">
          <Link to="/learning?tab=decision" className="btn btn-outline-success btn-sm">买之前，比较选择</Link>
          <CoachHelp prompt="我正在查看账本，请帮我理解已记录的收支与未来安排。先问我想了解哪一部分。" />
        </div>
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
                    <h5 className="card-title mb-0">最近账单</h5><span className="small text-muted ms-2">最多显示 50 笔；上方统计包含本月全部已记录交易</span>{categoryFilter && <Button variant="link" onClick={() => setCategoryFilter('')}>{categoryFilter} · 清除筛选</Button>}
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="table table-hover recent-transactions">
                    <thead className="table-light">
                      <tr>
                        <th scope="col">日期</th>
                        <th scope="col">类别</th>
                        <th scope="col">对方</th>
                        <th scope="col">内容</th>
                        <th scope="col">备注</th>
                        <th scope="col" className="text-end">金额</th>
                        <th scope="col">回访</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center text-muted py-4">
                    还没有收支记录
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
                    <td className={`text-end fw-medium text-nowrap ${['refund', 'income'].includes(t.transaction_type) ? 'text-success' : t.transaction_type === 'transfer' ? 'text-muted' : 'text-danger'}`}>
                      {t.transaction_type === 'refund' || t.transaction_type === 'income' ? '+' : t.transaction_type === 'transfer' ? '' : '-'}¥{Number(t.amount).toLocaleString()}
                      {t.transaction_type && t.transaction_type !== 'expense' && <div className="small text-muted">{t.transaction_type === 'income' ? ({ red_packet: '红包', external_transfer: '他人转入', other_income: '其他收入' }[t.receipt_kind] || '收入') : { refund: '退款', transfer: '本人转账' }[t.transaction_type]}</div>}
                      {t.custom_category_name && <div className="small text-muted">{t.custom_category_name}</div>}
                      {t.transaction_type === 'expense' && Number(t.refunded_amount) > 0 && <div className="small text-muted">原支付 ¥{t.original_amount} · 已退 ¥{t.refunded_amount} · 实际支出 ¥{t.net_amount}</div>}
                      {t.transaction_type === 'refund' && t.related_source_id && <div className="small text-muted">关联原交易 {t.related_source_id}</div>}
                    </td>
                    <td>
                      {t.source === 'manual' ? (!t.transaction_type || t.transaction_type === 'expense' ? <TransactionReflection transactionId={t.id} saved={reflections.find(r => r.transaction_id === String(t.id))} /> : '—') : <Button size="sm" variant="link" onClick={() => setImportMode(t.transaction_type && t.transaction_type !== 'expense' ? 'receipt' : 'expense')}>修改导入记录</Button>}
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
        await refreshLedger();
        setCategoryFilter('');
      }} />}
      {importMode && <CsvImportModal entryMode={importMode} onClose={() => setImportMode(null)} onSaved={async () => { await refreshLedger(); setCategoryFilter(''); }} />}
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
        
        /* 仪表板卡片样式 */
        .dashboard-card {
          overflow: hidden;
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

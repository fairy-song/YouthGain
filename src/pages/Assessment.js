import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLearningProfile, saveLearningProfile } from '../services/learning';
import { Container, Row, Col, Card, Button, Form, ProgressBar, Badge, Spinner, Alert } from 'react-bootstrap';
import {
  FaCheckCircle, FaArrowRight, FaLightbulb,
  FaHistory, FaClipboardList, FaChartLine, FaArrowLeft, FaTrophy,
  FaSave
} from 'react-icons/fa';
import { submitAssessmentNew, getAssessmentHistory } from '../services/api';

// ─────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────

const questions = [
  ['budget', '安排生活费时，我会先确认必要开支和近期要付的钱。'],
  ['budget', '我会把红包、退款和生活费一起考虑，再决定用途。'],
  ['choice', '面对想买的东西，我能说出它满足什么需要。'],
  ['choice', '我会比较至少两个选择，并说明自己愿意接受的取舍。'],
  ['buffer', '我会留意不定期开支，并考虑可行的准备方式。'],
  ['buffer', '当收入或计划变化时，我会重新安排并保留必要生活开支。'],
  ['risk', '面对回报承诺，我会询问可能损失、费用和退出限制。'],
  ['risk', '信息不足时，我能先核实再决定，而不是只跟随别人的选择。'],
].map(([category, question], index) => ({
  id: index + 1, category, question,
  options: [
    { id: 'a', text: '还没有这样做过', score: 1 },
    { id: 'b', text: '偶尔会这样做', score: 2 },
    { id: 'c', text: '多数时候会这样做', score: 3 },
    { id: 'd', text: '经常这样做，也能解释原因', score: 4 },
  ],
}));

const CATEGORY_NAMES = {
  budget: '安排收支', choice: '理解取舍', buffer: '留有余地',
  savings: '储蓄能力',
  risk: '风险管理',
  emergency: '应急准备',
  debt: '债务管理',
  knowledge: '财务知识',
  income: '收入稳定性',
  goals: '财务目标',
  tracking: '支出追踪',
  insurance: '保险保障',
  pressure: '应对能力'
};

// 折线图的分类色板。
//
// 这 11 条分类线是叠加绘制在同一张图上的（总分线粗而醒目，
// 其余以 0.55 透明度虚线作为背景参照），所以各色之间必须有区分度，
// 不能简单用主色渐变的单色阶。
//
// 排布原则：以品牌青绿为主轴（total），其余色相环绕分布，
// 统一压低饱和度与明度，避开 SB Admin 时代那套全彩乱配色。
// 所有色值在浅底上的对比度均 >= 3:1（图形元素的可辨识下限）。
const LINE_COLORS = {
  total: '#2F7D5F',      // 品牌青绿——主线，最粗最醒目
  savings: '#2E7D8C',    // 青
  risk: '#C5755E',       // 赤陶橙（点缀色）
  emergency: '#4774A7',  // 辅助蓝
  debt: '#B24A43',       // 砖红
  knowledge: '#6B7280',  // 中性灰
  income: '#A8801F',     // 赭黄
  goals: '#7A5AA6',      // 紫
  tracking: '#4E8C4A',   // 草绿
  insurance: '#A6527C',  // 梅红
  pressure: '#5560A8',   // 靛
};

// ─────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────

function getCategoryName(category) {
  return CATEGORY_NAMES[category] || category;
}

function getCategoryColorClass(percentage) {
  if (percentage >= 75) return 'text-success fw-bold';
  if (percentage >= 50) return 'text-info fw-bold';
  if (percentage >= 25) return 'text-warning fw-bold';
  return 'text-danger fw-bold';
}

function getCategoryVariant(percentage) {
  if (percentage >= 75) return 'success';
  if (percentage >= 50) return 'info';
  if (percentage >= 25) return 'warning';
  return 'danger';
}

function getResultMessage(score) {
  return { title: '从认识自己的习惯开始', message: '这些回答反映你目前对自身习惯的看法。它们不是专业诊断或能力认证，也不衡量收入高低。选择一个想探索的主题，在真实情境里试一试。', icon: <FaLightbulb className="text-primary" size={48} />, color: 'primary', percentage: score / (questions.length * 4) * 100 };
}

function formatDate(ts) {
  if (!ts) return '未知日期';
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────
// SVG Sparkline Chart Component
// ─────────────────────────────────────────────────

const SparklineChart = ({ history }) => {
  const W = 700;
  const H = 240;
  const PADDING = { top: 20, right: 20, bottom: 40, left: 44 };
  const chartW = W - PADDING.left - PADDING.right;
  const chartH = H - PADDING.top - PADDING.bottom;

  if (!history || history.length === 0) {
    return (
      <div className="text-center py-4 text-muted">
        <FaChartLine size={40} className="mb-2 opacity-25" />
        <p className="mb-0">暂无数据，完成评估后即可查看趋势图</p>
      </div>
    );
  }

  // Reverse → chronological order for chart
  const sorted = [...history].reverse();
  const n = sorted.length;

  const xScale = (i) => PADDING.left + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW);
  const yScale = (v) => PADDING.top + chartH - (v / 100) * chartH;

  const buildPath = (values) => {
    return values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(' ');
  };

  // Collect all categories present across records
  const allCategories = Array.from(
    new Set(sorted.flatMap(r => Object.keys(r.category_scores_percentage || {})))
  );

  const totalValues = sorted.map(r => Number(r.total_score_percentage) || 0);

  // Y-axis grid lines
  const yTicks = [0, 25, 50, 75, 100];

  return (
    <div className="sparkline-wrapper">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* Grid lines */}
        {yTicks.map(tick => (
          <g key={tick}>
            <line
              x1={PADDING.left} y1={yScale(tick)}
              x2={W - PADDING.right} y2={yScale(tick)}
              stroke="var(--yg-line)" strokeWidth="1"
            />
            <text
              x={PADDING.left - 8} y={yScale(tick) + 4}
              textAnchor="end" fontSize="11" fill="var(--yg-muted)"
            >{tick}%</text>
          </g>
        ))}

        {/* X-axis labels */}
        {sorted.map((r, i) => (
          <text
            key={i}
            x={xScale(i)} y={H - 6}
            textAnchor="middle" fontSize="10" fill="var(--yg-muted)"
          >
            {formatDate(r.timestamp).slice(5)}
          </text>
        ))}

        {/* Category lines (faint, behind total) */}
        {allCategories.map(cat => {
          const values = sorted.map(r => Number((r.category_scores_percentage || {})[cat]) || 0);
          return (
            <path
              key={cat}
              d={buildPath(values)}
              fill="none"
              stroke={LINE_COLORS[cat] || 'var(--yg-line)'}
              strokeWidth="1.5"
              strokeDasharray="4 3"
              opacity="0.55"
            />
          );
        })}

        {/* Total score line (prominent) */}
        <path
          d={buildPath(totalValues)}
          fill="none"
          stroke={LINE_COLORS.total}
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data point dots for total */}
        {totalValues.map((v, i) => (
          <g key={i}>
            <circle cx={xScale(i)} cy={yScale(v)} r="5" fill="white" stroke={LINE_COLORS.total} strokeWidth="2.5" />
            <text
              x={xScale(i)} y={yScale(v) - 10}
              textAnchor="middle" fontSize="11"
              fill={LINE_COLORS.total} fontWeight="600"
            >{Math.round(v)}%</text>
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="d-flex flex-wrap gap-2 mt-2 px-2">
        <span className="legend-item">
          <span className="legend-dot" style={{ background: LINE_COLORS.total, width: 12, height: 4, borderRadius: 2, display: 'inline-block', marginRight: 4 }} />
          <small className="text-muted">总分</small>
        </span>
        {allCategories.slice(0, 6).map(cat => (
          <span key={cat} className="legend-item d-flex align-items-center gap-1">
            <span style={{ width: 10, height: 3, borderRadius: 2, display: 'inline-block', background: LINE_COLORS[cat] || 'var(--yg-line)', opacity: 0.7 }} />
            <small className="text-muted">{getCategoryName(cat)}</small>
          </span>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────
// Badge component
// ─────────────────────────────────────────────────

const EnhancedBadge = ({ children, bg, className = '' }) => (
  <Badge
    bg={bg}
    className={`custom-badge px-3 py-2 rounded-pill fw-normal position-relative overflow-hidden ${className}`}
  >
    <span className="badge-content position-relative">{children}</span>
    <span className="badge-glow" />
  </Badge>
);

// ─────────────────────────────────────────────────
// Animated background
// ─────────────────────────────────────────────────

const AnimatedBg = () => (
  <div className="animated-background">
    <div className="floating-shape shape1" />
    <div className="floating-shape shape2" />
    <div className="floating-shape shape3" />
  </div>
);

// ─────────────────────────────────────────────────
// Main Assessment Component
// ─────────────────────────────────────────────────

const Assessment = () => {
  // view: 'home' | 'quiz' | 'result' | 'history'
  const [view, setView] = useState('home');
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [score, setScore] = useState(0);
  const [categoryScores, setCategoryScores] = useState({});
  const [userName, setUserName] = useState('');

  // History state
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'success' | 'error'

  const navigate = useNavigate();

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await getAssessmentHistory();
      setHistoryData(data.history || []);
    } catch (err) {
      setHistoryError('获取历史记录失败，请检查服务是否运行。');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleAnswer = (questionId, optionId, optionScore, category) => {
    const newAnswers = {
      ...answers,
      [questionId]: { optionId, score: optionScore, category }
    };
    setAnswers(newAnswers);

    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      calculateResults(newAnswers);
      setView('result');
    }
  };

  const calculateResults = (resultAnswers) => {
    const totalScore = Object.values(resultAnswers).reduce((sum, a) => sum + a.score, 0);
    setScore(totalScore);

    const categories = {};
    const categoryCounts = {};
    Object.values(resultAnswers).forEach(answer => {
      const cat = answer.category;
      if (!categories[cat]) { categories[cat] = 0; categoryCounts[cat] = 0; }
      categories[cat] += answer.score;
      categoryCounts[cat]++;
    });

    const categoryPercentages = {};
    Object.keys(categories).forEach(cat => {
      const max = categoryCounts[cat] * 4;
      categoryPercentages[cat] = Math.round((categories[cat] / max) * 100);
    });
    setCategoryScores(categoryPercentages);
  };

  const handleSaveResult = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      const totalPct = Math.round((score / (questions.length * 4)) * 100);
      await submitAssessmentNew({
        answers,
        scores: Object.fromEntries(Object.entries(categoryScores).map(([category, pct]) => [category, pct / 25])),
        categories: { version: 2 },
        categoryScores,
        total_score_percentage: totalPct,
      });
      setSaveStatus('success');
    } catch (err) {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const handleStartCoaching = () => {
    navigate('/coach', { state: { prompt: `我刚完成理财习惯自我探索，想从${getCategoryName(Object.entries(categoryScores).sort((a, b) => a[1] - b[1])[0]?.[0])}开始练习。请先问我一个生活中的问题。` } });
  };

  const startLearning = async () => {
    setSaving(true); setSaveStatus(null);
    try {
      const profile = await getLearningProfile();
      const topic = Object.entries(categoryScores).sort((a, b) => a[1] - b[1])[0]?.[0] || 'budget';
      await saveLearningProfile({ ...profile, topic });
      navigate('/learning');
    } catch { setSaveStatus('error'); }
    finally { setSaving(false); }
  };

  const startOver = () => {
    setCurrentQuestion(0);
    setAnswers({});
    setScore(0);
    setCategoryScores({});
    setUserName('');
    setSaveStatus(null);
    setView('quiz');
  };

  const goHome = () => {
    setCurrentQuestion(0);
    setAnswers({});
    setScore(0);
    setCategoryScores({});
    setUserName('');
    setSaveStatus(null);
    setView('home');
  };

  const openHistory = () => {
    setView('history');
    fetchHistory();
  };

  // ── HOME VIEW ──
  if (view === 'home') {
    return (
      <div className="assessment-page">
        <AnimatedBg />
        <Container className="py-5">
          <Row className="justify-content-center">
            <Col md={10} lg={8}>
              <div className="text-center mb-5">
                <EnhancedBadge bg="primary" className="mb-3">
                  <span className="fw-medium text-white">理财习惯探索</span>
                </EnhancedBadge>
                <h1 className="display-5 fw-bold mb-3">心智评估中心</h1>
                <p className="lead text-muted">
                  通过八个生活问题认识自己的习惯，找到一个愿意尝试的练习。自我探索不用于专业诊断。
                </p>
              </div>

              <Row className="g-4">
                <Col md={6}>
                  <Card
                    className="border-0 rounded-4 shadow-lg h-100 home-card"
                    onClick={() => setView('quiz')}
                    style={{ cursor: 'pointer' }}
                  >
                    <Card.Body className="p-4 d-flex flex-column align-items-center text-center">
                      <div className="home-card-icon mb-3" style={{ background: 'linear-gradient(135deg, var(--yg-primary-text), var(--yg-primary-deep))' }}>
                        <FaClipboardList size={32} color="white" />
                      </div>
                      <h4 className="fw-bold mb-2">开始新评估</h4>
                      <p className="text-muted mb-4">回答8道问题，选择一个学习主题，再把方法用在生活里。</p>
                      <Button variant="primary" className="rounded-pill px-4 mt-auto btn-glow">
                        立即开始 <FaArrowRight className="ms-2" />
                      </Button>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={6}>
                  <Card
                    className="border-0 rounded-4 shadow-lg h-100 home-card"
                    onClick={openHistory}
                    style={{ cursor: 'pointer' }}
                  >
                    <Card.Body className="p-4 d-flex flex-column align-items-center text-center">
                      <div className="home-card-icon mb-3" style={{ background: 'linear-gradient(135deg, var(--yg-success), var(--yg-success-deep))' }}>
                        <FaHistory size={32} color="white" />
                      </div>
                      <h4 className="fw-bold mb-2">历史记录</h4>
                      <p className="text-muted mb-4">查看过往所有评估记录，通过折线图回看自己的回答如何变化（自评变化不等于能力提升）。</p>
                      <Button variant="success" className="rounded-pill px-4 mt-auto btn-glow-green">
                        查看历史 <FaChartLine className="ms-2" />
                      </Button>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            </Col>
          </Row>
        </Container>
        <AssessmentStyles />
      </div>
    );
  }

  // ── HISTORY VIEW ──
  if (view === 'history') {
    return (
      <div className="assessment-page">
        <AnimatedBg />
        <Container className="py-5">
          <Row className="justify-content-center">
            <Col md={11} lg={10}>
              <div className="d-flex align-items-center mb-4">
                <Button variant="outline-secondary" className="rounded-pill me-3" onClick={goHome}>
                  <FaArrowLeft className="me-2" />返回
                </Button>
                <div>
                  <h2 className="fw-bold mb-0">评估历史记录</h2>
                  <p className="text-muted mb-0 small">回看自己的回答如何变化（自评变化不等于能力提升）</p>
                </div>
              </div>

              {/* Sparkline chart card */}
              <Card className="border-0 rounded-4 shadow-lg mb-4">
                <Card.Body className="p-4">
                  <h5 className="fw-bold mb-3 d-flex align-items-center gap-2">
                    <FaChartLine className="text-primary" />
                    习惯自评变化
                  </h5>
                  {historyLoading ? (
                    <div className="text-center py-4">
                      <Spinner animation="border" variant="primary" />
                      <p className="text-muted mt-2 mb-0">加载中...</p>
                    </div>
                  ) : historyError ? (
                    <Alert variant="warning" className="mb-0">{historyError}</Alert>
                  ) : (
                    <><SparklineChart history={historyData.filter(record => record.version === 2)} />
                    <p className="small text-muted mt-2">趋势只比较新版四主题问卷；旧版记录保留在下方，不混合比较。</p></>
                  )}
                </Card.Body>
              </Card>

              {/* History list */}
              {!historyLoading && !historyError && (
                <>
                  <h5 className="fw-bold mb-3">
                    历史评估记录
                    {historyData.length > 0 && (
                      <Badge bg="secondary" className="ms-2 rounded-pill">{historyData.length} 次</Badge>
                    )}
                  </h5>
                  {historyData.length === 0 ? (
                    <Card className="border-0 rounded-4 shadow text-center py-5">
                      <Card.Body>
                        <FaClipboardList size={48} className="text-muted mb-3 opacity-25" />
                        <h5 className="text-muted">暂无历史记录</h5>
                        <p className="text-muted mb-4">完成第一次评估后，记录将显示在这里。</p>
                        <Button variant="primary" className="rounded-pill px-4" onClick={() => setView('quiz')}>
                          立即评估
                        </Button>
                      </Card.Body>
                    </Card>
                  ) : (
                    <Row className="g-3">
                      {historyData.map((record, index) => {
                        const pct = Number(record.total_score_percentage) || 0;
                        const variant = getCategoryVariant(pct);
                        const catScores = record.category_scores_percentage || {};
                        return (
                          <Col xs={12} key={record.id || index}>
                            <Card className="border-0 rounded-4 shadow history-card">
                              <Card.Body className="p-4">
                                <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
                                  <div>
                                    <span className="text-muted small">
                                      第 {historyData.length - index} 次探索 · {formatDate(record.timestamp)} · {record.version === 2 ? '四主题自评' : '旧版记录'}
                                    </span>
                                    {index === 0 && (
                                      <Badge bg="primary" className="ms-2 rounded-pill">最新</Badge>
                                    )}
                                  </div>
                                  <div className="d-flex align-items-center gap-2">
                                    <FaTrophy className={`text-${variant}`} />
                                    <span className={`fw-bold fs-5 text-${variant}`}>{Math.round(pct)}%</span>
                                  </div>
                                </div>

                                <ProgressBar
                                  now={pct}
                                  variant={variant}
                                  className="progress-bar-thick mb-3"
                                />

                                {Object.keys(catScores).length > 0 && (
                                  <Row className="g-2">
                                    {Object.entries(catScores).map(([cat, val]) => (
                                      <Col xs={6} sm={4} md={3} key={cat}>
                                        <div className="cat-chip">
                                          <div className="cat-chip-name">{getCategoryName(cat)}</div>
                                          <div className={`cat-chip-val ${getCategoryColorClass(val)}`}>{val}%</div>
                                        </div>
                                      </Col>
                                    ))}
                                  </Row>
                                )}
                              </Card.Body>
                            </Card>
                          </Col>
                        );
                      })}
                    </Row>
                  )}
                </>
              )}
            </Col>
          </Row>
        </Container>
        <AssessmentStyles />
      </div>
    );
  }

  // ── RESULT VIEW ──
  if (view === 'result') {
    const result = getResultMessage(score);
    const maxScore = questions.length * 4;
    const pct = Math.round((score / maxScore) * 100);

    return (
      <div className="assessment-page">
        <AnimatedBg />
        <Container className="py-5">
          <Row className="justify-content-center">
            <Col md={10} lg={8}>
              <Card className="border-0 rounded-4 shadow-lg overflow-hidden">
                <Card.Header className={`bg-gradient-${result.color} text-white p-4 text-center`}>
                  <h2 className="fw-bold mb-0">理财习惯自我探索</h2>
                </Card.Header>

                <Card.Body className="p-4 p-lg-5">
                  <div className="text-center mb-4">
                    {result.icon}
                    <h3 className={`mt-3 fw-bold text-${result.color}`}>{result.title}</h3>
                  </div>

                  <p className="fs-5 mb-4">{result.message}</p>

                  <Alert variant="info">
                    <strong>本周可以先探索：{getCategoryName(Object.entries(categoryScores).sort((a, b) => a[1] - b[1])[0]?.[0])}</strong>
                    <p className="mt-2 mb-2">这是你自评中较少实践的主题。用一个真实情境尝试一次，看看是否适合你，也可以在成长页更换主题。</p>
                    <Button disabled={saving} onClick={startLearning}>选择这个主题，开始练习</Button>
                  </Alert>
                  {/* Total score */}
                  <div className="mb-4">
                    <h4 className="mb-3">本次习惯自评</h4>
                    <div className="d-flex justify-content-between mb-2">
                      <span>总分: {score} / {maxScore}</span>
                      <span className={`fw-bold text-${result.color}`}>{pct}%</span>
                    </div>
                    <ProgressBar now={pct} variant={result.color} className="progress-bar-thick mb-4" />
                  </div>

                  {/* Category scores */}
                  <div className="mb-4">
                    <h4 className="mb-3">各主题自评</h4>
                    {Object.entries(categoryScores).map(([category, percentage]) => (
                      <div key={category} className="mb-3">
                        <div className="d-flex justify-content-between mb-1">
                          <span>{getCategoryName(category)}</span>
                          <span className={getCategoryColorClass(percentage)}>{percentage}%</span>
                        </div>
                        <ProgressBar now={percentage} variant={getCategoryVariant(percentage)} className="progress-bar-thick" />
                      </div>
                    ))}
                  </div>

                  {/* Save result */}
                  <div className="mb-4">
                    <h4 className="mb-3">保存评估结果</h4>
                    <p className="text-muted small mb-3">将本次结果保存到历史记录，以便日后追踪进步。</p>
                    {saveStatus === 'success' && (
                      <Alert variant="success" className="rounded-3">
                        <FaCheckCircle className="me-2" />已保存到历史记录！
                      </Alert>
                    )}
                    {saveStatus === 'error' && (
                      <Alert variant="danger" className="rounded-3">
                        保存失败，请检查服务是否正常运行。
                      </Alert>
                    )}
                    {saveStatus !== 'success' && (
                      <div className="d-flex align-items-center">
                        <Button
                          variant="outline-primary"
                          className="rounded-pill px-4 me-3"
                          onClick={handleSaveResult}
                          disabled={saving}
                        >
                          {saving ? <Spinner animation="border" size="sm" className="me-2" /> : <FaSave className="me-2" />}
                          保存结果
                        </Button>
                        <Button
                          variant="outline-secondary"
                          className="rounded-pill px-4"
                          onClick={openHistory}
                        >
                          <FaHistory className="me-2" />查看历史
                        </Button>
                      </div>
                    )}
                    {saveStatus === 'success' && (
                      <Button
                        variant="outline-success"
                        className="rounded-pill px-4"
                        onClick={openHistory}
                      >
                        <FaHistory className="me-2" />查看历史
                      </Button>
                    )}
                  </div>

                  {/* Start coaching */}
                  <div className="mb-4">
                    <h4 className="mb-3">开始财务教练会话</h4>
                    <Form.Control
                      type="text"
                      placeholder="请输入您的名字（可选）"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      className="mb-3 rounded-pill"
                    />
                  </div>

                  <div className="d-flex flex-column flex-md-row gap-3 justify-content-center">
                    <Button
                      variant={result.color}
                      size="lg"
                      className="rounded-pill btn-glow px-4 py-2 d-flex align-items-center justify-content-center"
                      onClick={handleStartCoaching}
                    >
                      开始AI财务教练对话 <FaArrowRight className="ms-2" />
                    </Button>
                    <Button
                      variant="outline-secondary"
                      size="lg"
                      className="rounded-pill px-4 py-2"
                      onClick={startOver}
                    >
                      重新评估
                    </Button>
                    <Button
                      variant="outline-dark"
                      size="lg"
                      className="rounded-pill px-4 py-2"
                      onClick={goHome}
                    >
                      返回主页
                    </Button>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Container>
        <AssessmentStyles />
      </div>
    );
  }

  // ── QUIZ VIEW ──
  const question = questions[currentQuestion];

  return (
    <div className="assessment-page">
      <AnimatedBg />
      <Container className="py-5">
        <Row className="justify-content-center">
          <Col md={10} lg={8}>
            <div className="d-flex align-items-center mb-4">
              <Button variant="outline-secondary" className="rounded-pill me-3" onClick={goHome}>
                <FaArrowLeft className="me-2" />主页
              </Button>
              <div className="text-center flex-grow-1">
                <EnhancedBadge bg="primary" className="mb-2">
                  <span className="fw-medium text-white">财务评估</span>
                </EnhancedBadge>
                <h1 className="display-6 fw-bold mb-0">理财习惯问卷</h1>
              </div>
            </div>

            <Card className="border-0 rounded-4 shadow-lg">
              <Card.Body className="p-4 p-lg-5">
                <div className="mb-4">
                  <div className="d-flex justify-content-between mb-2">
                    <span className="fs-5 fw-medium">{`问题 ${currentQuestion + 1} / ${questions.length}`}</span>
                    <span className="badge bg-primary rounded-pill px-3 py-2">{getCategoryName(question.category)}</span>
                  </div>
                  <ProgressBar
                    now={((currentQuestion + 1) / questions.length) * 100}
                    variant="primary"
                    className="progress-bar-thick mb-4"
                  />

                  <h2 className="fs-4 fw-bold mb-4">{question.question}</h2>

                  <div className="d-flex flex-column gap-3">
                    {question.options.map((option) => (
                      <Button
                        key={option.id}
                        variant="outline-primary"
                        className="text-start p-3 rounded-3 option-button d-flex align-items-center justify-content-between"
                        onClick={() => handleAnswer(question.id, option.id, option.score, question.category)}
                      >
                        <span>{option.text}</span>
                        <FaArrowRight className="option-arrow" />
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="d-flex justify-content-between align-items-center mt-5">
                  <Button
                    variant="outline-secondary"
                    className="rounded-pill px-3 py-2"
                    onClick={() => currentQuestion > 0 && setCurrentQuestion(currentQuestion - 1)}
                    disabled={currentQuestion === 0}
                  >
                    上一题
                  </Button>
                  <span className="text-muted">{currentQuestion + 1} 共 {questions.length} 题</span>
                  {currentQuestion < questions.length - 1 && (
                    <Button
                      variant="outline-primary"
                      className="rounded-pill px-3 py-2"
                      onClick={() => setCurrentQuestion(currentQuestion + 1)}
                    >
                      跳过此题
                    </Button>
                  )}
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
      <AssessmentStyles />
    </div>
  );
};

// ─────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────

const AssessmentStyles = () => (
  <style>{`
    .assessment-page {
      position: relative;
      min-height: 100vh;
      padding-bottom: 3rem;
    }

    .animated-background {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
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

    .shape1 { width: 300px; height: 300px; top: -150px; left: 10%; animation-delay: 0s; }
    .shape2 { width: 200px; height: 200px; top: 30%; right: -100px; animation-delay: 2s; background: rgba(var(--yg-primary-rgb),0.05); }
    .shape3 { width: 250px; height: 250px; bottom: -125px; left: 20%; animation-delay: 4s; background: rgba(var(--yg-primary-rgb),0.05); }

    @keyframes float {
      0%   { transform: translateY(0) rotate(0deg) scale(1); }
      50%  { transform: translateY(30px) rotate(10deg) scale(1.05); }
      100% { transform: translateY(0) rotate(0deg) scale(1); }
    }

    .progress-bar-thick { height: 8px; border-radius: 4px; }

    /* Gradient header colours */
    .bg-gradient-success  { background: linear-gradient(135deg, var(--yg-success) 0%, var(--yg-success-deep) 100%); }
    .bg-gradient-primary  { background: linear-gradient(135deg, var(--yg-primary-text) 0%, var(--yg-primary-deep) 100%); }
    /* 渐变起点用更深的档位：这几处都配 text-white，
       起点若用 500 档白字只有 2.5-3.7:1，读不清 */
    .bg-gradient-info     { background: linear-gradient(135deg, var(--yg-secondary-hover) 0%, var(--yg-secondary-deep) 100%); }
    .bg-gradient-warning  { background: linear-gradient(135deg, var(--yg-accent-text) 0%, var(--yg-accent-deep) 100%); }
    .bg-gradient-secondary{ background: linear-gradient(135deg, var(--yg-muted) 0%, #5A605E 100%); }

    /* Glow buttons */
    .btn-glow {
      box-shadow: 0 0 10px rgba(var(--yg-primary-rgb),0.3);
      transition: all 0.3s ease;
      border: none;
    }
    .btn-glow:hover { box-shadow: 0 0 20px rgba(var(--yg-primary-rgb),0.5); transform: translateY(-2px); }
    .btn-glow-green {
      box-shadow: 0 0 10px rgba(var(--yg-success-rgb),0.3);
      transition: all 0.3s ease;
      border: none;
    }
    .btn-glow-green:hover { box-shadow: 0 0 20px rgba(var(--yg-success-rgb),0.5); transform: translateY(-2px); }

    /* Option buttons */
    .option-button { transition: all 0.3s ease; }
    .option-button:hover { background-color: var(--yg-primary); color: white; transform: translateY(-2px); }
    .option-arrow { opacity: 0; transform: translateX(-10px); transition: all 0.3s ease; }
    .option-button:hover .option-arrow { opacity: 1; transform: translateX(0); }

    /* Home cards */
    .home-card { transition: transform 0.25s ease, box-shadow 0.25s ease; }
    .home-card:hover { transform: translateY(-6px); box-shadow: 0 1rem 2rem rgba(0,0,0,0.12) !important; }
    .home-card-icon {
      width: 72px; height: 72px;
      border-radius: 20px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 6px 16px rgba(0,0,0,0.15);
    }

    /* History cards */
    .history-card { transition: transform 0.2s ease; }
    .history-card:hover { transform: translateY(-3px); }

    /* Category chip */
    .cat-chip {
      background: var(--yg-surface);
      border-radius: 10px;
      padding: 6px 10px;
      font-size: 0.78rem;
    }
    .cat-chip-name { color: var(--yg-muted); margin-bottom: 2px; }
    .cat-chip-val { font-weight: 700; font-size: 0.88rem; }

    /* Badge */
    .custom-badge {
      display: inline-flex; align-items: center; justify-content: center;
      background-image: linear-gradient(to right, rgba(255,255,255,0.1), rgba(255,255,255,0.2));
      backdrop-filter: blur(5px);
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      transition: all 0.3s ease;
    }
    .badge-content { z-index: 1; }
    .badge-glow {
      position: absolute; top: -50%; left: -50%; width: 200%; height: 200%;
      background: linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0) 100%);
      transform: rotate(30deg);
      animation: badgeGlow 3s ease-in-out infinite;
    }
    @keyframes badgeGlow {
      0%   { transform: translateX(-100%) rotate(30deg); }
      100% { transform: translateX(100%) rotate(30deg); }
    }

    /* Sparkline */
    .sparkline-wrapper { overflow-x: auto; }
    .legend-item { display: flex; align-items: center; gap: 4px; }
  `}</style>
);

export default Assessment;

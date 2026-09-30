import { knowledgeCategories, legacyCategories } from '../services/knowledgeCategories';
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';


import {
  adminGetStats, adminListUsers, adminGetUser, adminSetUserStatus, adminDeleteUser,
  adminListKbArticles, adminCreateKbArticle, adminUpdateKbArticle, adminDeleteKbArticle,
  adminGetCoachConfig, adminSaveCoachConfig, adminResetCoachConfig,
} from '../services/api';
import {
  FaChartBar, FaUsers, FaBook, FaSearch, FaTrashAlt,
  FaPlus, FaEdit, FaBan, FaCheckCircle, FaSyncAlt,
  FaUserShield, FaClipboardCheck, FaComments, FaCreditCard, FaBullseye, FaFileAlt,
} from 'react-icons/fa';

// 统计卡片配置：icon / 标题 / 字段名 / 色值
const STAT_CARDS = [
  { key: 'total_users', label: '注册用户', icon: <FaUsers />, gradient: 'linear-gradient(135deg,#63B995,#1F4A38)' },
  { key: 'assessment_completed_users', label: '完成评估用户', icon: <FaClipboardCheck />, gradient: 'linear-gradient(135deg,#5488C4,#2E496C)' },
  { key: 'total_assessments', label: '评估记录', icon: <FaChartBar />, gradient: 'linear-gradient(135deg,#E88A6E,#6C3528)' },
  { key: 'total_learning_entries', label: '理财成长记录', icon: <FaBook />, gradient: 'linear-gradient(135deg,#7FC8A9,#3A7D5F)' },
  { key: 'total_transactions', label: '消费记录', icon: <FaCreditCard />, gradient: 'linear-gradient(135deg,#9BB8E0,#456FA3)' },
  { key: 'total_goals', label: '理财目标', icon: <FaBullseye />, gradient: 'linear-gradient(135deg,#F2B8A0,#C5755E)' },
  { key: 'total_coach_messages', label: 'AI 教练对话', icon: <FaComments />, gradient: 'linear-gradient(135deg,#8FD3B8,#2F855A)' },
  { key: 'total_kb_articles', label: '知识库文章', icon: <FaFileAlt />, gradient: 'linear-gradient(135deg,#A8C8B8,#30775A)' },
];

const KB_CATEGORIES = [{ id: '', name: '未分类' }, ...knowledgeCategories, ...legacyCategories];

const EMPTY_KB_FORM = {
  title: '', summary: '', content: '', category: '',
  tags: '', image: '', readTime: 5, date: new Date().toISOString().slice(0, 10),
};

const AdminDashboard = ({ section = 'stats' }) => (
  <>
    {section === 'stats' && <StatsTab />}
    {section === 'users' && <UsersTab />}
    {section === 'kb' && <KbTab />}
    {section === 'coach' && <CoachConfigTab />}
  </>
);

// ============================================================
// 平台统计
// ============================================================
// 数字滚动动画 hook：从 0 平滑滚动到目标值
const useCountUp = (target, duration = 900) => {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setValue(Math.round((target || 0) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
};

const StatCard = ({ card, value }) => {
  const display = useCountUp(value || 0);
  return (
    <div className="stat-card">
      <div className="stat-card-icon" style={{ background: card.gradient }}>{card.icon}</div>
      <div className="stat-card-value">{display}</div>
      <div className="stat-card-label">{card.label}</div>
    </div>
  );
};

// 用户增长趋势 SVG 折线图
const GrowthTrend = ({ data }) => {
  if (!data || data.length === 0) return <div className="chart-empty">近 14 天暂无新增用户数据</div>;
  const W = 600, H = 180, P = 24;
  const max = Math.max(1, ...data.map(d => d.count));
  const stepX = (W - P * 2) / Math.max(1, data.length - 1);
  const pts = data.map((d, i) => [P + i * stepX, H - P - (d.count / max) * (H - P * 2)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = line + ` L${pts[pts.length-1][0].toFixed(1)},${H-P} L${pts[0][0].toFixed(1)},${H-P} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 180 }}>
      {[0.25, 0.5, 0.75, 1].map(r => (
        <line key={r} x1={P} x2={W-P} y1={H-P-(H-P*2)*r} y2={H-P-(H-P*2)*r} stroke="#eef3f0" strokeWidth="1" />
      ))}
      <path d={area} fill="url(#ygTrendGrad)" />
      <defs>
        <linearGradient id="ygTrendGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#63B995" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#63B995" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={line} fill="none" stroke="#63B995" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="4" fill="#fff" stroke="#63B995" strokeWidth="2.5" />
          <text x={p[0]} y={p[1]-10} textAnchor="middle" fontSize="11" fontWeight="700" fill="#1F4A38">{data[i].count}</text>
        </g>
      ))}
      {data.map((d, i) => (
        <text key={i} x={P+i*stepX} y={H-6} textAnchor="middle" fontSize="10" fill="#8aa398">{d.date.slice(5)}</text>
      ))}
    </svg>
  );
};

// 消费分类横向条形
const CategoryBars = ({ data }) => {
  if (!data || data.length === 0) return <div className="chart-empty">暂无消费数据</div>;
  const max = Math.max(1, ...data.map(d => d.total_amount));
  const palette = ['#63B995', '#5488C4', '#E88A6E', '#B79CE8', '#E8C96E', '#7FB5AD'];
  return data.map((c, i) => (
    <div key={c.category} className="cat-bar-row">
      <div className="cat-bar-head">
        <span style={{ fontWeight: 600 }}>{c.category}</span>
        <span className="text-muted">¥{c.total_amount} · {c.count} 笔</span>
      </div>
      <div className="cat-bar-track">
        <div className="cat-bar-fill" style={{ width: (c.total_amount / max * 100) + '%', background: palette[i % palette.length] }} />
      </div>
    </div>
  ));
};

// 后悔消费洞察条形
const RegretBars = ({ data }) => {
  if (!data || data.length === 0) return <div className="chart-empty">暂无后悔消费数据</div>;
  const worst = data[0];
  return (
    <>
      <div className="regret-banner">
        💡 「{worst.category}」类后悔率最高，达 <b>{worst.regret_rate}%</b>（{worst.regret_count}/{worst.total_count} 笔）
      </div>
      {data.map((r) => (
        <div key={r.category} className="cat-bar-row">
          <div className="cat-bar-head">
            <span style={{ fontWeight: 600 }}>{r.category}</span>
            <span className="text-muted">{r.regret_count}/{r.total_count} 笔后悔</span>
          </div>
          <div className="cat-bar-track">
            <div className="cat-bar-fill" style={{ width: Math.max(4, r.regret_rate) + '%', background: r.regret_rate >= 50 ? '#E88A6E' : '#E8C96E' }} />
          </div>
        </div>
      ))}
    </>
  );
};

const StatsTab = () => {
  const [stats, setStats] = useState(null);
  const [recentUsers, setRecentUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, u] = await Promise.all([adminGetStats(), adminListUsers()]);
      setStats(s);
      const list = (u.users || [])
        .slice()
        .sort((a, b) => new Date(b.profile?.createdAt || 0) - new Date(a.profile?.createdAt || 0))
        .slice(0, 5);
      setRecentUsers(list);
    } catch (e) {
      setError('读取统计失败，请确认后端服务已启动');
      console.error('读取统计失败:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="text-muted">平台整体数据一览</div>
        <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={load} disabled={loading}>
          <FaSyncAlt className={loading ? 'spin' : ''} /> 刷新
        </button>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {loading && (
        <div className="row g-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div className="col-6 col-md-4 col-lg-3" key={i}>
              <div className="skeleton-card">
                <div className="skeleton-block" style={{ width: 44, height: 44, borderRadius: 14, marginBottom: 14 }} />
                <div className="skeleton-block" style={{ width: 60, height: 26, marginBottom: 8 }} />
                <div className="skeleton-block" style={{ width: 80, height: 14 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && stats && (
        <>
          <div className="row g-3 admin-stagger">
            {STAT_CARDS.map((card) => (
              <div className="col-6 col-md-4 col-lg-3" key={card.key}>
                <StatCard card={card} value={stats[card.key] ?? 0} />
              </div>
            ))}
          </div>

          <div className="admin-overview-row">
            <div className="admin-subcard">
              <div className="admin-subcard-title">
                最新注册用户
                <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--yg-muted)' }}>最近 5 位</span>
              </div>
              {recentUsers.length === 0 && <div style={{ fontSize: 13, color: 'var(--yg-muted)' }}>暂无用户</div>}
              {recentUsers.map((u) => (
                <div className="recent-user-item" key={u.uid}>
                  <div className="recent-avatar">{((u.profile?.displayName || u.profile?.email || '?')[0]).toUpperCase()}</div>
                  <div className="recent-user-meta">
                    <div className="recent-user-name">{u.profile?.displayName || '未命名'}</div>
                    <div className="recent-user-email">{u.profile?.email || u.uid}</div>
                  </div>
                  <div className="recent-user-time">{formatDate(u.profile?.createdAt)}</div>
                </div>
              ))}
            </div>

            <div className="admin-subcard">
              <div className="admin-subcard-title">快捷操作</div>
              <Link to="/admin/users" className="quick-action"><FaUsers /> 用户管理</Link>
              <Link to="/admin/knowledge" className="quick-action"><FaBook /> 知识库管理</Link>
            </div>
          </div>

          <div className="row g-3 mt-1">
            <div className="col-12">
              <div className="admin-subcard">
                <div className="admin-subcard-title">用户增长趋势 <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--yg-muted)' }}>近 14 天每日新增</span></div>
                <GrowthTrend data={stats.growth_trend || []} />
              </div>
            </div>
            <div className="col-12 col-lg-6">
              <div className="admin-subcard">
                <div className="admin-subcard-title">消费分类分布 <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--yg-muted)' }}>全站金额</span></div>
                <CategoryBars data={stats.category_breakdown || []} />
              </div>
            </div>
            <div className="col-12 col-lg-6">
              <div className="admin-subcard">
                <div className="admin-subcard-title">后悔消费洞察 <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--yg-muted)' }}>AI 教练核心价值</span></div>
                <RegretBars data={stats.regret_breakdown || []} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================
// 用户管理
// ============================================================
const UsersTab = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(null); // 用户详情弹窗
  const [detailTab, setDetailTab] = useState('overview');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminListUsers();
      setUsers(data.users || []);
    } catch (e) {
      setError('读取用户列表失败，请确认后端服务已启动');
      console.error('读取用户列表失败:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStatus = async (uid, disabled) => {
    if (!window.confirm(`确定要${disabled ? '停用' : '启用'}该用户吗？${disabled ? '停用后该用户将无法访问任何功能。' : ''}`)) return;
    try {
      await adminSetUserStatus(uid, disabled);
      setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, disabled } : u)));
    } catch (e) {
      alert(e.response?.data?.message || '操作失败');
    }
  };

  const handleDelete = async (uid) => {
    if (!window.confirm('确定要删除该用户吗？其全部业务数据（评估/目标/消费/学习记录）将一并删除，且不可恢复！')) return;
    try {
      await adminDeleteUser(uid);
      setUsers((prev) => prev.filter((u) => u.uid !== uid));
      if (detail && detail.uid === uid) setDetail(null);
    } catch (e) {
      alert(e.response?.data?.message || '删除失败');
    }
  };

  const showDetail = async (uid) => {
    try {
      const data = await adminGetUser(uid);
      setDetail(data);
      setDetailTab('overview');
    } catch (e) {
      alert(e.response?.data?.message || '读取用户详情失败');
    }
  };

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const email = (u.profile?.email || '').toLowerCase();
    const name = (u.profile?.displayName || '').toLowerCase();
    return email.includes(q) || name.includes(q) || u.uid.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
        <div className="input-group" style={{ maxWidth: 320 }}>
          <span className="input-group-text bg-white"><FaSearch /></span>
          <input
            type="text"
            className="form-control"
            placeholder="搜索邮箱 / 昵称 / UID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={load} disabled={loading}>
          <FaSyncAlt className={loading ? 'spin' : ''} /> 刷新
        </button>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}
      {loading && <div className="text-center py-5 text-muted">用户列表加载中...</div>}
      {!loading && (
        <div className="table-responsive">
          <table className="table align-middle table-hover" style={{ fontSize: '0.9rem' }}>
            <thead style={{ background: 'var(--yg-surface-alt)' }}>
              <tr>
                <th>用户</th>
                <th>注册时间</th>
                <th>最后登录</th>
                <th>评估</th>
                <th>状态</th>
                <th className="text-end">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center text-muted py-4">没有匹配的用户</td></tr>
              )}
              {filtered.map((u) => (
                <tr key={u.uid} style={u.disabled ? { opacity: 0.6 } : undefined}>
                  <td>
                    <div className="fw-medium" style={{ color: 'var(--yg-ink)' }}>{u.profile?.displayName || '—'}</div>
                    <div className="text-muted" style={{ fontSize: '0.8rem' }}>{u.profile?.email || u.uid}</div>
                  </td>
                  <td className="text-muted">{formatDate(u.profile?.createdAt)}</td>
                  <td className="text-muted">{formatDate(u.profile?.lastLogin)}</td>
                  <td>
                    {u.profile?.assessmentCompleted
                      ? <span className="badge" style={{ background: 'var(--yg-primary-subtle)', color: 'var(--yg-primary-text)' }}>已完成</span>
                      : <span className="badge text-bg-light">未完成</span>}
                  </td>
                  <td>
                    {u.disabled
                      ? <span className="badge text-bg-danger">已停用</span>
                      : <span className="badge" style={{ background: 'var(--yg-success)' }}>正常</span>}
                  </td>
                  <td className="text-end">
                    <button type="button" className="btn btn-sm btn-outline-secondary me-1" onClick={() => showDetail(u.uid)}>详情</button>
                    <button
                      type="button"
                      className={`btn btn-sm me-1 ${u.disabled ? 'btn-outline-success' : 'btn-outline-warning'}`}
                      onClick={() => handleStatus(u.uid, !u.disabled)}
                    >
                      {u.disabled ? <><FaCheckCircle /> 启用</> : <><FaBan /> 停用</>}
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(u.uid)}>
                      <FaTrashAlt /> 删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 用户详情弹窗：概览 + 消费/目标/成长明细 */}
      {detail && (
        <div className="modal d-block" tabIndex="-1" style={{ background: 'rgba(20,35,30,0.5)' }} onClick={() => setDetail(null)}>
          <div className="modal-dialog modal-xl modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content" style={{ borderRadius: '20px', overflow: 'hidden', border: 'none' }}>
              <div style={{ background: 'linear-gradient(135deg,#63B995,#1F4A38)', padding: '22px 26px', color: '#fff' }}>
                <div className="d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center gap-3">
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 20 }}>
                      {((detail.profile?.displayName || detail.profile?.email || '?')[0]).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{detail.profile?.displayName || '未命名用户'}</div>
                      <div style={{ fontSize: 13, opacity: 0.85 }}>{detail.profile?.email || detail.uid}</div>
                    </div>
                  </div>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setDetail(null)} />
                </div>
              </div>

              <div className="detail-tabs">
                {[
                  ['overview', '概览'],
                  ['transactions', `消费记录 ${detail.transactions?.length || 0}`],
                  ['goals', `理财目标 ${detail.goals?.length || 0}`],
                  ['learning', `成长记录 ${detail.learning_entries?.length || 0}`],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`detail-tab${detailTab === key ? ' is-active' : ''}`}
                    onClick={() => setDetailTab(key)}
                  >{label}</button>
                ))}
              </div>

              <div style={{ padding: '22px 26px', maxHeight: '55vh', overflowY: 'auto' }}>
                {detailTab === 'overview' && (
                  <>
                    <div className="insight-card">
                      <div className="insight-title">🤖 AI 用户画像</div>
                      <div className="insight-body">{buildUserInsight(detail)}</div>
                    </div>
                    <div className="row mb-3 mt-3" style={{ fontSize: '0.9rem' }}>
                      <div className="col-sm-6 mb-2"><span className="text-muted">注册时间：</span>{formatDate(detail.profile?.createdAt)}</div>
                      <div className="col-sm-6 mb-2"><span className="text-muted">最后登录：</span>{formatDate(detail.profile?.lastLogin)}</div>
                      <div className="col-sm-6 mb-2"><span className="text-muted">状态：</span>{detail.disabled ? '已停用' : '正常'}</div>
                      <div className="col-sm-6 mb-2"><span className="text-muted">评估：</span>{detail.profile?.assessmentCompleted ? '已完成' : '未完成'}</div>
                    </div>
                    {detail.data_summary && (
                      <div className="d-flex flex-wrap gap-2">
                        {Object.entries(detail.data_summary).map(([k, v]) => (
                          <span key={k} className="badge rounded-pill" style={{ background: 'var(--yg-primary-subtle)', color: 'var(--yg-primary-text)', padding: '6px 12px' }}>
                            {DATA_LABELS[k] || k}: {v}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {detailTab === 'transactions' && (
                  <>
                    {(!detail.transactions || detail.transactions.length === 0) && <div className="text-muted text-center py-4">暂无消费记录</div>}
                    {(detail.transactions || []).map((t, i) => (
                      <div key={t.id || i} className="detail-row">
                        <div className="d-flex justify-content-between align-items-center">
                          <div>
                            <div style={{ fontWeight: 600 }}>{t.merchant || t.category || '未命名消费'}</div>
                            <div className="text-muted" style={{ fontSize: 12 }}>{t.category} · {t.date || formatDate(t.timestamp)}</div>
                          </div>
                          <div style={{ fontWeight: 700, color: 'var(--yg-danger-text)' }}>-¥{t.amount}</div>
                        </div>
                        {t.note && <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>备注：{t.note}</div>}
                        {t.regret && <span className="badge rounded-pill" style={{ background: 'var(--yg-accent-subtle)', color: 'var(--yg-accent-text)', fontSize: 11 }}>后悔消费</span>}
                      </div>
                    ))}
                  </>
                )}

                {detailTab === 'goals' && (
                  <>
                    {(!detail.goals || detail.goals.length === 0) && <div className="text-muted text-center py-4">暂无理财目标</div>}
                    {(detail.goals || []).map((g, i) => {
                      const pct = g.target_amount ? Math.min(100, Math.round((g.current_amount || 0) / g.target_amount * 100)) : 0;
                      return (
                        <div key={g.id || i} className="detail-row">
                          <div className="d-flex justify-content-between">
                            <span style={{ fontWeight: 600 }}>{g.title || '未命名目标'}</span>
                            <span style={{ fontWeight: 700, color: 'var(--yg-primary-text)' }}>{pct}%</span>
                          </div>
                          <div className="progress mt-2" style={{ height: 8 }}>
                            <div className="progress-bar" role="progressbar" style={{ width: pct + '%', background: 'var(--yg-primary)' }} />
                          </div>
                          <div className="text-muted mt-1" style={{ fontSize: 12 }}>
                            ¥{g.current_amount || 0} / ¥{g.target_amount || 0}{g.deadline ? ` · 截止 ${g.deadline}` : ''}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {detailTab === 'learning' && (
                  <>
                    {(!detail.learning_entries || detail.learning_entries.length === 0) && <div className="text-muted text-center py-4">暂无成长记录</div>}
                    {(detail.learning_entries || []).map((e, i) => {
                      const lbl = learningLabel(e.key);
                      return (
                        <div key={i} className="detail-row">
                          <span className="badge rounded-pill me-2" style={{ background: 'var(--yg-secondary-subtle)', color: 'var(--yg-secondary-text)', fontSize: 11 }}>
                            {lbl.type}
                          </span>
                          <span style={{ fontSize: 13 }}>{lbl.text}</span>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DATA_LABELS = {
  assessments: '评估记录', goals: '目标', coach_messages: 'AI对话',
  transactions: '消费记录', learning_entries: '成长记录',
};

// ============================================================
// 知识库管理
// ============================================================
const KbTab = () => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null=不弹窗，false=新增，对象=编辑
  const [form, setForm] = useState(EMPTY_KB_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminListKbArticles();
      setArticles(data.articles || []);
    } catch (e) {
      setError('读取知识库失败，请确认后端服务已启动');
      console.error('读取知识库失败:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setForm(EMPTY_KB_FORM);
    setEditing(false);
  };

  const openEdit = (article) => {
    setForm({
      title: article.title || '',
      summary: article.summary || '',
      content: article.content || '',
      category: article.category || '',
      tags: Array.isArray(article.tags) ? article.tags.join(',') : (article.tags || ''),
      image: article.image || '',
      readTime: article.readTime || 5,
      date: (article.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
    });
    setEditing(article);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return alert('请填写文章标题');
    setSaving(true);
    try {
      if (editing === false) {
        await adminCreateKbArticle(form);
      } else {
        await adminUpdateKbArticle(editing.id, form);
      }
      setEditing(null);
      await load();
    } catch (e) {
      alert(e.response?.data?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (article) => {
    if (!window.confirm(`确定删除文章《${article.title}》吗？`)) return;
    try {
      await adminDeleteKbArticle(article.id);
      await load();
    } catch (e) {
      alert(e.response?.data?.message || '删除失败');
    }
  };

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
        <div className="text-muted">共 {articles.length} 篇文章</div>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={load} disabled={loading}>
            <FaSyncAlt className={loading ? 'spin' : ''} /> 刷新
          </button>
          <button type="button" className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1" style={{ background: 'var(--yg-primary)', borderColor: 'var(--yg-primary)' }} onClick={openCreate}>
            <FaPlus /> 新增文章
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}
      {loading && <div className="text-center py-5 text-muted">知识库加载中...</div>}
      {!loading && articles.length === 0 && (
        <div className="text-center py-5 text-muted">
          <FaBook style={{ fontSize: '2.5rem', opacity: 0.35 }} className="mb-2 d-block mx-auto" />
          知识库暂无文章，点击「新增文章」发布第一篇
        </div>
      )}
      {!loading && articles.length > 0 && (
        <div className="table-responsive">
          <table className="table align-middle table-hover" style={{ fontSize: '0.9rem' }}>
            <thead style={{ background: 'var(--yg-surface-alt)' }}>
              <tr>
                <th>标题</th>
                <th>分类</th>
                <th>标签</th>
                <th>发布时间</th>
                <th className="text-end">操作</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="fw-medium" style={{ color: 'var(--yg-ink)' }}>{a.title}</div>
                    {a.summary && <div className="text-muted text-truncate" style={{ fontSize: '0.8rem', maxWidth: 420 }}>{a.summary}</div>}
                  </td>
                  <td>{KB_CATEGORIES.find((c) => c.id === a.category)?.name || a.category || '未分类'}</td>
                  <td>
                    {Array.isArray(a.tags) && a.tags.length > 0
                      ? a.tags.map((t) => <span key={t} className="badge rounded-pill me-1" style={{ background: 'var(--yg-primary-subtle)', color: 'var(--yg-primary-text)' }}>{t}</span>)
                      : <span className="text-muted">—</span>}
                  </td>
                  <td className="text-muted">{a.date || formatDate(a.createdAt)}</td>
                  <td className="text-end">
                    <button type="button" className="btn btn-sm btn-outline-secondary me-1" onClick={() => openEdit(a)}><FaEdit /> 编辑</button>
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(a)}><FaTrashAlt /> 删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      {editing !== null && (
        <div className="modal d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setEditing(null)}>
          <div className="modal-dialog modal-lg modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content" style={{ borderRadius: '14px' }}>
              <div className="modal-header">
                <h5 className="modal-title">{editing === false ? '新增文章' : '编辑文章'}</h5>
                <button type="button" className="btn-close" onClick={() => setEditing(null)} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">标题 <span className="text-danger">*</span></label>
                  <input type="text" className="form-control" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label className="form-label">分类</label>
                    <select className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      {KB_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="col-md-6 mb-3">
                    <label className="form-label">阅读时长（分钟）</label>
                    <input type="number" min={1} className="form-control" value={form.readTime} onChange={(e) => setForm({ ...form, readTime: parseInt(e.target.value || '5', 10) })} />
                  </div>
                </div>
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label className="form-label">标签（逗号分隔）</label>
                    <input type="text" className="form-control" placeholder="储蓄, 应急基金" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
                  </div>
                  <div className="col-md-6 mb-3">
                    <label className="form-label">发布日期</label>
                    <input type="date" className="form-control" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label">摘要</label>
                  <input type="text" className="form-control" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
                </div>
                <div className="mb-3">
                  <label className="form-label">封面图 URL（可选）</label>
                  <input type="text" className="form-control" placeholder="https://..." value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} />
                </div>
                <div className="mb-2">
                  <label className="form-label">正文（支持 Markdown）</label>
                  <textarea className="form-control" rows={8} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>取消</button>
                <button type="button" className="btn btn-primary" style={{ background: 'var(--yg-primary)', borderColor: 'var(--yg-primary)' }} onClick={handleSave} disabled={saving}>
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 日期格式化：兼容 ISO 字符串 / 时间戳 / Firestore 时间对象
function formatDate(value) {
  if (!value) return '—';
  if (value instanceof Date && !isNaN(value)) return value.toLocaleString('zh-CN');
  if (typeof value === 'number') return new Date(value).toLocaleString('zh-CN');
  const str = String(value);
  if (str === '—') return str;
  const d = new Date(str.length === 10 ? str + 'T00:00:00' : str);
  return isNaN(d.getTime()) ? str : d.toLocaleString('zh-CN');
}

function learningLabel(key) {
  const k = String(key || '');
  if (k === 'profile') return { type: '画像', text: '用户画像总结' };
  if (k.startsWith('exercise:')) return { type: '练习', text: '完成练习：' + k.slice('exercise:'.length) };
  if (k.startsWith('reflection:')) return { type: '反思', text: '消费记录反思（' + k.slice('reflection:'.length) + '）' };
  return { type: '记录', text: k };
}

function buildUserInsight(d) {
  const txs = d.transactions || [];
  const goals = d.goals || [];
  const learns = d.learning_entries || [];
  if (txs.length === 0 && goals.length === 0 && learns.length === 0) {
    return '该用户暂无行为数据，建议引导其完成首次财务评估并记录第一笔消费。';
  }
  const regrets = txs.filter(t => t.regret).length;
  const regretRate = txs.length ? Math.round(regrets / txs.length * 100) : 0;
  const regretByCat = {};
  txs.forEach(t => { if (t.regret) { const c = t.category || '其他'; regretByCat[c] = (regretByCat[c] || 0) + 1; } });
  const topRegretCat = Object.entries(regretByCat).sort((a, b) => b[1] - a[1])[0];
  const activeGoals = goals.filter(g => !g.status || g.status === 'active');
  const avgProgress = activeGoals.length
    ? Math.round(activeGoals.reduce((s, g) => s + ((g.current_amount || 0) / Math.max(1, g.target_amount || 1)), 0) / activeGoals.length * 100)
    : 0;
  const parts = [];
  if (txs.length > 0) {
    parts.push(`累计记录 ${txs.length} 笔消费`);
    if (regrets > 0) {
      parts.push(`其中 ${regrets} 笔（${regretRate}%）标记为后悔消费` + (topRegretCat ? `，「${topRegretCat[0]}」类最易冲动` : ''));
    } else {
      parts.push('暂未标记后悔消费，消费较为理性');
    }
  }
  if (activeGoals.length > 0) {
    parts.push(`进行中目标 ${activeGoals.length} 个，平均进度 ${avgProgress}%`);
  }
  if (learns.length > 0) {
    parts.push(`已完成 ${learns.length} 次学习/反思`);
  }
  let advice = '建议保持引导，鼓励完成财务评估与首个理财目标。';
  if (regretRate >= 50) advice = '建议 AI 教练重点推送理性消费、冲动购物干预内容。';
  else if (activeGoals.length > 0 && avgProgress < 40) advice = '目标进度偏慢，建议推送储蓄习惯养成类内容。';
  else if (learns.length >= 3) advice = '学习参与度高，可向其推荐进阶理财课程。';
  return parts.join('；') + '。' + advice;
}

const CoachConfigTab = () => {
  const [prompt, setPrompt] = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const cfg = await adminGetCoachConfig();
      setPrompt(cfg.system_prompt || '');
      setDefaultPrompt(cfg.default_prompt || '');
      setIsDefault(cfg.is_default);
    } catch (e) {
      setError('读取教练配置失败：' + (e.response?.data?.message || e.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true); setNotice(''); setError('');
    try {
      const cfg = await adminSaveCoachConfig(prompt);
      setIsDefault(cfg.is_default);
      setNotice('已保存，下一条用户消息起生效');
    } catch (e) {
      setError(e.response?.data?.message || '保存失败');
    } finally { setSaving(false); }
  };

  const reset = async () => {
    setSaving(true); setNotice(''); setError('');
    try {
      const cfg = await adminResetCoachConfig();
      setPrompt(cfg.system_prompt);
      setIsDefault(true);
      setNotice('已恢复默认人设');
    } catch (e) {
      setError(e.response?.data?.message || '恢复失败');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="chart-empty">加载中…</div>;

  const templates = [
    { name: '🌱 温柔陪伴风', text: '你是一位名叫"青盈"的AI金融心智教练。语气温和、像一个值得信赖的学姐，多用鼓励和共情，少说教。用户后悔消费时，先理解情绪，再温和引导复盘，不批评。始终不直接给投资建议，而是帮助用户自己想清楚。' },
    { name: '⚡ 理性犀利风', text: '你是一位名叫"青盈"的AI金融心智教练。语气理性直接，像一位冷静的分析师，会一针见血指出用户认知偏差。用户后悔消费时直接追问："这笔钱花完之后，你得到了什么？"用事实和数据说话，不绕弯子。不直接推荐具体投资标的。' },
    { name: '🎯 严格目标导向', text: '你是一位名叫"青盈"的AI金融心智教练。语气专业严格，像一位私教。每次对话都要紧扣用户的储蓄目标和消费记录，主动提醒距离目标还差多少。用户想冲动消费时，明确给出"延迟24小时"的建议，并解释机会成本。不直接推荐投资。' },
  ];

  return (
    <div>
      <div className="coach-hero">
        <div className="coach-hero-icon"><img src="/coach-avatar.svg" alt="AI 教练" style={{ width: 44, height: 44, borderRadius: 12 }} /></div>
        <div>
          <div className="coach-hero-title">AI 教练配置台</div>
          <div className="coach-hero-sub">调整教练的人设、语气与规则，保存后下一条对话立即生效</div>
        </div>
        <span className={`coach-status-badge ${isDefault ? 'is-default' : 'is-custom'}`}>
          {isDefault ? '默认人设' : '已自定义'}
        </span>
      </div>

      <div className="admin-subcard" style={{ marginBottom: 16 }}>
        <div className="admin-subcard-title">快速套用模板</div>
        <div className="d-flex flex-wrap gap-2 mb-3">
          {templates.map((t) => (
            <button key={t.name} type="button" className="template-chip" onClick={() => setPrompt(t.text)}>
              {t.name}
            </button>
          ))}
        </div>

        {error && <div className="alert alert-danger py-2">{error}</div>}
        {notice && <div className="alert alert-success py-2">{notice}</div>}

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={11}
          className="coach-textarea"
          placeholder="输入教练的系统提示词…"
        />

        <div className="d-flex gap-2 mt-3 align-items-center">
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !prompt.trim()}>
            {saving ? '保存中…' : '💾 保存配置'}
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={reset} disabled={saving || isDefault}>
            恢复默认人设
          </button>
          <span className="text-muted ms-auto" style={{ fontSize: 12 }}>
            {prompt.length} 字
          </span>
        </div>
      </div>

      <div className="admin-subcard">
        <div className="admin-subcard-title">📖 默认人设参考</div>
        <div className="coach-default-ref">{defaultPrompt}</div>
      </div>
    </div>
  );
};

export default AdminDashboard;

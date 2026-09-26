import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  adminGetStats, adminListUsers, adminGetUser, adminSetUserStatus, adminDeleteUser,
  adminListKbArticles, adminCreateKbArticle, adminUpdateKbArticle, adminDeleteKbArticle,
} from '../services/api';
import {
  FaChartBar, FaUsers, FaBook, FaShieldAlt, FaSearch, FaTrashAlt,
  FaPlus, FaEdit, FaBan, FaCheckCircle, FaSyncAlt, FaArrowLeft,
  FaUserShield, FaClipboardCheck, FaComments, FaCreditCard, FaBullseye, FaFileAlt,
} from 'react-icons/fa';

// 统计卡片配置：icon / 标题 / 字段名 / 色值
const STAT_CARDS = [
  { key: 'total_users', label: '注册用户', icon: <FaUsers />, color: 'var(--yg-primary)' },
  { key: 'assessment_completed_users', label: '完成评估用户', icon: <FaClipboardCheck />, color: 'var(--yg-secondary)' },
  { key: 'total_assessments', label: '评估记录', icon: <FaChartBar />, color: 'var(--yg-accent)' },
  { key: 'total_learning_entries', label: '理财成长记录', icon: <FaBook />, color: 'var(--yg-primary)' },
  { key: 'total_transactions', label: '消费记录', icon: <FaCreditCard />, color: 'var(--yg-secondary)' },
  { key: 'total_goals', label: '理财目标', icon: <FaBullseye />, color: 'var(--yg-accent)' },
  { key: 'total_coach_messages', label: 'AI 教练对话', icon: <FaComments />, color: 'var(--yg-primary)' },
  { key: 'total_kb_articles', label: '知识库文章', icon: <FaFileAlt />, color: 'var(--yg-secondary)' },
];

const KB_CATEGORIES = [
  { id: '', name: '未分类' },
  { id: 'basic', name: '基础金融' },
  { id: 'investment', name: '投资理财' },
  { id: 'credit', name: '信用管理' },
  { id: 'tax', name: '税务规划' },
  { id: 'property', name: '房产金融' },
  { id: 'retirement', name: '退休规划' },
  { id: 'education', name: '教育金融' },
];

const EMPTY_KB_FORM = {
  title: '', summary: '', content: '', category: '',
  tags: '', image: '', readTime: 5, date: new Date().toISOString().slice(0, 10),
};

const AdminDashboard = () => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('stats');

  return (
    <div className="py-4">
      {/* 顶部栏 */}
      <div className="d-flex flex-wrap align-items-center justify-content-between mb-4 gap-2">
        <div className="d-flex align-items-center gap-2">
          <FaShieldAlt style={{ color: 'var(--yg-primary)', fontSize: '1.6rem' }} />
          <div>
            <h1 className="fs-4 fw-bold mb-0" style={{ color: 'var(--yg-ink)' }}>管理后台</h1>
            <div className="text-muted" style={{ fontSize: '0.85rem' }}>当前管理员：{currentUser?.email || '—'}</div>
          </div>
        </div>
        <Link to="/dashboard" className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1">
          <FaArrowLeft /> 返回个人中心
        </Link>
      </div>

      {/* Tab 切换 */}
      <ul className="nav nav-tabs mb-4" style={{ borderBottomColor: 'var(--yg-line)' }}>
        {[
          { id: 'stats', label: '平台统计', icon: <FaChartBar /> },
          { id: 'users', label: '用户管理', icon: <FaUsers /> },
          { id: 'kb', label: '知识库管理', icon: <FaBook /> },
        ].map((tab) => (
          <li className="nav-item" key={tab.id}>
            <button
              type="button"
              className={`nav-link d-inline-flex align-items-center gap-2 ${activeTab === tab.id ? 'active' : ''}`}
              style={{
                color: activeTab === tab.id ? 'var(--yg-primary-text)' : 'var(--yg-muted)',
                borderColor: activeTab === tab.id ? 'var(--yg-primary-border)' : 'transparent',
                borderBottom: activeTab === tab.id ? '2px solid var(--yg-primary)' : undefined,
                background: 'transparent',
              }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          </li>
        ))}
      </ul>

      {activeTab === 'stats' && <StatsTab />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'kb' && <KbTab />}
    </div>
  );
};

// ============================================================
// 平台统计
// ============================================================
const StatsTab = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStats(await adminGetStats());
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
      {loading && <div className="text-center py-5 text-muted">统计加载中...</div>}
      {!loading && stats && (
        <div className="row g-3">
          {STAT_CARDS.map((card) => (
            <div className="col-6 col-md-4 col-lg-3" key={card.key}>
              <div className="card h-100 shadow-sm border-0" style={{ borderRadius: '14px' }}>
                <div className="card-body d-flex align-items-center gap-3 p-3">
                  <div
                    className="d-flex align-items-center justify-content-center rounded-3"
                    style={{ width: 44, height: 44, color: '#fff', background: card.color, flex: '0 0 auto' }}
                  >
                    {card.icon}
                  </div>
                  <div>
                    <div className="fs-4 fw-bold mb-0" style={{ color: 'var(--yg-ink)' }}>{stats[card.key] ?? 0}</div>
                    <div className="text-muted" style={{ fontSize: '0.8rem' }}>{card.label}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
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

      {/* 用户详情弹窗 */}
      {detail && (
        <div className="modal d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setDetail(null)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content" style={{ borderRadius: '14px' }}>
              <div className="modal-header">
                <h5 className="modal-title d-flex align-items-center gap-2"><FaUserShield /> 用户详情</h5>
                <button type="button" className="btn-close" onClick={() => setDetail(null)} />
              </div>
              <div className="modal-body">
                <dl className="row mb-0" style={{ fontSize: '0.9rem' }}>
                  <dt className="col-sm-4 text-muted">UID</dt><dd className="col-sm-8 text-break">{detail.uid}</dd>
                  <dt className="col-sm-4 text-muted">邮箱</dt><dd className="col-sm-8">{detail.profile?.email || '—'}</dd>
                  <dt className="col-sm-4 text-muted">昵称</dt><dd className="col-sm-8">{detail.profile?.displayName || '—'}</dd>
                  <dt className="col-sm-4 text-muted">注册时间</dt><dd className="col-sm-8">{formatDate(detail.profile?.createdAt)}</dd>
                  <dt className="col-sm-4 text-muted">最后登录</dt><dd className="col-sm-8">{formatDate(detail.profile?.lastLogin)}</dd>
                  <dt className="col-sm-4 text-muted">状态</dt>
                  <dd className="col-sm-8">
                    {detail.disabled
                      ? <span className="badge text-bg-danger">已停用</span>
                      : <span className="badge" style={{ background: 'var(--yg-success)' }}>正常</span>}
                  </dd>
                </dl>
                {detail.data_summary && (
                  <>
                    <hr />
                    <div className="text-muted mb-2" style={{ fontSize: '0.85rem' }}>业务数据量</div>
                    <div className="d-flex flex-wrap gap-2">
                      {Object.entries(detail.data_summary).map(([k, v]) => (
                        <span key={k} className="badge rounded-pill" style={{ background: 'var(--yg-primary-subtle)', color: 'var(--yg-primary-text)' }}>
                          {DATA_LABELS[k] || k}: {v}
                        </span>
                      ))}
                    </div>
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

export default AdminDashboard;

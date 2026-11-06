import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { focusContent } from '../utils/focusContent';
import './AdminLayout.css';
import './AdminWorkspace.css';

const sections = [
  { path: '/admin/stats', title: '平台概览', description: '查看平台使用情况，进入需要处理的工作。' },
  { path: '/admin/users', title: '用户管理', description: '查找账号，核对资料并管理账号状态。' },
  { path: '/admin/knowledge', title: '知识库管理', description: '核对采集内容与出处，维护面向学生发布的资料。' },
  { path: '/admin/podcasts', title: '音频博客目录', description: '核对单集、来源和使用范围，再决定是否推荐给学生。' },
  { path: '/admin/coach', title: 'AI 教练配置', description: '调整教练的角色、语气和系统指令。' },
  { path: '/admin/research', title: '研究项目管理', description: '建立研究项目、发布月报并管理研究者授权。' },
];

export default function AdminLayout() {
  const { currentUser, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const section = sections.find(item => item.path === location.pathname) || sections[0];

  async function handleLogout() {
    setLeaving(true);
    setError('');
    try { await logout(); navigate('/admin/login', { replace: true }); }
    catch { setError('退出失败，请重试'); setLeaving(false); }
  }

  return <div className="admin-workspace admin-workspace-editorial">
    <a className="admin-skip" href="#admin-content" onClick={event => focusContent(event, 'admin-content')}>跳转到管理内容</a>
    <header className="admin-workspace-bar">
      <Link to="/admin" className="admin-wordmark"><b aria-hidden="true">青</b> 青盈管理</Link>
      <div className="admin-account"><span className="admin-account-email" title={currentUser?.email}>{currentUser?.email}</span>
        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={leaving} onClick={handleLogout}>{leaving ? '退出中…' : '退出登录'}</button>
      </div>
    </header>
    <div className="admin-workspace-grid">
      <nav className="admin-workspace-nav" aria-label="后台功能导航">
        {sections.map(item => <Link key={item.path} to={item.path} aria-current={section === item ? 'page' : undefined}
          className={section === item ? 'is-current' : undefined}>{item.title}</Link>)}
      </nav>
      <main id="admin-content" className="admin-content" tabIndex={-1}>
        <header className="admin-editorial-heading"><span>YOUTHGAIN / 运营工作台</span><h1>{section.title}</h1><p>{section.description}</p></header>
        {error && <div role="alert" className="alert alert-danger">{error}</div>}
        <section className="admin-panel admin-editorial-panel" aria-label={section.title}><Outlet /></section>
      </main>
    </div>
  </div>;
}

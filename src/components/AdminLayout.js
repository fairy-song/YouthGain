import React, { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FaChartBar, FaUsers, FaBook, FaShieldAlt, FaSignOutAlt, FaExternalLinkAlt } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import './AdminLayout.css';

const sections = [
  { path: '/admin', title: '平台概览', description: '了解平台使用情况与内容规模', icon: FaChartBar },
  { path: '/admin/users', title: '用户管理', description: '查询用户资料，管理账号状态', icon: FaUsers },
  { path: '/admin/knowledge', title: '知识库管理', description: '维护文章内容，为用户提供可靠的学习资源', icon: FaBook },
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
  return (
    <div className="admin-workspace">
      <a className="admin-skip" href="#admin-content">跳转到管理内容</a>
      <aside className="admin-sidebar">
        <Link to="/admin" className="admin-brand"><FaShieldAlt /><span>青盈 YouthGain<small>平台管理中心</small></span></Link>
        <div className="admin-nav-label">工作空间</div>
        <nav aria-label="后台管理导航">
          {sections.map(({ path, title, icon: Icon }) => <NavLink key={path} to={path} end className={({ isActive }) => `admin-nav-item${isActive ? ' is-active' : ''}`}><Icon aria-hidden="true" />{title}</NavLink>)}
        </nav>
        <div className="admin-sidebar-bottom"><FaShieldAlt /> 管理员工作空间</div>
      </aside>
      <div className="admin-body">
        <header className="admin-topbar">
          <span className="admin-breadcrumb">管理中心 / {section.title}</span>
          <div className="admin-account">
            <Link to="/" target="_blank" rel="noopener noreferrer" className="admin-preview">预览用户端 <FaExternalLinkAlt aria-hidden="true" /></Link>
            <span className="admin-account-email" title={currentUser?.email}>{currentUser?.email}<small>管理员</small></span>
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={leaving} onClick={handleLogout}><FaSignOutAlt aria-hidden="true" /> {leaving ? '退出中…' : '退出登录'}</button>
          </div>
        </header>
        <main id="admin-content" className="admin-content" tabIndex={-1}>
          <div className="admin-page-heading"><span>YOUTHGAIN · 管理后台</span><h1>{section.title}</h1><p>{section.description}</p></div>
          {error && <div role="alert" className="alert alert-danger">{error}</div>}
          <section className="admin-panel" aria-label={section.title}><Outlet /></section>
        </main>
      </div>
    </div>
  );
}

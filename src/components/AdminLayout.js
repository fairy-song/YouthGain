import React, { useState, useMemo } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FaChartBar, FaUsers, FaBook, FaRobot, FaShieldAlt, FaSignOutAlt, FaExternalLinkAlt } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import Particles, { ParticlesProvider } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import './AdminLayout.css';

const sections = [
  { path: '/admin/stats', title: '平台概览', description: '了解平台使用情况与内容规模', icon: FaChartBar },
  { path: '/admin/users', title: '用户管理', description: '查询用户资料，管理账号状态', icon: FaUsers },
  { path: '/admin/knowledge', title: '知识库管理', description: '维护文章内容，为用户提供可靠的学习资源', icon: FaBook },
  { path: '/admin/coach', title: 'AI 教练配置', description: '调整教练人设、语气与系统指令', icon: FaRobot },
];

const particlesInit = async (engine) => { await loadSlim(engine); };

export default function AdminLayout() {
  const { currentUser, logout } = useAuth();

  const particlesOptions = useMemo(() => ({
    fullScreen: { enable: false },
    background: { color: { value: 'transparent' } },
    fpsLimit: 60,
    interactivity: {
      events: {
        onHover: { enable: true, mode: 'grab' },
        onClick: { enable: true, mode: 'push' },
        resize: { enable: true },
      },
      modes: {
        grab: { distance: 180, links: { opacity: 0.6 } },
        push: { quantity: 4 },
      },
    },
    particles: {
      color: { value: ['#63B995', '#5488C4', '#E88A6E'] },
      links: {
        color: '#63B995',
        distance: 150,
        enable: true,
        opacity: 0.35,
        width: 1.2,
      },
      move: {
        direction: 'none',
        enable: true,
        outModes: { default: 'out' },
        random: true,
        speed: 1.2,
        straight: false,
      },
      number: { density: { enable: true, area: 800 }, value: 90 },
      opacity: { value: { min: 0.3, max: 0.7 } },
      shape: { type: 'circle' },
      size: { value: { min: 1.5, max: 4 } },
    },
    detectRetina: true,
  }), []);
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
    <div className="admin-workspace admin-workspace-nosidebar">
      <a className="admin-skip" href="#admin-content">跳转到管理内容</a>
      <div className="admin-body">
        <ParticlesProvider init={particlesInit}>
          <Particles id="admin-particles" className="admin-particles-bg" options={particlesOptions} />
        </ParticlesProvider>
        <header className="admin-topbar admin-topbar-flat">
          <Link to="/admin" className="admin-back-to-orb">
            <FaShieldAlt aria-hidden="true" /> ← 返回球体中枢
          </Link>
          <span className="admin-breadcrumb">{section.title}</span>
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

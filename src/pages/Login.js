import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { app } from '../services/firebase';
import { useAuth, translateFirebaseError } from '../contexts/AuthContext';
import { readDraft } from '../data/firstVisit';

const Login = ({ adminMode = false, schoolMode = false }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login, currentUser } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      return setError('请填写所有必填字段');
    }

    try {
      setError('');
      setLoading(true);
      const result = await login(email.trim(), password);
      if (schoolMode) {
        navigate('/research', { replace: true });
        return;
      }
      // 管理员登录后进入管理后台，普通用户进入账本
      if (adminMode && result?.role !== 'admin') {
        setError('该账号没有管理员权限，请使用已授权的管理员邮箱，或切换到用户登录');
        return;
      }
      const coachEntry = location.state?.coachEntry;
      if (!adminMode && coachEntry && typeof coachEntry.prompt === 'string') {
        navigate('/coach', { replace: true, state: { prompt: coachEntry.prompt.slice(0, 2000), returnTo: '/' } });
      } else if (!adminMode && result?.role !== 'admin' && new URLSearchParams(location.search).get('from') === 'questionnaire' && readDraft()?.complete) {
        navigate('/onboarding/complete', { replace: true });
      } else {
        const from = location.state?.from;
        const returnTo = typeof from === 'string' && /^\/(?!\/)/.test(from) && !/[\\\r\n]/.test(from)
          && !/^\/(?:admin|login|register)(?:[/?#]|$)/.test(from) ? from : '/dashboard';
        navigate(result?.role === 'admin' ? '/admin' : returnTo, { replace: true });
      }
    } catch (err) {
      console.error('登录失败:', err);
      setError(err.code?.startsWith('auth/') ? translateFirebaseError(err.code) : (err.message || '登录失败，请稍后重试'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={schoolMode ? 'school-access-page' : 'min-h-[calc(100vh-170px)] flex items-center justify-center bg-neutral-50 py-12 px-4 sm:px-6 lg:px-8'}>
      <div className={schoolMode ? 'school-access-form' : 'max-w-md w-full bg-white rounded-lg shadow-md p-8'}>
        {!schoolMode && <nav aria-label="登录身份" className="d-flex flex-wrap gap-2 mb-4">
          <Link to="/login" aria-current={!adminMode ? 'page' : undefined} className={`btn flex-fill ${!adminMode ? 'btn-primary' : 'btn-outline-secondary'}`}>用户登录</Link>
          <Link to="/research" className="btn flex-fill btn-outline-secondary">学校端登录</Link>
          <Link to="/admin/login" aria-current={adminMode ? 'page' : undefined} className={`btn flex-fill ${adminMode ? 'btn-dark' : 'btn-outline-secondary'}`}>管理员登录</Link>
        </nav>}
        {schoolMode ? <header className="school-access-heading">
          <p>教师与研究人员</p>
          <h1>登录学校端</h1>
          <p>使用研究项目负责人授权的邮箱和你的青盈密码。登录后可查看获授权项目的月报。</p>
        </header> : <>
          <h1 className="text-2xl font-bold mb-3 text-center">{adminMode ? '管理员登录' : '欢迎回到青盈'}</h1>
          <p className="text-center text-muted mb-4">{adminMode ? '管理用户、查看平台数据与维护知识库' : '登录后继续你的健康成长计划'}</p>
        </>}
        {schoolMode && currentUser?.email && <p className="school-access-current">当前账号：<strong>{currentUser.email}</strong> · <Link to="/research">用此账号进入</Link></p>}
        {adminMode && <p className="alert alert-light border">仅限已授权的管理员账号。账号权限由系统核验，选择此入口不会授予管理权限。</p>}
        {!app && <p role="status" className={schoolMode ? 'school-access-local' : 'alert alert-warning'}>当前为本地开发模拟登录，密码不会被验证。{adminMode ? '请使用后台已配置的管理员邮箱；本项目本地示例为 admin@youthgain.com。' : schoolMode ? '请使用本地研究项目已授权的邮箱和任意非空测试密码。' : '请输入邮箱和任意非空密码。'}</p>}

        {error && (
          <div role="alert" className="bg-danger-100 border border-danger-400 text-danger-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="email" className="block text-neutral-700 font-medium mb-2">
              {schoolMode ? '获授权的电子邮箱' : '电子邮箱'}
            </label>
            <input
              autoComplete="username"
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="your.email@example.com"
              required
            />
          </div>

          <div className="mb-6">
            <label htmlFor="password" className="block text-neutral-700 font-medium mb-2">
              密码
            </label>
            <input
              autoComplete="current-password"
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="********"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={schoolMode ? 'school-access-primary' : `w-full bg-primary-500 text-neutral-950 py-2 px-4 rounded-md font-medium ${loading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-primary-600'}`}
          >
            {loading ? '正在验证身份…' : schoolMode ? '登录并查看研究项目' : adminMode ? '登录管理后台' : '进入青盈'}
          </button>
        </form>

        {!adminMode && !schoolMode && <div className="mt-6 text-center">
          <p className="text-neutral-600">
            还没有账号？{' '}
            <Link to={location.search.includes('from=questionnaire') ? '/register?from=questionnaire' : '/register'} className="text-primary-700 hover:underline">
              立即注册
            </Link>
          </p>
        </div>}
      </div>
      {schoolMode && <aside className="school-access-help" aria-labelledby="school-access-help-title">
        <h2 id="school-access-help-title">第一次进学校端？</h2>
        <ol>
          <li>请项目负责人为你的邮箱开通项目访问权限。</li>
          <li>已有青盈账号就直接登录。还没注册的，用同一邮箱<Link to="/research/register">注册青盈账号</Link>。</li>
          <li>正式账号如提示验证邮箱，完成邮件验证后回到学校端刷新权限。</li>
        </ol>
        <Link className="school-demo-link" to="/research/demo">先看演示月报 <span aria-hidden="true">→</span></Link>
        <p>无需登录，使用固定模拟数据。</p>
      </aside>}
    </div>
  );
};

export default Login;

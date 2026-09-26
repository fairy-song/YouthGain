import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      return setError('请填写所有必填字段');
    }

    try {
      setError('');
      setLoading(true);
      const result = await login(email, password);
      // 管理员登录后进入管理后台，普通用户进入个人中心
      navigate(result?.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      console.error('登录失败:', err);
      setError('登录失败，请检查您的邮箱和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-170px)] flex items-center justify-center bg-neutral-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">登录</h1>

        {error && (
          <div className="bg-danger-100 border border-danger-400 text-danger-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="email" className="block text-neutral-700 font-medium mb-2">
              电子邮箱
            </label>
            <input
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
            className={`w-full bg-primary-500 text-neutral-950 py-2 px-4 rounded-md font-medium ${loading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-primary-600'
              }`}
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-neutral-600">
            还没有账号？{' '}
            <Link to="/register" className="text-primary-700 hover:underline">
              立即注册
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login; 
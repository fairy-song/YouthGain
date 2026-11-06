import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { fetchMyRole } from '../services/api';
jest.mock('../services/firebase', () => ({ app: null }));
jest.mock('../services/api', () => ({ fetchMyRole: jest.fn() }));
function Status() { const { initializing, isAdmin } = useAuth(); return <div>{initializing ? '恢复中' : isAdmin ? '管理员' : '普通用户'}</div>; }
afterEach(() => { localStorage.clear(); sessionStorage.clear(); });
test('恢复登录等待后台角色后才结束初始化', async () => {
  sessionStorage.setItem('dev_current_user', JSON.stringify({ uid: 'test', email: 'admin@youthgain.com' }));
  let resolve;
  fetchMyRole.mockReturnValue(new Promise(r => { resolve = r; }));
  render(<AuthProvider><Status /></AuthProvider>);
  expect(screen.getByText('恢复中')).toBeTruthy();
  await act(async () => resolve({ role: 'admin' }));
  expect(screen.getByText('管理员')).toBeTruthy();
});
test('后台角色查询失败不授予管理员权限', async () => {
  sessionStorage.setItem('dev_current_user', JSON.stringify({ uid: 'test', email: 'admin@youthgain.com' }));
  fetchMyRole.mockRejectedValue(new Error('offline'));
  render(<AuthProvider><Status /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('普通用户')).toBeTruthy());
});

test.each([
  ['admin', 'user', '没有管理员权限'],
  ['student', 'admin', '请使用学生账号'],
  ['school', 'admin', '请使用研究项目授权'],
])('错误角色无法建立 %s 的登录会话', async (workspace, role, message) => {
  fetchMyRole.mockResolvedValue({ role });
  let auth;
  function Access() { auth = useAuth(); return null; }
  render(<AuthProvider><Access /></AuthProvider>);
  await act(async () => { await expect(auth.login('fixture@example.org', 'fixture', workspace)).rejects.toThrow(message); });
  expect(auth.workspace).toBeNull();
  expect(sessionStorage.getItem('dev_current_user')).toBeNull();
});

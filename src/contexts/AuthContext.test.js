import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { fetchMyRole } from '../services/api';
jest.mock('../services/firebase', () => ({ app: null }));
jest.mock('../services/api', () => ({ fetchMyRole: jest.fn() }));
function Status() { const { initializing, isAdmin } = useAuth(); return <div>{initializing ? '恢复中' : isAdmin ? '管理员' : '普通用户'}</div>; }
afterEach(() => localStorage.clear());
test('恢复登录等待后台角色后才结束初始化', async () => {
  localStorage.setItem('dev_current_user', JSON.stringify({ uid: 'test', email: 'admin@youthgain.com' }));
  let resolve;
  fetchMyRole.mockReturnValue(new Promise(r => { resolve = r; }));
  render(<AuthProvider><Status /></AuthProvider>);
  expect(screen.getByText('恢复中')).toBeTruthy();
  await act(async () => resolve({ role: 'admin' }));
  expect(screen.getByText('管理员')).toBeTruthy();
});
test('后台角色查询失败不授予管理员权限', async () => {
  localStorage.setItem('dev_current_user', JSON.stringify({ uid: 'test', email: 'admin@youthgain.com' }));
  fetchMyRole.mockRejectedValue(new Error('offline'));
  render(<AuthProvider><Status /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('普通用户')).toBeTruthy());
});

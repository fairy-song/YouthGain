import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import Login from './Login';
import { useAuth } from '../contexts/AuthContext';
jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn(), translateFirebaseError: () => '邮箱或密码错误' }));
jest.mock('../services/firebase', () => ({ app: null }));
const login = jest.fn();
beforeEach(() => { login.mockReset(); useAuth.mockReturnValue({ login }); });
function setup(adminMode = true) {
  render(<MemoryRouter><Routes><Route path="/" element={<Login adminMode={adminMode} />} /><Route path="/admin" element={<div>后台已打开</div>} /><Route path="/dashboard" element={<div>账本已打开</div>} /></Routes></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('电子邮箱'), { target: { value: 'admin@youthgain.com' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'test' } });
  fireEvent.click(screen.getByRole('button', { name: adminMode ? '登录管理后台' : '进入青盈' }));
}
test('管理员入口验证通过后打开后台', async () => {
  login.mockResolvedValue({ role: 'admin' }); setup();
  expect(await screen.findByText('后台已打开')).toBeTruthy();
});
test('普通账号在管理员入口明确提示无权限', async () => {
  login.mockResolvedValue({ role: 'user' }); setup();
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('没有管理员权限'));
  expect(screen.queryByText('后台已打开')).toBeNull();
});
test('后台不可用时保留可操作的错误信息', async () => {
  login.mockRejectedValue(new Error('暂时无法验证登录权限，请确认后台服务已启动后重试')); setup();
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('后台服务已启动'));
});
test('用户入口打开账本', async () => {
  login.mockResolvedValue({ role: 'user' }); setup(false);
  expect(await screen.findByText('账本已打开')).toBeTruthy();
});

test('管理员从用户入口登录仍进入管理后台', async () => {
  login.mockResolvedValue({ role: 'admin' }); setup(false);
  expect(await screen.findByText('后台已打开')).toBeTruthy();
});

test('首页教练问题在登录后保留并回到对话', async () => {
  login.mockResolvedValue({ role: 'user' });
  function CoachDestination() { const location = useLocation(); return <div>{location.state.prompt} · 返回 {location.state.returnTo}</div>; }
  render(<MemoryRouter initialEntries={[{ pathname: '/login', state: { coachEntry: { prompt: '这周生活费怎么安排？', returnTo: '/' } } }]}><Routes><Route path="/login" element={<Login />} /><Route path="/coach" element={<CoachDestination />} /></Routes></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('电子邮箱'), { target: { value: 'user@example.com' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'test' } });
  fireEvent.click(screen.getByRole('button', { name: '进入青盈' }));
  expect(await screen.findByText('这周生活费怎么安排？ · 返回 /')).toBeTruthy();
});

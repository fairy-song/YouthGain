import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import Login from './Login';
import { useAuth } from '../contexts/AuthContext';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
import { authDestination } from '../utils/authDestination';
jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn(), translateFirebaseError: () => '邮箱或密码错误' }));
jest.mock('../services/firebase', () => ({ app: null }));
jest.mock('firebase/auth', () => ({ getAuth: jest.fn(), sendPasswordResetEmail: jest.fn() }));
const login = jest.fn();
const firebase = jest.requireMock('../services/firebase');
beforeEach(() => { login.mockReset(); firebase.app = null; useAuth.mockReturnValue({ login }); });
function setup(adminMode = true) {
  render(<MemoryRouter initialEntries={['/login']}><Routes><Route path="/login" element={<Login adminMode={adminMode} />} /><Route path="/admin" element={<div>后台已打开</div>} /><Route path="/" element={<div>今天已打开</div>} /></Routes></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('电子邮箱'), { target: { value: 'admin@youthgain.com' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'test' } });
  fireEvent.click(screen.getByRole('button', { name: adminMode ? '登录管理后台' : '进入青盈' }));
}
test('管理员入口验证通过后打开后台', async () => {
  login.mockResolvedValue({ role: 'admin' }); setup();
  expect(await screen.findByText('后台已打开')).toBeTruthy();
});
test('普通账号在管理员入口明确提示无权限', async () => {
  login.mockRejectedValue(new Error('该账号没有管理员权限')); setup();
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('没有管理员权限'));
  expect(screen.queryByText('后台已打开')).toBeNull();
});
test('后台不可用时保留可操作的错误信息', async () => {
  login.mockRejectedValue(new Error('暂时无法验证登录权限，请确认后台服务已启动后重试')); setup();
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('后台服务已启动'));
});
test('用户入口默认打开今天', async () => {
  login.mockResolvedValue({ role: 'user' }); setup(false);
  expect(await screen.findByText('今天已打开')).toBeTruthy();
});

test.each(['//example.org', '/dashboard/../admin', '/admin/knowledge', '/login', '/research'])('拒绝不属于学生端任务的回跳 %s', from => {
  expect(authDestination({ from })).toEqual({ to: '/' });
});

test.each([undefined, 'auth/user-not-found'])('找回密码统一反馈，返回登录后保留原任务 (%s)', async code => {
  firebase.app = {};
  getAuth.mockReturnValue({ service: 'auth' });
  sendPasswordResetEmail.mockReset();
  if (code) sendPasswordResetEmail.mockRejectedValue({ code });
  else sendPasswordResetEmail.mockResolvedValue();
  login.mockResolvedValue({ role: 'user' });
  function Ledger() { return <div>账本{useLocation().search}</div>; }
  render(<MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/dashboard?tab=upcoming' } }]}><Routes>
    <Route path="/login" element={<Login />} /><Route path="/dashboard" element={<Ledger />} />
  </Routes></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('电子邮箱'), { target: { value: 'student@example.org' } });
  fireEvent.click(screen.getByRole('button', { name: '忘记密码？' }));
  fireEvent.click(screen.getByRole('button', { name: '发送重置邮件' }));
  expect(await screen.findByText(/如果该邮箱已注册/)).toBeTruthy();
  expect(sendPasswordResetEmail).toHaveBeenCalledWith({ service: 'auth' }, 'student@example.org');
  expect(login).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '返回登录' }));
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'test' } });
  fireEvent.click(screen.getByRole('button', { name: '进入青盈' }));
  expect(await screen.findByText('账本?tab=upcoming')).toBeTruthy();
});

test('学生登录明确使用学生端入口，拒绝后不跳管理后台', async () => {
  login.mockRejectedValue(new Error('学生端请使用学生账号登录。')); setup(false);
  expect(await screen.findByText('学生端请使用学生账号登录。')).toBeTruthy();
  expect(login).toHaveBeenCalledWith('admin@youthgain.com', 'test', 'student');
  expect(screen.queryByText('后台已打开')).toBeNull();
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

test('登录后返回之前请求的学习功能与参数', async () => {
  login.mockResolvedValue({ role: 'user' });
  render(<MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/learning?tab=review' } }]}><Routes><Route path="/login" element={<Login />} /><Route path="/learning" element={<div>回到每周复盘</div>} /></Routes></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('电子邮箱'), { target: { value: 'demo@youthgain.local' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'test' } });
  fireEvent.click(screen.getByRole('button', { name: '进入青盈' }));
  expect(await screen.findByText('回到每周复盘')).toBeTruthy();
});

test.each(['user', 'admin'])('学校入口登录后直接进入学校端：%s', async role => {
  login.mockResolvedValue({ role });
  render(<MemoryRouter initialEntries={['/research/login']}><Routes>
    <Route path="/research/login" element={<Login schoolMode />} />
    <Route path="/research" element={<div>核对项目授权</div>} />
    <Route path="/admin" element={<div>管理后台</div>} />
  </Routes></MemoryRouter>);
  expect(screen.getByRole('link', { name: /先看演示月报/ }).getAttribute('href')).toBe('/research/demo');
  fireEvent.change(screen.getByLabelText('获授权的电子邮箱'), { target: { value: 'teacher@example.org' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'test' } });
  fireEvent.click(screen.getByRole('button', { name: '登录并查看研究项目' }));
  expect(await screen.findByText('核对项目授权')).toBeTruthy();
  expect(login).toHaveBeenCalledWith('teacher@example.org', 'test', 'school');
});

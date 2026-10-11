import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '../contexts/AuthContext';
jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@tsparticles/react', () => ({ __esModule: true, default: () => null, ParticlesProvider: ({ children }) => children }));
jest.mock('@tsparticles/slim', () => ({ loadSlim: jest.fn() }));
const logout = jest.fn();
beforeEach(() => { logout.mockReset(); useAuth.mockReturnValue({ currentUser: { email: 'admin@youthgain.com' }, logout }); });
function setup(path = '/admin') {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/admin/login" element={<div>管理员登录页</div>} />
    <Route path="/admin" element={<AdminLayout />}>
      <Route index element={<div>概览内容</div>} />
      <Route path="users" element={<div>用户列表内容</div>} />
      <Route path="knowledge" element={<div>知识库内容</div>} />
    </Route>
  </Routes></MemoryRouter>);
}
test('后台提供中枢返回和学校研究入口，不包含用户业务入口', () => {
  setup();
  expect(screen.getByRole('link', { name: /返回球体中枢/ }).getAttribute('href')).toBe('/admin');
  expect(screen.getByRole('link', { name: '学校研究管理' }).getAttribute('href')).toBe('/research');
  expect(screen.getByRole('heading', { name: '平台概览' })).toBeTruthy();
  ['每日打卡', '健康评估', 'AI 教练', '返回个人中心'].forEach(text => expect(screen.queryByText(text)).toBeNull());
  expect(screen.getByRole('link', { name: /预览用户端/ }).getAttribute('target')).toBe('_blank');
});
test('深链接恢复当前管理页面且可返回中枢', async () => {
  setup('/admin/users');
  expect(screen.getByRole('heading', { name: '用户管理' })).toBeTruthy();
  expect(screen.getByText('用户列表内容')).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: /返回球体中枢/ }));
  expect(await screen.findByText('概览内容')).toBeTruthy();
});
test('退出返回管理员登录', async () => {
  logout.mockResolvedValue(); setup();
  fireEvent.click(screen.getByRole('button', { name: /退出登录/ }));
  expect(await screen.findByText('管理员登录页')).toBeTruthy();
});
test('退出失败留在后台并显示错误', async () => {
  logout.mockRejectedValue(new Error('offline')); setup();
  fireEvent.click(screen.getByRole('button', { name: /退出登录/ }));
  expect((await screen.findByRole('alert')).textContent).toContain('退出失败');
});

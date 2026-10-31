import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import FAQPage, { highlightText } from './FAQPage';
import TutorialPage from './TutorialPage';
import ContactPage from './ContactPage';
import LegalPage from './LegalPage';

test('FAQ treats brackets and other search punctuation as literal text', () => {
  expect(() => highlightText('成本 (a+b) [0]', '(')).not.toThrow();
  expect(() => highlightText('成本 (a+b) [0]', '[')).not.toThrow();
  render(<MemoryRouter><FAQPage /></MemoryRouter>);
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索常见问题' }), { target: { value: '[' } });
  expect(screen.getByText('未找到相关问题')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '查看所有问题' }));
  fireEvent.click(screen.getByRole('button', { name: '如何开启双因素认证（2FA）？' }));
  expect(screen.getByText(/当前产品界面没有双因素认证/)).toBeInTheDocument();
});

test('tutorials expose readable steps and working feature routes', () => {
  render(<MemoryRouter><TutorialPage /></MemoryRouter>);
  expect(screen.getByRole('link', { name: '打开储蓄目标' })).toHaveAttribute('href', '/dashboard?tab=goals');
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索教程' }), { target: { value: '不存在的教程' } });
  expect(screen.getByRole('status')).toHaveTextContent('0 篇');
  fireEvent.click(screen.getByRole('button', { name: '查看所有教程' }));
  expect(screen.getByRole('status')).toHaveTextContent('7 篇');
});

test('feedback produces a downloadable local draft and never claims delivery', async () => {
  URL.createObjectURL = jest.fn(() => 'blob:local-draft');
  URL.revokeObjectURL = jest.fn();
  const view = render(<MemoryRouter><ContactPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('反馈主题'), { target: { value: '按钮体验' } });
  fireEvent.change(screen.getByLabelText('问题描述'), { target: { value: '点击后希望看到保存反馈。' } });
  fireEvent.click(screen.getByRole('button', { name: '生成反馈草稿' }));
  expect(screen.getByRole('status')).toHaveTextContent('尚未发送');
  expect(await screen.findByRole('link', { name: '下载反馈草稿' })).toHaveAttribute('href', 'blob:local-draft');
  expect(screen.getByLabelText('反馈草稿')).toHaveValue('青盈反馈\n主题：按钮体验\n\n点击后希望看到保存反馈。');
  expect(screen.queryByText('我们已收到您的信息')).not.toBeInTheDocument();
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-draft');
});

test('legal document selection survives direct linking and has a working contact route', () => {
  render(<MemoryRouter initialEntries={['/info/legal?tab=user-agreement']}><LegalPage /></MemoryRouter>);
  expect(screen.getByRole('button', { name: '用户协议' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('link', { name: '联系与反馈' })).toHaveAttribute('href', '/info/contact');
});

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboard, { buildUserInsight } from './AdminDashboard';
import { adminListUsers, adminGetUser, adminListKbArticles, adminCreateKbArticle } from '../services/api';
jest.mock('../services/api', () => ({ adminListUsers: jest.fn(), adminGetUser: jest.fn(), adminListKbArticles: jest.fn(), adminCreateKbArticle: jest.fn() }));
jest.mock('../components/KnowledgeUpdatesAdmin', () => () => null);

test('record summary never infers rationality from missing regret feedback', () => {
  const summary = buildUserInsight({ transactions: [{ amount: 100, transaction_type: 'income' }, { amount: 18, transaction_type: 'expense' }] });
  expect(summary).toContain('1 笔消费');
  expect(summary).toContain('无法据此判断消费是否理性');
  expect(summary).not.toContain('消费较为理性');
});

test('user details have a named dialog, labelled close control and correct income sign', async () => {
  adminListUsers.mockResolvedValue({ users: [{ uid: 'demo', profile: { email: 'demo@youthgain.local' } }] });
  adminGetUser.mockResolvedValue({ uid: 'demo', profile: {}, transactions: [{ amount: 100, transaction_type: 'income' }], data_summary: {} });
  render(<MemoryRouter><AdminDashboard section="users" /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: '详情' }));
  expect(await screen.findByRole('dialog', { name: '用户详情' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '消费记录 1' }));
  expect(screen.getByText('+¥100')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '关闭用户详情' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('article save failure stays inside the dialog and preserves the draft', async () => {
  adminListKbArticles.mockResolvedValue({ articles: [] });
  adminCreateKbArticle.mockRejectedValue({ response: { data: { message: '暂时无法保存' } } });
  render(<MemoryRouter><AdminDashboard section="kb" /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: '新增文章' }));
  const title = screen.getByLabelText('标题 *');
  fireEvent.change(title, { target: { value: '检验草稿' } });
  fireEvent.submit(title.closest('form'));
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('暂时无法保存'));
  expect(title).toHaveValue('检验草稿');
});

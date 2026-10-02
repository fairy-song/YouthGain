import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import { getDecisionReport, listTransactions, getUserGoals, createTransaction, getOpportunityCost } from '../services/api';
import { getLearning, getLearningProfile } from '../services/learning';
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: { uid: 'u1' } }) }));
jest.mock('../services/api', () => ({ getDecisionReport: jest.fn(), listTransactions: jest.fn(), getUserGoals: jest.fn(), createTransaction: jest.fn(), getOpportunityCost: jest.fn() }));
jest.mock('../services/learning', () => ({ getLearning: jest.fn(), getLearningProfile: jest.fn() }));
jest.mock('../components/VoiceBillModal', () => () => null);
jest.mock('../components/GoalCashflow', () => ({ __esModule: true, default: () => null, GoalReserveHint: () => null }));
beforeEach(() => {
  jest.resetAllMocks();
  createTransaction.mockResolvedValue({});
  getOpportunityCost.mockResolvedValue({ amount: 20, delay_days: 1, message: '已计算' });
  getLearningProfile.mockResolvedValue({ monthly_income: 2000 });
  getLearning.mockResolvedValue({ entries: [] });
  getDecisionReport.mockResolvedValue({ has_data: false });
  listTransactions.mockResolvedValue({ transactions: [] });
  getUserGoals.mockResolvedValue({ data: { goals: [] } });
});

test('manual entry saves consumption content and displays it in recent transactions', async () => {
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  await screen.findByRole('heading', { name: '记一笔消费' });
  fireEvent.change(screen.getByPlaceholderText('金额（元）'), { target: { value: '20' } });
  fireEvent.change(screen.getByLabelText('消费内容（可选）'), { target: { value: ' 午餐、奶茶 ' } });
  listTransactions.mockResolvedValue({ transactions: [{ id: 'new-bill', date: '2026-10-02', amount: 20, category: '餐饮', items: '午餐、奶茶' }] });
  fireEvent.click(screen.getByRole('button', { name: '记一笔' }));
  expect(await screen.findByText('午餐、奶茶')).toBeInTheDocument();
  expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ amount: 20, items: '午餐、奶茶' }));
  expect(screen.getByLabelText('消费内容（可选）')).toHaveValue('');
  await waitFor(() => expect(screen.getByRole('button', { name: '记一笔' })).toBeEnabled());
});

test('manual entry retains consumption content when saving fails', async () => {
  createTransaction.mockRejectedValue(new Error('网络暂不可用'));
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  await screen.findByRole('heading', { name: '记一笔消费' });
  fireEvent.change(screen.getByPlaceholderText('金额（元）'), { target: { value: '20' } });
  fireEvent.change(screen.getByLabelText('消费内容（可选）'), { target: { value: '教材' } });
  fireEvent.click(screen.getByRole('button', { name: '记一笔' }));
  expect(await screen.findByText('网络暂不可用')).toBeInTheDocument();
  expect(screen.getByLabelText('消费内容（可选）')).toHaveValue('教材');
  expect(screen.getByPlaceholderText('金额（元）')).toHaveValue(20);
});

test('backfilled spending refreshes monthly budget as well as the transaction list', async () => {
  listTransactions.mockResolvedValue({ transactions: [], monthly_budget: { month: '2026-10', budget: 2000, spent: 100, remaining: 1900 } });
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(await screen.findByText('¥1,900')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '补记账单' }));
  fireEvent.change(screen.getByLabelText('金额（元）'), { target: { value: '25' } });
  listTransactions.mockResolvedValue({ transactions: [], monthly_budget: { month: '2026-10', budget: 2000, spent: 125, remaining: 1875 } });
  fireEvent.click(screen.getByRole('button', { name: '保存补记账单' }));
  expect(await screen.findByText('¥1,875')).toBeInTheDocument();
});

test('returning to the page reloads the cumulative monthly budget', async () => {
  listTransactions.mockResolvedValue({ transactions: [], monthly_budget: { budget: 2000, spent: 100, remaining: 1900 } });
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(await screen.findByText('¥1,900')).toBeInTheDocument();
  listTransactions.mockResolvedValue({ transactions: [], monthly_budget: { budget: 2000, spent: 150, remaining: 1850 } });
  fireEvent(window, new Event('focus'));
  expect(await screen.findByText('¥1,850')).toBeInTheDocument();
});

test('leaving the page open across midnight reloads monthly spending', async () => {
  jest.useFakeTimers('modern');
  try {
    jest.setSystemTime(new Date('2026-10-01T12:00:00+08:00'));
    listTransactions.mockResolvedValue({ transactions: [], monthly_budget: { budget: 2000, spent: 100, remaining: 1900 } });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(await screen.findByText('¥1,900')).toBeInTheDocument();
    listTransactions.mockResolvedValue({ transactions: [], monthly_budget: { budget: 2000, spent: 125, remaining: 1875 } });
    jest.setSystemTime(new Date('2026-10-02T00:01:00+08:00'));
    act(() => jest.advanceTimersByTime(60000));
    expect(await screen.findByText('¥1,875')).toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});
test('ledger opens with records only and navigation exposes one section at a time', async () => {
  render(<MemoryRouter initialEntries={['/dashboard']}><Dashboard /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: '记一笔消费' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '设定储蓄目标' })).not.toBeInTheDocument();
  expect(screen.queryByText('这笔钱花了会怎样？')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: '买之前，比较选择' })).toHaveAttribute('href', '/learning?tab=decision');
  fireEvent.click(screen.getByRole('link', { name: '储蓄目标' }));
  expect(await screen.findByRole('heading', { name: '设定储蓄目标' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '记一笔消费' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: '详细分析' }));
  expect(await screen.findByRole('heading', { name: '支出结构' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '设定储蓄目标' })).not.toBeInTheDocument();
});
test('future expense deep links open the relocated feature', async () => {
  render(<MemoryRouter initialEntries={['/dashboard?tab=upcoming']}><Dashboard /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: '未来开支' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '记一笔消费' })).not.toBeInTheDocument();
});

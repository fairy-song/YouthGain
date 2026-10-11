import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import { getDecisionReport, listTransactions, getUserGoals, createTransaction, getOpportunityCost } from '../services/api';
import { getLearning, getLearningProfile } from '../services/learning';
import { dateKey } from '../components/FinanceVisuals';
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
  expect(screen.getByRole('heading', { name: '记一笔消费' }).compareDocumentPosition(screen.getByRole('heading', { name: '消费概览' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText('金额（元）'), { target: { value: '20' } });
  fireEvent.change(screen.getByLabelText('消费内容（可选）'), { target: { value: ' 午餐、奶茶 ' } });
  listTransactions.mockResolvedValue({ transactions: [{ id: 'new-bill', date: '2026-10-02', amount: 20, category: '餐饮', items: '午餐、奶茶' }] });
  fireEvent.click(screen.getByRole('button', { name: '记一笔' }));
  expect(await screen.findByText('午餐、奶茶')).toBeInTheDocument();
  expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ amount: 20, items: '午餐、奶茶' }));
  expect(screen.getByLabelText('消费内容（可选）')).toHaveValue('');
  await waitFor(() => expect(screen.getByRole('button', { name: '记一笔' })).toBeEnabled());
});

test('shows separate monthly spending income and remaining with the refund trail', async () => {
  listTransactions.mockResolvedValue({
    transactions: [
      { id: 'p', date: dateKey(), amount: 100, transaction_type: 'expense', original_amount: '100.00', refunded_amount: '20.00', net_amount: '80.00', category: '购物', source: 'wechat', source_transaction_id: 'P-1' },
      { id: 'r', date: dateKey(), amount: 20, transaction_type: 'refund', related_source_id: 'P-1', category: '购物', source: 'wechat' },
      { id: 'h', date: dateKey(), amount: 30, transaction_type: 'income', receipt_kind: 'red_packet', source: 'wechat' },
    ],
    monthly_budget: { month: dateKey().slice(0, 7), budget: 2000, spent: 80, remaining: 1920, complete: true },
    monthly_cashflow: { spent: 80, gross_expense: 100, refunds: 20, income: 30, remaining: -50,
      income_breakdown: { red_packet: 30, external_transfer: 0, other_income: 0 }, complete: true,
      has_expense_records: true, has_income_records: true },
  });
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  const summary = await screen.findByRole('region', { name: '本月收支摘要' });
  expect(within(summary).getByText('本月收入')).toBeInTheDocument();
  expect(within(summary).getByText('¥30.00')).toBeInTheDocument();
  expect(within(summary).getByText('¥-50.00')).toBeInTheDocument();
  expect(screen.getByText(/原支付 ¥100.00 · 已退 ¥20.00 · 实际支出 ¥80.00/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '导入支出账单' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '导入收款账单' })).toBeInTheDocument();
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

test('saved spending updates budget and charts even when the analysis report fails', async () => {
  listTransactions.mockResolvedValue({ transactions: [], monthly_budget: { budget: 2000, spent: 0, remaining: 2000 } });
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(await screen.findByText('¥2,000')).toBeInTheDocument();
  getDecisionReport.mockRejectedValue(new Error('分析暂时不可用'));
  listTransactions.mockResolvedValue({ transactions: [{ id: 'new', date: dateKey(), amount: 20, category: '餐饮' }],
    monthly_budget: { budget: 2000, spent: 20, remaining: 1980 } });
  fireEvent.change(screen.getByPlaceholderText('金额（元）'), { target: { value: '20' } });
  fireEvent.click(screen.getByRole('button', { name: '记一笔' }));
  expect(await screen.findByText('¥1,980')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /有支出的类别合计 ¥20/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '近七天' }));
  expect(screen.getByRole('button', { name: `${dateKey()}，净消费 ¥20` })).toBeInTheDocument();
});

test('saved spending refreshes without waiting for opportunity-cost feedback', async () => {
  listTransactions.mockResolvedValue({ transactions: [], monthly_budget: { budget: 2000, spent: 0, remaining: 2000 } });
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  await screen.findByText('¥2,000');
  expect(screen.getByText('¥0.00')).toBeInTheDocument();
  getOpportunityCost.mockReturnValue(new Promise(() => {}));
  listTransactions.mockResolvedValue({ transactions: [{ id: 'new', date: dateKey(), amount: 20, category: '餐饮' }],
    monthly_budget: { budget: 2000, spent: 20, remaining: 1980 } });
  fireEvent.change(screen.getByPlaceholderText('金额（元）'), { target: { value: '20' } });
  fireEvent.click(screen.getByRole('button', { name: '记一笔' }));
  expect(await screen.findByText('¥1,980')).toBeInTheDocument();
  expect(screen.getByText('¥20.00')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /有支出的类别合计 ¥20/ })).toBeInTheDocument();
});

test('a late response from an older refresh cannot overwrite updated spending', async () => {
  let resolveOld;
  listTransactions.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  await waitFor(() => expect(listTransactions).toHaveBeenCalledTimes(1));
  listTransactions.mockResolvedValue({ transactions: [{ id: 'new', date: dateKey(), amount: 20, category: '餐饮' }],
    monthly_budget: { budget: 2000, spent: 20, remaining: 1980 } });
  fireEvent(window, new Event('transaction-saved'));
  expect(await screen.findByText('¥1,980')).toBeInTheDocument();
  await act(async () => resolveOld({ transactions: [], monthly_budget: { budget: 2000, spent: 0, remaining: 2000 } }));
  expect(screen.getByText('¥1,980')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /有支出的类别合计 ¥20/ })).toBeInTheDocument();
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

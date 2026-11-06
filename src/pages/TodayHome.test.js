import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import TodayHome from './TodayHome';
import { listTransactions } from '../services/api';
import { getAdaptiveLearning, getLearning } from '../services/learning';
import { shiftCalendarDay } from '../utils/livingFundsProjection';
import { fundsDateKey } from '../utils/dailyFundsBreakdown';
jest.mock('../config/features', () => ({ DAILY_FUNDS_BREAKDOWN_ENABLED: true, LIVING_FUNDS_STRESS_TEST_ENABLED: false }));
jest.mock('../components/DailyPodcast', () => () => null);

jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: { uid: 'student-1', displayName: '小青' } }) }));
jest.mock('../services/api', () => ({ listTransactions: jest.fn() }));
jest.mock('../services/learning', () => ({ getAdaptiveLearning: jest.fn(), getLearning: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.requireMock('../config/features').DAILY_FUNDS_BREAKDOWN_ENABLED = true;
  jest.requireMock('../config/features').LIVING_FUNDS_STRESS_TEST_ENABLED = false;
  jest.requireMock('../config/features').SPENDING_JOURNEY_ENABLED = false;
  getAdaptiveLearning.mockResolvedValue({ next_item: { id: 'one', question: '这笔消费前先确认什么？' }, reason: '来自你记录的开支' });
  getLearning.mockResolvedValue({ entries: [] });
  listTransactions.mockResolvedValue({ monthly_budget: { spent: 20, complete: true } });
});

test('the new practice journey can be switched off without losing the original ledger and practice', async () => {
  jest.requireMock('../config/features').SPENDING_JOURNEY_ENABLED = true;
  const { rerender } = render(<MemoryRouter><TodayHome /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: '钱花出去了，感受跟上了吗？' })).toBeVisible();
  expect(await screen.findByRole('link', { name: /到账本核对或补充记录/ })).toBeVisible();
  jest.requireMock('../config/features').SPENDING_JOURNEY_ENABLED = false;
  rerender(<MemoryRouter><TodayHome /></MemoryRouter>);
  expect(screen.queryByRole('heading', { name: '钱花出去了，感受跟上了吗？' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /打开账本记一笔/ })).toBeVisible();
  expect(screen.getByRole('link', { name: /开始这一步/ })).toBeVisible();
});

test('home expands the existing funds card, refreshes it in place, and can switch the enhancement off', async () => {
  const data = amount => ({
    monthly_budget: { spent: 20, complete: true },
    funds: { available_complete: true, complete: true, available_remaining_month: amount,
      month: new Date().toISOString().slice(0, 7), as_of: new Date().toISOString(), timezone: 'UTC' },
  });
  listTransactions.mockResolvedValue(data(4386));
  const { container, rerender } = render(<MemoryRouter><TodayHome /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /查看每日均分/ }));
  expect(screen.getByText(/¥4,386.00 ÷ 剩余/)).toBeVisible();
  listTransactions.mockResolvedValue(data(4000));
  await act(async () => { window.dispatchEvent(new Event('transaction-saved')); });
  expect(await screen.findByText(/¥4,000.00 ÷ 剩余/)).toBeVisible();
  expect(screen.getByRole('button', { name: /收起换算/ })).toHaveAttribute('aria-expanded', 'true');
  expect(container.querySelector('.funds-breakdown-playing')).toBeNull();
  jest.requireMock('../config/features').DAILY_FUNDS_BREAKDOWN_ENABLED = false;
  rerender(<MemoryRouter><TodayHome /></MemoryRouter>);
  expect(screen.queryByRole('button', { name: /收起换算/ })).not.toBeInTheDocument();
  expect(screen.getByText('本月可用剩余')).toBeVisible();
});

test('shows one practice task and refreshes the ledger amount after a saved transaction', async () => {
  render(<MemoryRouter><TodayHome /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: '这笔消费前先确认什么？' })).toBeInTheDocument();
  expect(screen.getByText('¥20.00')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /开始这一步/ })).toHaveAttribute('href', '/learning?tab=practice');
  listTransactions.mockResolvedValue({ monthly_budget: { spent: 35, complete: true } });
  await act(async () => { window.dispatchEvent(new Event('transaction-saved')); });
  await waitFor(() => expect(screen.getByText('¥35.00')).toBeInTheDocument());
});

test('账本和练习不等未来开支，且只重试失败的开支安排', async () => {
  let failUpcoming;
  getLearning.mockImplementationOnce(() => new Promise((_, reject) => { failUpcoming = reject; }));
  render(<MemoryRouter><TodayHome /></MemoryRouter>);
  expect(await screen.findByText('¥20.00')).toBeVisible();
  expect(await screen.findByRole('heading', { name: '这笔消费前先确认什么？' })).toBeVisible();
  expect(screen.getByText('正在读取开支安排…')).toBeVisible();
  await act(async () => { failUpcoming(new Error('fixture')); });
  fireEvent.click(await screen.findByRole('button', { name: '重试开支' }));
  expect(await screen.findByText(/还没有待处理的开支安排/)).toBeVisible();
  expect(listTransactions).toHaveBeenCalledTimes(1);
  expect(getAdaptiveLearning).toHaveBeenCalledTimes(1);
});

test('shows separate recorded spending income and remaining after a refund', async () => {
  listTransactions.mockResolvedValue({
    monthly_budget: { spent: 80, complete: true },
    monthly_cashflow: { spent: 80, income: 30, remaining: -50, complete: true },
    funds: { complete: true, available_remaining_month: 750, carryover_month: 1000, savings_net_transfer_month: 200, savings_locked_total: 200 },
  });
  render(<MemoryRouter><TodayHome /></MemoryRouter>);
  expect(await screen.findByText('¥80.00')).toBeInTheDocument();
  expect(screen.getByText('¥30.00')).toBeInTheDocument();
  expect(screen.getByText('¥750.00')).toBeInTheDocument();
  expect(screen.queryByText('¥-50.00')).not.toBeInTheDocument();
  expect(screen.getByText(/不包含已锁定的储蓄资金/)).toBeInTheDocument();
});

test('warns when only one side of the cashflow has records', async () => {
  listTransactions.mockResolvedValue({
    monthly_budget: { spent: 0, complete: true },
    monthly_cashflow: { spent: 0, income: 30, remaining: 30, complete: true,
      has_expense_records: false, has_income_records: true },
  });
  render(<MemoryRouter><TodayHome /></MemoryRouter>);
  expect(await screen.findByText(/本月有一侧尚无记录，结余可能不完整/)).toBeInTheDocument();
});

test('does not show an old amount or invented task when reads fail', async () => {
  getAdaptiveLearning.mockRejectedValue(new Error('offline'));
  listTransactions.mockRejectedValue(new Error('offline'));
  render(<MemoryRouter><TodayHome /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: '暂时没能读取练习' })).toBeInTheDocument();
  expect(screen.getByText('账本暂时无法读取。')).toBeInTheDocument();
  expect(screen.queryByText('¥20.00')).not.toBeInTheDocument();
  getAdaptiveLearning.mockResolvedValue({ next_item: null });
  listTransactions.mockResolvedValue({ monthly_budget: { spent: 0, complete: true } });
  fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
  expect(await screen.findByRole('heading', { name: '今天先到这里' })).toBeInTheDocument();
});

test('lets the student compare a purchase and a delayed payday without a usable ledger', async () => {
  jest.requireMock('../config/features').LIVING_FUNDS_STRESS_TEST_ENABLED = true;
  getLearning.mockRejectedValue(new Error('offline'));
  listTransactions.mockRejectedValue(new Error('offline'));
  const { rerender } = render(<MemoryRouter><TodayHome /></MemoryRouter>);
  await screen.findByText('账本暂时无法读取。');
  fireEvent.click(screen.getByRole('button', { name: /试一笔消费/ }));
  expect(screen.queryByRole('button', { name: '带入账本参考' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '用示例试试' }));
  fireEvent.click(screen.getByRole('button', { name: '查看试算结果' }));
  const result = screen.getByRole('region', { name: '生活费试算结果' });
  expect(within(result).getByRole('heading', { name: '生活费试算结果' })).toHaveFocus();
  expect(within(result).getByText('预计还剩 ¥160.00')).toBeVisible();
  expect(within(result).getByText('预计还差 ¥29.00')).toBeVisible();
  expect(within(result).getByText(/首次不足.*当日差 ¥9.00/)).toBeVisible();
  fireEvent.change(screen.getByLabelText('如果到账晚了'), { target: { value: '0' } });
  expect(screen.queryByRole('region', { name: '生活费试算结果' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '查看试算结果' }));
  expect(screen.getByText('预计还剩 ¥31.00')).toBeVisible();
  jest.requireMock('../config/features').LIVING_FUNDS_STRESS_TEST_ENABLED = false;
  rerender(<MemoryRouter><TodayHome /></MemoryRouter>);
  expect(screen.queryByRole('button', { name: /试一笔消费/ })).not.toBeInTheDocument();
});

test('only projects explicitly selected unpaid expenses and only offers a same-day confirmed funds reference', async () => {
  jest.requireMock('../config/features').LIVING_FUNDS_STRESS_TEST_ENABLED = true;
  const now = new Date();
  const today = fundsDateKey(now, 'Asia/Shanghai');
  listTransactions.mockResolvedValue({
    monthly_budget: { spent: 50, complete: true },
    funds: { complete: true, available_complete: true, as_of: now.toISOString(), timezone: 'Asia/Shanghai',
      month: today.slice(0, 7), available_remaining_month: 300 },
  });
  getLearning.mockResolvedValue({ entries: [
    { id: 'next', kind: 'upcoming', title: '考试费', amount: 120, due_date: today, handled: false },
    { id: 'old', kind: 'upcoming', title: '已经处理', amount: 120, due_date: today, handled: true },
  ] });
  render(<MemoryRouter><TodayHome /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: /试一笔消费/ }));
  fireEvent.click(await screen.findByRole('button', { name: '带入账本参考' }));
  fireEvent.change(screen.getByLabelText('下一次预计到账'), { target: { value: shiftCalendarDay(today, 1) } });
  fireEvent.click(screen.getByRole('button', { name: '查看试算结果' }));
  expect(screen.getByText('预计还剩 ¥300.00')).toBeVisible();
  fireEvent.click(screen.getByText('预留必要开支'));
  expect(screen.queryByLabelText(/已经处理/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText(/考试费/));
  fireEvent.click(screen.getByRole('button', { name: '查看试算结果' }));
  expect(screen.getByText('预计还剩 ¥180.00')).toBeVisible();
  expect(screen.getByText(/未填每日开销/)).toBeVisible();
});

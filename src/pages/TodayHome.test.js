import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import TodayHome from './TodayHome';
import { listTransactions } from '../services/api';
import { getAdaptiveLearning, getLearning } from '../services/learning';
jest.mock('../components/DailyPodcast', () => () => null);

jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: { uid: 'student-1', displayName: '小青' } }) }));
jest.mock('../services/api', () => ({ listTransactions: jest.fn() }));
jest.mock('../services/learning', () => ({ getAdaptiveLearning: jest.fn(), getLearning: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  getAdaptiveLearning.mockResolvedValue({ next_item: { id: 'one', question: '这笔消费前先确认什么？' }, reason: '来自你记录的开支' });
  getLearning.mockResolvedValue({ entries: [] });
  listTransactions.mockResolvedValue({ monthly_budget: { spent: 20, complete: true } });
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

test('shows separate recorded spending income and remaining after a refund', async () => {
  listTransactions.mockResolvedValue({
    monthly_budget: { spent: 80, complete: true },
    monthly_cashflow: { spent: 80, income: 30, remaining: -50, complete: true },
  });
  render(<MemoryRouter><TodayHome /></MemoryRouter>);
  expect(await screen.findByText('¥80.00')).toBeInTheDocument();
  expect(screen.getByText('¥30.00')).toBeInTheDocument();
  expect(screen.getByText('¥-50.00')).toBeInTheDocument();
  expect(screen.getByText(/剩余不是账户余额/)).toBeInTheDocument();
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

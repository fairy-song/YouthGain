import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import { getDecisionReport, listTransactions, getUserGoals } from '../services/api';
import { getLearning, getLearningProfile } from '../services/learning';
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: { uid: 'u1' } }) }));
jest.mock('../services/api', () => ({ getDecisionReport: jest.fn(), listTransactions: jest.fn(), getUserGoals: jest.fn() }));
jest.mock('../services/learning', () => ({ getLearning: jest.fn(), getLearningProfile: jest.fn() }));
jest.mock('../components/VoiceBillModal', () => () => null);
jest.mock('../components/GoalCashflow', () => ({ __esModule: true, default: () => null, GoalReserveHint: () => null }));
beforeEach(() => {
  getLearningProfile.mockResolvedValue({ monthly_income: 2000 });
  getLearning.mockResolvedValue({ entries: [] });
  getDecisionReport.mockResolvedValue({ has_data: false });
  listTransactions.mockResolvedValue({ transactions: [] });
  getUserGoals.mockResolvedValue({ data: { goals: [] } });
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

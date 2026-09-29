import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GoalCashflow, { GoalReserveHint } from './GoalCashflow';
import { getGoalPlan } from '../services/api';
jest.mock('../services/api', () => ({ getGoalPlan: jest.fn() }));
const goals = [{ id: 'a', status: 'active', target_amount: 580 }];
const result = { free_now: 320, basic_shortfall: 0, goals: [{ id: 'a', reserve_now: 180,
  reserved: 0, deadline: '2026-10-20', remaining: 580, shortfall: 0, schedule: [{ date: '2026-10-01', amount: 400, now: false }] }] };
const setup = () => render(<MemoryRouter><GoalCashflow goals={goals} /></MemoryRouter>);

test('automatically displays estimates without any balance input even when aged', async () => {
  getGoalPlan.mockResolvedValue({ result, stale: true });
  setup();
  expect(await screen.findByText('¥320.00')).toBeInTheDocument();
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByText('核对余额')).not.toBeInTheDocument();
});

test('missing profile never opens a duplicate financial form', async () => {
  getGoalPlan.mockResolvedValue({ result: null });
  setup();
  expect(await screen.findByText('查看我的财务资料')).toHaveAttribute('href', '/profile');
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
});

test('failed automatic calculation can retry', async () => {
  getGoalPlan.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ result });
  setup();
  fireEvent.click(await screen.findByRole('button', { name: '重新计算' }));
  expect(await screen.findByText('¥320.00')).toBeInTheDocument();
});

test('goal card shows current and next allocation', () => {
  render(<GoalReserveHint goal={goals[0]} result={result} />);
  expect(screen.getByText('现在建议留 ¥180.00')).toBeInTheDocument();
  expect(screen.getByText('2026-10-01 预计到账后再留 ¥400.00')).toBeInTheDocument();
});

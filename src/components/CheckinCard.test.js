import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CheckinCard from './CheckinCard';
import { getCheckin } from '../services/api';

jest.mock('../services/api', () => ({ getCheckin: jest.fn() }));
const summary = {
  today: '2026-09-24', checked_today: false, streak: 2, total_days: 3,
  recent_days: [{ date: '2026-09-24', checked: false }],
};

beforeEach(() => getCheckin.mockReset());

test('successful bookkeeping refreshes check-in without waiting for the report', async () => {
  getCheckin.mockResolvedValueOnce(summary).mockResolvedValue({
    ...summary, checked_today: true, streak: 3, total_days: 4,
    recent_days: [{ date: '2026-09-24', checked: true }],
  });
  render(<CheckinCard transactions={[]} />);
  expect(await screen.findByText('今日待打卡')).toBeInTheDocument();
  act(() => window.dispatchEvent(new Event('transaction-saved')));
  expect(await screen.findByText('今日已打卡')).toBeInTheDocument();
  expect(screen.getByLabelText('2026-09-24 已打卡')).toBeInTheDocument();
});

test('failed load shows retry instead of a false unchecked status', async () => {
  getCheckin.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(summary);
  render(<CheckinCard transactions={[]} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('打卡状态暂时加载失败');
  expect(screen.queryByText('今日待打卡')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('重试'));
  expect(await screen.findByText('今日待打卡')).toBeInTheDocument();
});

test('returning to the page updates the state after midnight', async () => {
  getCheckin.mockResolvedValueOnce({ ...summary, checked_today: true }).mockResolvedValue(summary);
  render(<CheckinCard transactions={[]} />);
  expect(await screen.findByText('今日已打卡')).toBeInTheDocument();
  act(() => window.dispatchEvent(new Event('focus')));
  expect(await screen.findByText('今日待打卡')).toBeInTheDocument();
});

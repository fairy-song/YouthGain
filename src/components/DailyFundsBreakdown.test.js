import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DailyFundsBreakdown from './DailyFundsBreakdown';

const funds = {
  available_remaining_month: 4386, available_complete: true, complete: true,
  month: '2026-10', as_of: '2026-10-28T12:00:00+08:00', timezone: 'Asia/Shanghai',
};
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(funds.as_of));
  window.matchMedia = jest.fn(() => ({ matches: false }));
});
afterEach(() => { jest.useRealTimers(); });

test('keeps formula readable and plays only on the first deliberate expansion', () => {
  const { container, rerender } = render(<DailyFundsBreakdown funds={funds} />);
  const button = screen.getByRole('button', { name: /查看每日均分/ });
  expect(button).toHaveAttribute('aria-expanded', 'false');
  expect(container.querySelector('.funds-breakdown-playing')).toBeNull();
  fireEvent.click(button);
  expect(screen.getByText('¥1,096.50')).toBeVisible();
  expect(screen.getByText('¥4,386.00 ÷ 剩余4天（含今天）')).toBeVisible();
  expect(container.querySelector('.funds-breakdown-playing')).not.toBeNull();
  act(() => jest.advanceTimersByTime(900));
  expect(container.querySelector('.funds-breakdown-playing')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /收起换算/ }));
  fireEvent.click(screen.getByRole('button', { name: /查看每日均分/ }));
  expect(container.querySelector('.funds-breakdown-playing')).toBeNull();
  rerender(<DailyFundsBreakdown funds={{ ...funds, available_remaining_month: 4000 }} />);
  expect(screen.getByText('¥1,000.00')).toBeVisible();
  expect(container.querySelector('.funds-breakdown-playing')).toBeNull();
});

test('respects reduced motion and cleans up date/animation timers on unmount', () => {
  window.matchMedia.mockReturnValue({ matches: true });
  const { container, unmount } = render(<DailyFundsBreakdown funds={funds} />);
  fireEvent.click(screen.getByRole('button', { name: /查看每日均分/ }));
  expect(screen.getByText('¥1,096.50')).toBeVisible();
  expect(container.querySelector('.funds-breakdown-playing')).toBeNull();
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});

test('a background refresh stops a running animation without closing the explanation', () => {
  const { container, rerender } = render(<DailyFundsBreakdown funds={funds} />);
  fireEvent.click(screen.getByRole('button', { name: /查看每日均分/ }));
  expect(container.querySelector('.funds-breakdown-playing')).not.toBeNull();
  rerender(<DailyFundsBreakdown funds={funds} refreshing />);
  expect(container.querySelector('.funds-breakdown-playing')).toBeNull();
  expect(screen.getByText('正在更新资金参考…')).toBeVisible();
  rerender(<DailyFundsBreakdown funds={{ ...funds, available_remaining_month: 4000 }} />);
  expect(screen.getByText('¥1,000.00')).toBeVisible();
  expect(container.querySelector('.funds-breakdown-playing')).toBeNull();
});

test('a fresh snapshot after background sleep uses actual time rather than the last timer tick', () => {
  const onRefresh = jest.fn();
  const { rerender } = render(<DailyFundsBreakdown funds={funds} onRefresh={onRefresh} />);
  jest.setSystemTime(new Date('2026-10-29T12:00:00+08:00'));
  rerender(<DailyFundsBreakdown funds={{ ...funds, as_of: '2026-10-29T12:00:00+08:00' }} onRefresh={onRefresh} />);
  fireEvent.click(screen.getByRole('button', { name: /查看每日均分/ }));
  expect(screen.getByText('¥1,462.00')).toBeVisible();
  expect(onRefresh).not.toHaveBeenCalled();
});

test('invalidates an open result at midnight and bounds automatic refresh attempts', () => {
  const onRefresh = jest.fn();
  render(<DailyFundsBreakdown funds={funds} onRefresh={onRefresh} />);
  fireEvent.click(screen.getByRole('button', { name: /查看每日均分/ }));
  jest.setSystemTime(new Date('2026-10-29T00:00:00+08:00'));
  act(() => jest.advanceTimersByTime(60000));
  expect(screen.queryByText('¥1,096.50')).not.toBeInTheDocument();
  expect(onRefresh).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(180000));
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

test('checks date on expansion without waiting for the periodic timer', () => {
  const onRefresh = jest.fn();
  render(<DailyFundsBreakdown funds={funds} onRefresh={onRefresh} />);
  jest.setSystemTime(new Date('2026-11-01T00:00:00+08:00'));
  fireEvent.click(screen.getByRole('button', { name: /查看每日均分/ }));
  expect(screen.queryByText('¥1,096.50')).not.toBeInTheDocument();
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

test.each([
  [{ available_complete: false, available_remaining_month: -10 }, '资金信息确认后可查看均分参考。'],
  [{ available_remaining_month: 0 }, '当前可用剩余为 ¥0.00。'],
  [{ available_remaining_month: -10 }, '按已记录资金，本月可用资金不足 ¥10.00。'],
  [{ available_remaining_month: .01 }, '不足 ¥0.01'],
])('handles nonstandard balances without misleading coins', (changes, text) => {
  const { container } = render(<DailyFundsBreakdown funds={{ ...funds, ...changes }} />);
  fireEvent.click(screen.getByRole('button', { name: /查看每日均分/ }));
  expect(screen.getByText(text)).toBeVisible();
  if (changes.available_remaining_month <= 0) expect(container.querySelector('svg')).toBeNull();
});

test('invalid metadata cannot cause an automatic refresh loop', () => {
  const onRefresh = jest.fn();
  const invalid = { ...funds, timezone: undefined };
  const { rerender } = render(<DailyFundsBreakdown funds={invalid} onRefresh={onRefresh} />);
  expect(onRefresh).toHaveBeenCalledTimes(1);
  rerender(<DailyFundsBreakdown funds={invalid} refreshing onRefresh={onRefresh} />);
  rerender(<DailyFundsBreakdown funds={{ ...invalid, as_of: '2026-10-28T12:01:00+08:00' }} onRefresh={onRefresh} />);
  act(() => jest.advanceTimersByTime(180000));
  expect(onRefresh).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: /查看每日均分/ }));
  expect(onRefresh).toHaveBeenCalledTimes(2);
});

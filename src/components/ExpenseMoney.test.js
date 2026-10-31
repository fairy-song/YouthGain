import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExpenseMoney from './ExpenseMoney';

beforeEach(() => { window.matchMedia = jest.fn(() => ({ matches: false })); });

test('labels exact quantities and limits drawn layers for large spending', () => {
  const { container } = render(<ExpenseMoney amount={100000000} />);
  expect(screen.getByText('× 1,000,000张')).toBeInTheDocument();
  expect(container.querySelectorAll('svg > g')).toHaveLength(3);
  expect(container.querySelectorAll('svg')).toHaveLength(1);
});

test('confirmed spending moves once, settles, and does not replay on an ordinary render', () => {
  jest.useFakeTimers();
  const { container, rerender, unmount } = render(<ExpenseMoney amount={38.67} animate />);
  expect(container.querySelector('.expense-money-moving')).not.toBeNull();
  expect(screen.getByText('合计 ¥38.67 · 已计入这笔支出')).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1500));
  expect(container.querySelector('.expense-money-spent')).not.toBeNull();
  rerender(<ExpenseMoney amount={38.67} animate />);
  expect(container.querySelector('.expense-money-moving')).toBeNull();
  unmount();
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

test('static history and reduced motion show readable money without animation', () => {
  window.matchMedia.mockReturnValue({ matches: true });
  const { container, rerender } = render(<ExpenseMoney amount={38} animate />);
  expect(screen.getByText('× 3枚')).toBeInTheDocument();
  expect(container.querySelector('.expense-money-moving')).toBeNull();
  rerender(<ExpenseMoney amount={38} title="这笔原支付" note="退款另记" />);
  expect(screen.getByText('退款另记')).toBeInTheDocument();
  expect(container.querySelector('.expense-money-still')).not.toBeNull();
});

test('invalid amount has no visual or timer', () => {
  const { container } = render(<ExpenseMoney amount={null} animate />);
  expect(container).toBeEmptyDOMElement();
});

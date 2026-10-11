import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FinanceVisuals, { summarizeTransactions, ComparisonBars } from './FinanceVisuals';

test('aggregates numeric strings and excludes invalid and future expenses across month boundaries', () => {
  const result = summarizeTransactions([
    { date: '2026-09-30', category: '餐饮', amount: '25.5' },
    { date: '2026-10-01', category: '餐饮', amount: 10 },
    { date: '2026-10-02', category: '交通', amount: 200 },
    { date: '2026-10-01', amount: -20 },
    { date: '2026-10-01', amount: 'invalid' },
  ], '2026-10-01');
  expect(result.categories).toEqual([{ label: '餐饮', value: 35.5 }]);
  expect(result.days).toHaveLength(7);
  expect(result.days[5]).toMatchObject({ key: '2026-09-30', value: 25.5 });
  expect(result.days[6].value).toBe(10);
});

test('category controls filter and can clear a selected category', () => {
  const onCategory = jest.fn();
  const transactions = [{ date: '2020-01-01', category: '餐饮', amount: 20 }];
  const { rerender } = render(<FinanceVisuals transactions={transactions} onCategory={onCategory} />);
  fireEvent.click(screen.getByRole('button', { name: /餐饮/ }));
  expect(onCategory).toHaveBeenLastCalledWith('餐饮');
  rerender(<FinanceVisuals transactions={transactions} onCategory={onCategory} selectedCategory="餐饮" />);
  fireEvent.click(screen.getByRole('button', { name: /餐饮/ }));
  expect(onCategory).toHaveBeenLastCalledWith('');
  fireEvent.click(screen.getByRole('button', { name: '近七天' }));
  expect(screen.getByRole('group', { name: '近七天已记录净消费柱状图' })).toBeInTheDocument();
});

test('empty data does not invent a chart; negative budget is explicitly marked', () => {
  const { unmount } = render(<FinanceVisuals transactions={[]} onCategory={() => {}} />);
  expect(screen.getByText(/还没有可展示的净消费/)).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  unmount();
  render(<ComparisonBars items={[{ label: '现在购买', value: -200 }, { label: '暂不购买', value: 0 }]} />);
  expect(screen.getByText('¥-200（不足）')).toBeInTheDocument();
  expect(screen.getByText('¥0')).toBeInTheDocument();
});

test('linked refunds reduce chart amounts while income and transfers are ignored', () => {
  const result = summarizeTransactions([
    { date: '2026-10-01', category: '餐饮', amount: '25.00', transaction_type: 'expense' },
    { date: '2026-10-01', category: '餐饮', amount: '5.00', transaction_type: 'refund' },
    { date: '2026-10-01', category: '餐饮', amount: '100.00', transaction_type: 'income' },
    { date: '2026-10-01', category: '餐饮', amount: '30.00', transaction_type: 'transfer' },
  ], '2026-10-01');
  expect(result.categories).toEqual([{ label: '餐饮', value: 20 }]);
  expect(result.days[6].value).toBe(20);
});

test('cross-month refunds remain visible when a category has negative net spending', () => {
  const transactions = [
    { date: '2026-10-01', category: '餐饮', amount: 25, transaction_type: 'expense' },
    { date: '2026-10-01', category: '购物', amount: 40, transaction_type: 'refund' },
  ];
  const result = summarizeTransactions(transactions, '2026-10-01');
  expect(result.categories).toEqual([{ label: '餐饮', value: 25 }]);
  expect(result.refundCredits).toEqual([{ label: '购物', value: -40 }]);
  expect(result.days[6].value).toBe(-15);
  render(<FinanceVisuals transactions={transactions} onCategory={() => {}} />);
  expect(screen.getByText(/购物 ¥-40/)).toBeInTheDocument();
});

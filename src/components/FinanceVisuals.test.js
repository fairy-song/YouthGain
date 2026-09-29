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
  expect(screen.getByRole('group', { name: '近七天已记录支出柱状图' })).toBeInTheDocument();
});

test('empty data does not invent a chart; negative budget is explicitly marked', () => {
  const { unmount } = render(<FinanceVisuals transactions={[]} onCategory={() => {}} />);
  expect(screen.getByText(/还没有可展示的消费/)).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  unmount();
  render(<ComparisonBars items={[{ label: '现在购买', value: -200 }, { label: '暂不购买', value: 0 }]} />);
  expect(screen.getByText('¥-200（不足）')).toBeInTheDocument();
  expect(screen.getByText('¥0')).toBeInTheDocument();
});

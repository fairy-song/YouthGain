import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import FinanceVisuals, { ComparisonBars } from './FinanceVisuals';

const cashflow = (changes = {}) => ({
  month: '2026-10', complete: true, spent: 60, gross_expense: 100, refunds: 40,
  category_breakdown: [
    { category: '餐饮', gross_expense: 100, refunds: 0, net: 100 },
    { category: '购物', gross_expense: 0, refunds: 40, net: -40 },
  ],
  daily_spending: [
    { date: '2026-09-30', spent: 100 }, { date: '2026-10-01', spent: -40 },
    { date: '2026-10-02', spent: 0 }, { date: '2026-10-03', spent: 0 },
    { date: '2026-10-04', spent: 0 }, { date: '2026-10-05', spent: 0 },
    { date: '2026-10-06', spent: 0 },
  ], ...changes,
});

test('monthly donut shows the ledger total after refunds, independently of positive category shares', () => {
  render(<FinanceVisuals monthlyCashflow={cashflow()} onCategory={() => {}} showBudgetSummary={false} />);
  expect(screen.getAllByText('¥60.00')).toHaveLength(2);
  const categories = screen.getByRole('group', { name: '本月各类别净支出' });
  expect(within(categories).getByRole('button', { name: /购物.*¥-40.00.*净回款/ })).toBeInTheDocument();
  expect(within(categories).getByText(/原支付 ¥0.00 − 已退 ¥40.00/)).toBeInTheDocument();
  const pie = screen.getByRole('img', { name: '本月支出构成圆环图' });
  expect(within(pie).getByText('餐饮：¥100.00，占比 100%')).toBeInTheDocument();
  expect(within(pie).getByText('本月总支出')).toBeInTheDocument();
  expect(within(pie).getByText('¥60.00')).toBeInTheDocument();
  expect(within(pie).getByText('已扣除关联退款')).toBeInTheDocument();
  expect(within(pie).queryByText(/购物/)).not.toBeInTheDocument();
  expect(screen.getByText(/圆环仅计算正向净支出的占比/)).toBeInTheDocument();
});

test('category percentages use spending after linked refunds and update with the ledger', () => {
  const data = cashflow({ spent: 100, gross_expense: 120, refunds: 20, category_breakdown: [
    { category: '餐饮', gross_expense: 80, refunds: 20, net: 60 },
    { category: '交通', gross_expense: 40, refunds: 0, net: 40 },
  ] });
  const { rerender } = render(<FinanceVisuals monthlyCashflow={data} onCategory={() => {}} showBudgetSummary={false} />);
  const pie = screen.getByRole('img', { name: '本月支出构成圆环图' });
  expect(within(pie).getByText('餐饮：¥60.00，占比 60%')).toBeInTheDocument();
  expect(within(pie).getByText('交通：¥40.00，占比 40%')).toBeInTheDocument();
  rerender(<FinanceVisuals monthlyCashflow={cashflow({ spent: 0, gross_expense: 80, refunds: 80,
    category_breakdown: [{ category: '餐饮', gross_expense: 80, refunds: 80, net: 0 }] })}
    onCategory={() => {}} showBudgetSummary={false} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText('本月暂无正向净支出可绘制圆环图。')).toBeInTheDocument();
  expect(screen.getByText(/原支付 ¥80.00 − 已退 ¥80.00/)).toBeInTheDocument();
});

test('category controls filter recent records without recalculating the monthly amount', () => {
  const onCategory = jest.fn();
  const { rerender } = render(<FinanceVisuals monthlyCashflow={cashflow()} onCategory={onCategory} showBudgetSummary={false} />);
  fireEvent.click(screen.getByRole('button', { name: /餐饮.*¥100.00/ }));
  expect(onCategory).toHaveBeenLastCalledWith('餐饮');
  rerender(<FinanceVisuals monthlyCashflow={cashflow()} onCategory={onCategory} selectedCategory="餐饮" showBudgetSummary={false} />);
  fireEvent.click(screen.getByRole('button', { name: /餐饮.*¥100.00/ }));
  expect(onCategory).toHaveBeenLastCalledWith('');
  expect(within(screen.getByRole('img', { name: '本月支出构成圆环图' })).getByText('¥60.00')).toBeInTheDocument();
});

test('seven-day chart states its separate cross-month range and shows signed refunds', () => {
  render(<FinanceVisuals monthlyCashflow={cashflow()} onCategory={() => {}} showBudgetSummary={false} />);
  fireEvent.click(screen.getByRole('button', { name: '近七天' }));
  expect(screen.getByText(/2026-09-30 至 2026-10-06.*该范围可能跨月/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '2026-10-01，净消费 ¥-40.00' }));
  expect(screen.getByText(/2026-10-01：净消费 ¥-40.00/)).toBeInTheDocument();
});

test('a failed or old response does not invent a chart from recent transactions', () => {
  render(<FinanceVisuals monthlyCashflow={{ complete: false }} onCategory={() => {}} showBudgetSummary={false} />);
  expect(screen.getByText(/消费概览暂无法汇总/)).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: '本月各类别净支出' })).not.toBeInTheDocument();
});

test('refund-only month keeps signed totals without inventing a pie', () => {
  render(<FinanceVisuals monthlyCashflow={cashflow({ spent: -40, gross_expense: 0,
    category_breakdown: [{ category: '购物', gross_expense: 0, refunds: 40, net: -40 }] })}
    onCategory={() => {}} showBudgetSummary={false} />);
  expect(screen.getByText('¥-40.00')).toBeInTheDocument();
  expect(screen.getByText(/本月净回款/)).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText('本月暂无正向净支出可绘制圆环图。')).toBeInTheDocument();
});

test('comparison bars still mark a negative option as insufficient', () => {
  render(<ComparisonBars items={[{ label: '现在购买', value: -200 }, { label: '暂不购买', value: 0 }]} />);
  expect(screen.getByText('¥-200（不足）')).toBeInTheDocument();
  expect(screen.getByText('¥0')).toBeInTheDocument();
});

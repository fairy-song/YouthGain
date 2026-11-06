import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, useLocation } from 'react-router-dom';
import SpendingJourney from './SpendingJourney';

const cashflow = { complete: true, month: '2026-11', spent: 80, category_breakdown: [
  { category: '餐饮', gross_expense: 100, refunds: 20, net: 80 },
  { category: '购物', gross_expense: 30, refunds: 30, net: 0 },
] };
const Destination = () => <output data-testid="destination">{JSON.stringify(useLocation().state)}</output>;
const view = props => render(<MemoryRouter><SpendingJourney {...props} /><Destination /></MemoryRouter>);

test('requires personal confirmation and carries an observation to coach without sending it', () => {
  view({ cashflow });
  expect(screen.queryByRole('link', { name: /带着这次观察/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('展开成实实在在的钱'));
  expect(screen.getByRole('region', { name: '餐饮累计净支出的钱币展示' })).toBeVisible();
  fireEvent.click(screen.getByLabelText('比我预想的多'));
  fireEvent.click(screen.getByRole('link', { name: /带着这次观察/ }));
  expect(screen.getByTestId('destination')).toHaveTextContent('净支出 80.00 元');
  expect(screen.getByTestId('destination')).toHaveTextContent('不要直接认定我浪费');
});

test('selecting a different category clears confirmation and zero net does not imply no spending', () => {
  view({ cashflow });
  fireEvent.click(screen.getByLabelText('在我的预期内'));
  fireEvent.change(screen.getByLabelText('这次想看哪一类？'), { target: { value: '购物' } });
  expect(screen.getByLabelText('在我的预期内')).not.toBeChecked();
  expect(screen.getByText(/不能据此认定本月没有消费/)).toBeVisible();
  expect(screen.queryByText('展开成实实在在的钱')).not.toBeInTheDocument();
});

test('empty recorded month supports low-input entry without claiming zero real spending', () => {
  view({ cashflow: { complete: true, month: '2026-11', spent: 0, category_breakdown: [] } });
  expect(screen.getByText(/这不代表你没有花钱/)).toBeVisible();
  expect(screen.getByRole('link', { name: /记一笔或导入/ })).toHaveAttribute('href', '/dashboard');
});

test('incomplete aggregates do not produce insights or invented AI labels', () => {
  view({ cashflow: { ...cashflow, complete: false } });
  expect(screen.getByText(/不能据此判断你的消费情况/)).toBeVisible();
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
});

test('failed refresh hides previous money and supports retry', () => {
  const onRetry = jest.fn();
  view({ cashflow, error: true, onRetry });
  expect(screen.queryByText('¥80.00')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重试消费汇总' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('returning student can revisit their own action without a streak requirement', () => {
  view({ entries: [{ kind: 'review', week: '2026-09-01', next_action: '先留车费' }] });
  expect(screen.getByText('先留车费')).toBeVisible();
  expect(screen.getByRole('link', { name: /回看上次行动/ })).toHaveAttribute('href', '/learning?tab=review');
});

test('background refresh preserves selection for unchanged facts, but changed amounts require fresh confirmation', () => {
  const { rerender } = view({ cashflow });
  fireEvent.click(screen.getByLabelText('比我预想的多'));
  const update = props => rerender(<MemoryRouter><SpendingJourney {...props} /><Destination /></MemoryRouter>);
  update({ cashflow, loading: true });
  expect(screen.getByLabelText('比我预想的多')).toBeChecked();
  expect(screen.getByLabelText('比我预想的多')).toBeDisabled();
  expect(screen.queryByRole('link', { name: /带着这次观察/ })).not.toBeInTheDocument();
  update({ cashflow, loading: false });
  expect(screen.getByLabelText('比我预想的多')).toBeChecked();
  update({ cashflow: { ...cashflow, spent: 90, category_breakdown: [{ ...cashflow.category_breakdown[0], gross_expense: 110, net: 90 }] } });
  expect(screen.getByLabelText('比我预想的多')).not.toBeChecked();
});

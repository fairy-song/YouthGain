import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MonthlyAvailableFunds from './MonthlyAvailableFunds';
import { authenticatedApi } from '../services/api';

jest.mock('../services/api', () => ({ authenticatedApi: { post: jest.fn() } }));

test('missing opening is unknown rather than zero; confirming carryover preserves the server month', async () => {
  authenticatedApi.post.mockResolvedValue({ data: {} });
  const onSaved = jest.fn();
  render(<MonthlyAvailableFunds funds={{ month: '2026-09', complete: false, savings_locked_total: 200 }} editable onSaved={onSaved} />);
  expect(screen.getByText('本月可用剩余')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /查看每日均分/ })).not.toBeInTheDocument();
  expect(screen.getByText('资金资料待核对')).toBeInTheDocument();
  expect(screen.queryByText('¥0.00')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('核对期初资金'));
  fireEvent.change(screen.getByLabelText('确认本月期初日常结转（已排除锁定资金）'), { target: { value: '1000' } });
  fireEvent.click(screen.getByRole('button', { name: '保存结转' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(authenticatedApi.post).toHaveBeenCalledWith('/decision/funds/carryover',
    expect.objectContaining({ month: '2026-09', amount: 1000, event_id: expect.any(String) }));
});

test('a failed confirmation shows the server error and keeps the entered amount', async () => {
  authenticatedApi.post.mockRejectedValue({ response: { data: { message: '来源暂不可用' } } });
  render(<MonthlyAvailableFunds funds={{ month: '2026-10', available_remaining_month: -10, savings_locked_total: 200 }} editable />);
  expect(screen.getByText('资金资料待核对')).toBeInTheDocument();
  expect(screen.queryByText('¥-10.00')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('核对期初资金'));
  fireEvent.change(screen.getByLabelText('确认本月期初日常结转（已排除锁定资金）'), { target: { value: '500' } });
  fireEvent.click(screen.getByRole('button', { name: '保存结转' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('来源暂不可用');
  expect(screen.getByLabelText('确认本月期初日常结转（已排除锁定资金）')).toHaveValue(500);
});

test.each([0, 12.5, -12.5])('confirmed available funds preserve %s including a real deficit', amount => {
  render(<MonthlyAvailableFunds funds={{ available_complete: true, complete: true, available_remaining_month: amount }} editable />);
  expect(screen.getByText(`¥${amount.toFixed(2)}`)).toBeInTheDocument();
  expect(screen.queryByText('资金资料待核对')).not.toBeInTheDocument();
});

test('failed ledger completeness cannot be presented as confirmed funds', () => {
  render(<MonthlyAvailableFunds funds={{ available_complete: true, complete: false, available_remaining_month: 200 }} editable />);
  expect(screen.queryByText('¥200.00')).not.toBeInTheDocument();
  expect(screen.getByText('资金资料待核对')).toBeInTheDocument();
});

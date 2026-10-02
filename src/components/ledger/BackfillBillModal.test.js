import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import BackfillBillModal, { pastDate } from './BackfillBillModal';
import { dateKey } from '../FinanceVisuals';
import { createTransaction } from '../../services/api';
jest.mock('../../services/api', () => ({ createTransaction: jest.fn() }));
beforeEach(() => { jest.resetAllMocks(); createTransaction.mockResolvedValue({}); });
const submit = () => fireEvent.submit(screen.getByRole('button', { name: '保存补记账单' }).closest('form'));

test('date shortcuts correctly cross month and leap-year boundaries', () => {
  expect(pastDate(1, '2026-10-01')).toBe('2026-09-30');
  expect(pastDate(1, '2024-03-01')).toBe('2024-02-29');
  expect(pastDate(1, '2026-01-01')).toBe('2025-12-31');
});
test('saves the actual historical date, refreshes once and keeps date for another bill', async () => {
  const onSaved = jest.fn().mockResolvedValue();
  render(<BackfillBillModal onClose={() => {}} onSaved={onSaved} />);
  expect(screen.getByLabelText('实际消费日期')).toHaveValue(pastDate());
  fireEvent.click(screen.getByRole('button', { name: '一周前' }));
  fireEvent.change(screen.getByLabelText('金额（元）'), { target: { value: '25.50' } });
  fireEvent.change(screen.getByLabelText('消费类别'), { target: { value: '交通' } });
  fireEvent.change(screen.getByLabelText('消费内容（可选）'), { target: { value: ' 地铁票 ' } });
  submit();
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ date: pastDate(7), amount: 25.5, category: '交通', items: '地铁票' }));
  expect(screen.getByLabelText('消费内容（可选）')).toHaveValue('');
  expect(screen.getByRole('status')).toHaveTextContent('已补记');
  expect(screen.getByLabelText('金额（元）')).toHaveValue(null);
  expect(screen.getByLabelText('实际消费日期')).toHaveValue(pastDate(7));
});
test('today is not accepted by the historical entry even if browser validation is bypassed', async () => {
  render(<BackfillBillModal onClose={() => {}} onSaved={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('实际消费日期'), { target: { value: dateKey() } });
  fireEvent.change(screen.getByLabelText('金额（元）'), { target: { value: '20' } });
  submit();
  expect(await screen.findByText(/请选择今天之前/)).toBeInTheDocument();
  expect(createTransaction).not.toHaveBeenCalled();
});
test('save failure preserves entered values for retry', async () => {
  createTransaction.mockRejectedValue(new Error('网络暂不可用'));
  render(<BackfillBillModal onClose={() => {}} onSaved={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('金额（元）'), { target: { value: '20' } });
  fireEvent.change(screen.getByLabelText('备注（可选）'), { target: { value: '补记午餐' } });
  fireEvent.change(screen.getByLabelText('消费内容（可选）'), { target: { value: '午餐' } });
  submit();
  expect(await screen.findByText('网络暂不可用')).toBeInTheDocument();
  expect(screen.getByLabelText('金额（元）')).toHaveValue(20);
  expect(screen.getByLabelText('备注（可选）')).toHaveValue('补记午餐');
  expect(screen.getByLabelText('消费内容（可选）')).toHaveValue('午餐');
});
test('refresh failure offers a refresh-only retry without creating another bill', async () => {
  const onSaved = jest.fn().mockRejectedValueOnce(new Error('刷新失败')).mockResolvedValueOnce();
  render(<BackfillBillModal onClose={() => {}} onSaved={onSaved} />);
  fireEvent.change(screen.getByLabelText('金额（元）'), { target: { value: '20' } });
  submit();
  const retry = await screen.findByRole('button', { name: '只刷新账本' });
  await waitFor(() => expect(retry).toBeEnabled());
  fireEvent.click(retry);
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
  expect(createTransaction).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole('button', { name: '只刷新账本' })).not.toBeInTheDocument());
});

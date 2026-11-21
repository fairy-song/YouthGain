import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import UpcomingExpenses from './UpcomingExpenses';
import { getLearning, saveLearningEntry, updateUpcoming } from '../services/learning';
jest.mock('../services/learning', () => ({ getLearning: jest.fn(), saveLearningEntry: jest.fn(), updateUpcoming: jest.fn(), learningError: e => e.message }));
beforeEach(() => { jest.clearAllMocks(); getLearning.mockResolvedValue({ entries: [] }); });
test('future expenses remain editable in the ledger using the original storage', async () => {
  render(<UpcomingExpenses />);
  await screen.findByText(/暂无安排/);
  fireEvent.change(screen.getByLabelText('未来开支事项'), { target: { value: '考试费' } });
  fireEvent.change(screen.getByLabelText('未来开支金额'), { target: { value: '200' } });
  fireEvent.change(screen.getByLabelText('未来开支日期'), { target: { value: '2026-10-10' } });
  fireEvent.click(screen.getByRole('button', { name: '保存开支安排' }));
  await waitFor(() => expect(saveLearningEntry).toHaveBeenCalledWith('upcoming', { title: '考试费', amount: '200', due_date: '2026-10-10' }));
  expect(await screen.findByText('开支安排已保存。')).toBeInTheDocument();
});
test('existing reminders can be marked handled without creating a transaction', async () => {
  getLearning.mockResolvedValue({ entries: [{ id: 'u1', kind: 'upcoming', title: '考试费', amount: 200, due_date: '2026-10-10', handled: false }] });
  render(<UpcomingExpenses />);
  fireEvent.click(await screen.findByText('已记账或无需支付？'));
  fireEvent.click(screen.getByRole('button', { name: '标记已处理' }));
  await waitFor(() => expect(updateUpcoming).toHaveBeenCalledWith('u1', true));
  expect(await screen.findByText('已标记处理；如已付款且尚未记账，可去记这笔支出。')).toBeInTheDocument();
});


test('an unpaid item can go directly to recording, and a selected item receives focus', async () => {
  const entry = { id: 'old', kind: 'upcoming', title: '过期考试费', amount: 800, due_date: '2020-01-01' };
  getLearning.mockResolvedValue({ entries: [entry] });
  const onRecordExpense = jest.fn();
  render(<UpcomingExpenses selectedEntryId="old" onRecordExpense={onRecordExpense} />);
  const row = await screen.findByRole('article', { name: '过期考试费' });
  await waitFor(() => expect(row).toHaveFocus());
  fireEvent.click(screen.getByRole('button', { name: '去记这笔支出' }));
  expect(onRecordExpense).toHaveBeenCalledWith(entry);
  expect(updateUpcoming).not.toHaveBeenCalled();
});

test('an unknown selected id is explained instead of implying the item was processed', async () => {
  render(<UpcomingExpenses selectedEntryId="other-account-id" />);
  expect(await screen.findByText('未在当前账户找到这项安排，请核对下面的列表。')).toBeInTheDocument();
  expect(updateUpcoming).not.toHaveBeenCalled();
});


test('handled items require an explicit backfill choice rather than encouraging a duplicate expense', async () => {
  const entry = { id: 'paid', kind: 'upcoming', title: '已处理考试费', amount: 200, due_date: '2020-01-01', handled: true };
  getLearning.mockResolvedValue({ entries: [entry] });
  const onRecordExpense = jest.fn();
  render(<UpcomingExpenses onRecordExpense={onRecordExpense} />);
  await screen.findByText(/已处理考试费/);
  expect(screen.getByRole('button', { name: '去记这笔支出' })).not.toBeVisible();
  fireEvent.click(screen.getByText('已处理但还没记账？'));
  fireEvent.click(screen.getByRole('button', { name: '去记这笔支出' }));
  expect(onRecordExpense).toHaveBeenCalledWith(entry);
  expect(updateUpcoming).not.toHaveBeenCalled();
});

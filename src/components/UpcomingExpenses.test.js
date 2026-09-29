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
  fireEvent.click(await screen.findByRole('button', { name: '标记已处理' }));
  await waitFor(() => expect(updateUpcoming).toHaveBeenCalledWith('u1', true));
  expect(await screen.findByText('已标记处理；实际支出请另行记账。')).toBeInTheDocument();
});

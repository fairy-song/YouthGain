import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import AdaptivePractice from './AdaptivePractice';
import { getAdaptiveLearning, submitAdaptiveAnswer } from '../services/learning';
jest.mock('../services/learning', () => ({ getAdaptiveLearning: jest.fn(), submitAdaptiveAnswer: jest.fn(), learningError: e => e.message }));
const item = { id: 'budget-basic', question: '怎样预留考试费？', level: '基础', options: ['只看余额', '预留未来开支'] };
const data = { items: [item], next_item: item, reason: '优先补充证据', limitation: '不是能力诊断', states: [{ topic: 'budget', title: '预算', status: '待观察', observed: 0 }] };
const setup = () => render(<MemoryRouter><AdaptivePractice /></MemoryRouter>);
beforeEach(() => { jest.clearAllMocks(); getAdaptiveLearning.mockResolvedValue(data); });
test('submit selected answer, show evidence and refresh recommendation', async () => {
  submitAdaptiveAnswer.mockResolvedValue({ correct: true, evidence: '预留未来开支', explanation: '月底考试费也要预留。' });
  setup(); fireEvent.click(await screen.findByLabelText('预留未来开支'));
  fireEvent.click(screen.getByRole('button', { name: '查看反馈并保存' }));
  expect(await screen.findByText('月底考试费也要预留。')).toBeInTheDocument();
  expect(submitAdaptiveAnswer).toHaveBeenCalledWith({ item_id: 'budget-basic', choice: 1 });
  await waitFor(() => expect(getAdaptiveLearning).toHaveBeenCalledTimes(2));
});
test('failed submission preserves selected answer for retry', async () => {
  submitAdaptiveAnswer.mockRejectedValue(new Error('保存失败'));
  setup(); fireEvent.click(await screen.findByLabelText('只看余额'));
  fireEvent.click(screen.getByRole('button', { name: '查看反馈并保存' }));
  expect(await screen.findByText('保存失败')).toBeInTheDocument();
  expect(screen.getByLabelText('只看余额')).toBeChecked();
});
test('load error has a working retry', async () => {
  getAdaptiveLearning.mockRejectedValueOnce(new Error('暂不可用'));
  setup(); fireEvent.click(await screen.findByRole('button', { name: '刷新推荐' }));
  expect(await screen.findByLabelText('只看余额')).toBeInTheDocument();
});
test('saved answer with failed refresh does not claim save failure', async () => {
  getAdaptiveLearning.mockResolvedValueOnce(data).mockRejectedValueOnce(new Error('offline'));
  submitAdaptiveAnswer.mockResolvedValue({ correct: false, evidence: '只看余额', explanation: '考虑未来开支。' });
  setup(); fireEvent.click(await screen.findByLabelText('只看余额'));
  fireEvent.click(screen.getByRole('button', { name: '查看反馈并保存' }));
  expect(await screen.findByText('答案已保存，但推荐刷新失败，请刷新推荐。')).toBeInTheDocument();
  expect(screen.getByText('考虑未来开支。')).toBeInTheDocument();
});

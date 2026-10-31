import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Assessment from './Assessment';
import { submitAssessmentNew, getAssessmentHistory } from '../services/api';
jest.mock('../services/api', () => ({ submitAssessmentNew: jest.fn(), getAssessmentHistory: jest.fn() }));
jest.mock('../services/learning', () => ({ getLearningProfile: jest.fn(), saveLearningProfile: jest.fn() }));

test('eight answers always match the API topic order and appear in saved history', async () => {
  submitAssessmentNew.mockResolvedValue({});
  getAssessmentHistory.mockResolvedValue({ history: [{ id: 'a1', version: 2, timestamp: '2026-10-29', total_score_percentage: 50, category_scores_percentage: { budget: 50, choice: 50, buffer: 50, risk: 50 } }] });
  render(<MemoryRouter><Assessment /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: '立即开始' }));
  for (let i = 0; i < 8; i += 1) fireEvent.click(screen.getByRole('button', { name: '偶尔会这样做' }));
  fireEvent.click(screen.getByRole('button', { name: '保存结果' }));
  await waitFor(() => expect(submitAssessmentNew).toHaveBeenCalledTimes(1));
  const answers = submitAssessmentNew.mock.calls[0][0].answers;
  expect(Object.values(answers).map(answer => answer.category)).toEqual(['budget', 'budget', 'choice', 'choice', 'buffer', 'buffer', 'risk', 'risk']);
  await screen.findByText('已保存到历史记录！');
  fireEvent.click(screen.getByRole('button', { name: '查看历史' }));
  expect(await screen.findByText(/第 1 次探索/)).toBeInTheDocument();
});

test('skipped questions are revisited before an incomplete result can be saved', () => {
  render(<MemoryRouter><Assessment /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: '立即开始' }));
  fireEvent.click(screen.getByRole('button', { name: '跳过此题' }));
  for (let i = 0; i < 7; i += 1) fireEvent.click(screen.getByRole('button', { name: '偶尔会这样做' }));
  expect(screen.getByRole('status')).toHaveTextContent('还有跳过的问题');
  expect(screen.queryByRole('button', { name: '保存结果' })).not.toBeInTheDocument();
});

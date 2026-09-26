import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Learning from './Learning';
import { getLearning, getWeeklyFacts, saveLearningEntry, saveLearningProfile } from '../services/learning';
import { assessPurchase } from '../services/api';

jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: { uid: 'alice' } }) }));
jest.mock('../services/api', () => ({ assessPurchase: jest.fn() }));
jest.mock('../services/learning', () => ({
  getLearning: jest.fn(), getWeeklyFacts: jest.fn(), saveLearningEntry: jest.fn(),
  saveLearningProfile: jest.fn(), saveDecisionOutcome: jest.fn(),
  learningError: e => e.message,
}));

const state = {
  profile: {}, topics: [{ id: 'budget', title: '安排收支', description: '安排优先顺序' }],
  lessons: [{ id: 'needs', day: 1, topic: 'budget', title: '我的钱要照顾什么', concept: '先安排必要开支', scenario: '月底需要交费', prompt: '写下你的安排' }],
  entries: [], summary: { completed_lessons: [], practice_count: 0, decision_count: 0, review_count: 0, checkin: { total_days: 0 }, abilities: [] },
};
const renderPage = (tab = 'practice') => render(<MemoryRouter initialEntries={[`/learning?tab=${tab}`]}><Learning /></MemoryRouter>);

beforeEach(() => {
  jest.clearAllMocks();
  getLearning.mockResolvedValue(state);
  getWeeklyFacts.mockResolvedValue({ start: '2026-09-21', end: '2026-09-27', count: 0, total: 0, message: '没有消费也可以复盘' });
  saveLearningEntry.mockResolvedValue({});
});

test('missing income invites setup without inventing a default and profile saves to account', async () => {
  renderPage('profile');
  const income = await screen.findByLabelText('月收入或生活费（元，可暂不填写）');
  expect(income).toHaveValue(null);
  fireEvent.change(income, { target: { value: '2800' } });
  saveLearningProfile.mockResolvedValue({ monthly_income: 2800, topic: 'budget' });
  fireEvent.click(screen.getByRole('button', { name: '保存资料' }));
  await waitFor(() => expect(saveLearningProfile).toHaveBeenCalledWith(expect.objectContaining({ monthly_income: '2800' })));
  expect(await screen.findByText('资料已保存。')).toBeInTheDocument();
});

test('exercise failure preserves draft and does not award completion', async () => {
  saveLearningEntry.mockRejectedValue(new Error('保存失败，请重试'));
  renderPage();
  const input = await screen.findByLabelText('写下你的安排');
  fireEvent.change(input, { target: { value: '先留出考试费，再安排聚餐' } });
  fireEvent.click(screen.getByRole('button', { name: '保存这次思考' }));
  expect(await screen.findByText('保存失败，请重试')).toBeInTheDocument();
  expect(input).toHaveValue('先留出考试费，再安排聚餐');
  expect(screen.getByText('0 / 7')).toBeInTheDocument();
  expect(screen.queryByText('思考已保存，今天已参与成长练习。')).not.toBeInTheDocument();
});

test('load failure is distinguishable from empty data and can retry', async () => {
  getLearning.mockRejectedValueOnce(new Error('服务暂不可用')).mockResolvedValue(state);
  renderPage();
  expect(await screen.findByText('服务暂不可用')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(await screen.findByLabelText('写下你的安排')).toBeInTheDocument();
});

test('weekly review can be completed on a week without spending', async () => {
  renderPage('review');
  fireEvent.change(await screen.findByLabelText('本周一件值得回看的事：发生了什么，是否符合预期？'), { target: { value: '本周没有消费，重新检查了计划' } });
  fireEvent.change(screen.getByLabelText('下周想试的一件小事：何时、怎样做？'), { target: { value: '周日列出考试开支' } });
  fireEvent.change(screen.getByLabelText('我的理财原则初稿'), { target: { value: '先想起未来的必要开支' } });
  fireEvent.click(screen.getByRole('button', { name: '保存本周复盘' }));
  await waitFor(() => expect(saveLearningEntry).toHaveBeenCalledWith('review', expect.objectContaining({ principle: '先想起未来的必要开支' })));
  expect(await screen.findByText('本周复盘已保存，下周可以回看这次行动。')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: '保存本周复盘' })).toBeEnabled());
});

test('comparison subtracts the purchase once and never presents pre-purchase balance as final', async () => {
  assessPurchase.mockResolvedValue({ budget: { remaining: 1000 }, suggestion: '由你选择', basis: { message: '仅基于记录估算' } });
  renderPage('decision');
  fireEvent.change(await screen.findByLabelText('计划金额（元）'), { target: { value: '200' } });
  fireEvent.change(screen.getByLabelText('商品或消费类别'), { target: { value: '购物' } });
  fireEvent.click(screen.getByRole('button', { name: '比较对预算的影响' }));
  expect(await screen.findByText('现在购买：按已记录数据，购买后本月余量 ¥800.00。')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: '比较对预算的影响' })).toBeEnabled());
});

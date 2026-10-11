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
  expect(screen.queryByLabelText('选择一个情境')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '看看我的想法' }));
  expect(await screen.findByText('月底考试费也要预留。')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '看看我的想法' })).not.toBeInTheDocument();
  expect(submitAdaptiveAnswer).toHaveBeenCalledWith({ item_id: 'budget-basic', choice: 1 });
  await waitFor(() => expect(getAdaptiveLearning).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button', { name: '下一步' }));
  expect(screen.getByRole('button', { name: '看看我的想法' })).toBeInTheDocument();
  expect(screen.queryByText('月底考试费也要预留。')).not.toBeInTheDocument();
});
test('failed submission preserves selected answer for retry', async () => {
  submitAdaptiveAnswer.mockRejectedValue(new Error('保存失败'));
  setup(); fireEvent.click(await screen.findByLabelText('只看余额'));
  fireEvent.click(screen.getByRole('button', { name: '看看我的想法' }));
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
  fireEvent.click(screen.getByRole('button', { name: '看看我的想法' }));
  expect(await screen.findByText('答案已保存，但推荐刷新失败，请刷新推荐。')).toBeInTheDocument();
  expect(screen.getByText('考虑未来开支。')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '刷新下一步' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '下一步' })).not.toBeInTheDocument();
});
test('recommended lesson can be opened from the practice card', async () => {
  const onSelectLesson = jest.fn();
  submitAdaptiveAnswer.mockResolvedValue({ correct: true, evidence: '预留未来开支', explanation: '考虑未来开支。' });
  getAdaptiveLearning.mockResolvedValue({ ...data, lesson_id: 'needs' });
  render(<MemoryRouter><AdaptivePractice lessons={[{ id: 'needs', title: '我的钱要照顾什么' }]} onSelectLesson={onSelectLesson} /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('预留未来开支'));
  fireEvent.click(screen.getByRole('button', { name: '看看我的想法' }));
  fireEvent.click(await screen.findByText('再了解一点'));
  fireEvent.click(screen.getByRole('button', { name: '相关练习：我的钱要照顾什么' }));
  expect(onSelectLesson).toHaveBeenCalledWith('needs');
});
test('other scenarios stay hidden until requested', async () => {
  setup();
  expect(await screen.findByLabelText('预留未来开支')).toBeInTheDocument();
  expect(screen.queryByLabelText('选择一个情境')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '换一个情境' }));
  expect(screen.getByLabelText('选择一个情境')).toBeInTheDocument();
});

test('pilot content is labeled on the card before answering', async () => {
  getAdaptiveLearning.mockResolvedValue({ ...data, items: [{ ...item, review_status: 'pilot' }],
    next_item: { ...item, review_status: 'pilot' } });
  setup();
  expect(await screen.findByText(/试用题/)).toBeInTheDocument();
});
test('finished session does not force a repeated question', async () => {
  getAdaptiveLearning.mockResolvedValue({ ...data, next_item: null });
  setup();
  expect(await screen.findByText('今天的新情境已经做完了，可以先休息一下。')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '看看我的想法' })).not.toBeInTheDocument();
});

test('numeric scenario sends an amount and shows one step at a time', async () => {
  const first = { id: 'phone-total', type: 'number', question: '分期多花多少元？', scenario_id: 'phone-plan', scenario_title: '更换手机前', scenario_context: '现付 1600 元，分 6 期每期 290 元。', step: 1, steps_total: 3 };
  const second = { ...first, id: 'phone-gap', question: '现付缺口多少元？', step: 2 };
  getAdaptiveLearning.mockResolvedValueOnce({ ...data, items: [first], next_item: first })
    .mockResolvedValueOnce({ ...data, items: [first, second], next_item: second });
  submitAdaptiveAnswer.mockResolvedValue({ correct: true, evidence: '140 元', explanation: '总额比现付多 140 元。' });
  setup();
  expect(await screen.findByText('情境练习 · 第 1 / 3 步')).toBeInTheDocument();
  expect(screen.queryByText('现付缺口多少元？')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('填写金额（元）'), { target: { value: '140' } });
  fireEvent.click(screen.getByRole('button', { name: '看看我的想法' }));
  expect(submitAdaptiveAnswer).toHaveBeenCalledWith({ item_id: 'phone-total', choice: 140 });
  expect(await screen.findByText('总额比现付多 140 元。')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '下一步' }));
  expect(screen.getByText('现付缺口多少元？')).toBeInTheDocument();
});

test('previous step shows the saved answer and returns to the unfinished step without resubmitting', async () => {
  const first = { id: 'phone-total', type: 'number', question: '分期多花多少元？', scenario_id: 'phone-plan', scenario_title: '更换手机前', step: 1, steps_total: 3 };
  const second = { ...first, id: 'phone-gap', question: '现付缺口多少元？', step: 2 };
  const attempt = { correct: true, evidence: '140 元', explanation: '总额比现付多 140 元。' };
  getAdaptiveLearning.mockResolvedValueOnce({ ...data, items: [first], next_item: first, attempts: {} })
    .mockResolvedValueOnce({ ...data, items: [first, second], next_item: second, attempts: { 'phone-total': attempt } });
  submitAdaptiveAnswer.mockResolvedValue(attempt);
  setup();
  expect(screen.queryByRole('button', { name: '上一步' })).not.toBeInTheDocument();
  fireEvent.change(await screen.findByLabelText('填写金额（元）'), { target: { value: '140' } });
  fireEvent.click(screen.getByRole('button', { name: '看看我的想法' }));
  await waitFor(() => expect(getAdaptiveLearning).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button', { name: '下一步' }));
  expect(screen.getByText('现付缺口多少元？')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '上一步' }));
  expect(screen.getByText('回看这一步')).toBeInTheDocument();
  expect(screen.getByText('分期多花多少元？')).toBeInTheDocument();
  expect(screen.getByText('你的回答：140 元')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '看看我的想法' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '下一步' }));
  expect(screen.getByText('现付缺口多少元？')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '看看我的想法' })).toBeInTheDocument();
  expect(submitAdaptiveAnswer).toHaveBeenCalledTimes(1);
});

test('saved steps can be reviewed after reloading midway through a scenario', async () => {
  const first = { id: 'step-one', type: 'number', question: '第一步问题', scenario_id: 'plan', step: 1, steps_total: 3 };
  const second = { ...first, id: 'step-two', question: '第二步问题', step: 2 };
  const third = { ...first, id: 'step-three', question: '第三步问题', step: 3 };
  getAdaptiveLearning.mockResolvedValue({ ...data, items: [first, second, third], next_item: third, attempts: {
    'step-one': { correct: true, evidence: '10 元', explanation: '第一步反馈' },
    'step-two': { correct: false, evidence: '20 元', explanation: '第二步反馈' },
  } });
  setup();
  expect(await screen.findByText('第三步问题')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('填写金额（元）'), { target: { value: '35' } });
  fireEvent.click(screen.getByRole('button', { name: '上一步' }));
  expect(screen.getByText('第二步问题')).toBeInTheDocument();
  expect(screen.getByText('你的回答：20 元')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '上一步' }));
  expect(screen.getByText('第一步问题')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '下一步' }));
  expect(screen.getByText('第二步反馈')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '下一步' }));
  expect(screen.getByText('第三步问题')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '看看我的想法' })).toBeInTheDocument();
  expect(screen.getByLabelText('填写金额（元）')).toHaveValue(35);
  expect(submitAdaptiveAnswer).not.toHaveBeenCalled();
});

test('open reflection is recorded without a false right-or-wrong judgement', async () => {
  const reflection = { id: 'phone-reflect', type: 'reflection', question: '还需要确认什么？', step: 3, steps_total: 3, scenario_id: 'phone-plan' };
  getAdaptiveLearning.mockResolvedValue({ ...data, items: [reflection], next_item: reflection });
  submitAdaptiveAnswer.mockResolvedValue({ correct: null, evidence: '未来开支', explanation: '可以继续核对未来月份的安排。' });
  setup();
  const input = await screen.findByLabelText('写下你的判断依据');
  fireEvent.change(input, { target: { value: '未来每月开支' } });
  fireEvent.click(screen.getByRole('button', { name: '看看我的想法' }));
  expect(submitAdaptiveAnswer).toHaveBeenCalledWith({ item_id: 'phone-reflect', choice: '未来每月开支' });
  expect(await screen.findByText('你的想法已记录。')).toBeInTheDocument();
});

test('partly correct amount explains the missed cost', async () => {
  const question = { id: 'credit-total', type: 'number', question: '总共支付多少元？', step: 1, steps_total: 3, scenario_id: 'credit-cost' };
  getAdaptiveLearning.mockResolvedValue({ ...data, items: [question], next_item: question });
  submitAdaptiveAnswer.mockResolvedValue({ correct: false, score: 0.5, evidence: '3960 元', explanation: '还需加入一次性服务费 120 元。' });
  setup();
  fireEvent.change(await screen.findByLabelText('填写金额（元）'), { target: { value: '3960' } });
  fireEvent.click(screen.getByRole('button', { name: '看看我的想法' }));
  expect(await screen.findByText('你已算对一部分，再核对遗漏的费用。')).toBeInTheDocument();
});

test('due review and optional small action remain one step', async () => {
  getAdaptiveLearning.mockResolvedValue({ ...data, recommendation_mode: 'review' });
  submitAdaptiveAnswer.mockResolvedValue({ correct: true, evidence: '预留未来开支', explanation: '先安排已知费用。', micro_action: '核对一项下月已经知道的开支。' });
  setup();
  expect(await screen.findByText(/简短复习/)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('预留未来开支'));
  fireEvent.click(screen.getByRole('button', { name: '看看我的想法' }));
  expect(await screen.findByText(/今天可以试一小步：核对一项下月已经知道的开支/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '今天先到这里' })).toHaveAttribute('href', '/');
});

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import CoachChat from './CoachChat';
import { useAuth } from '../contexts/AuthContext';
import { sendMessageToCoach } from '../services/api';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../services/api', () => ({ sendMessageToCoach: jest.fn() }));
jest.mock('react-markdown', () => ({ __esModule: true, default: ({ children }) => <div>{children}</div> }));
jest.mock('remark-gfm', () => ({ __esModule: true, default: () => {} }));
jest.mock('react-syntax-highlighter', () => ({ Prism: ({ children }) => <pre>{children}</pre> }));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({ atomDark: {} }));

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: { uid: 'alice' } });
  Element.prototype.scrollIntoView = jest.fn();
});

const App = () => <MemoryRouter><CoachChat /></MemoryRouter>;
const send = text => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  fireEvent.submit(screen.getByRole('textbox').closest('form'));
};

test('shows only returned verified answer and distinguishes used sources from other recall', async () => {
  sendMessageToCoach.mockResolvedValue({ reply: '按本轮情境可留800元。',
    evidence: { facts: [{ id: 'F:scenario_surplus', label: '本轮收支差', value: 800, unit: '元', source: 'user_scenario' }],
      used_sources: [{ source_id: 'K1', title: '预算资料', excerpt: '先预留必要支出。' }],
      sources: [{ source_id: 'K1', title: '预算资料', excerpt: '先预留必要支出。' }, { source_id: 'K2', title: '其他资料', excerpt: '了解风险。' }] },
    validation: { fallback: false } });
  render(<App />);
  send('月收入2000，必要支出1200');
  expect(await screen.findByText('按本轮情境可留800元。')).toBeInTheDocument();
  expect(screen.getByText('查看本次依据')).toBeInTheDocument();
  expect(screen.getByText(/本轮收支差：800元/)).toBeInTheDocument();
  expect(screen.getByText('回答使用的知识片段')).toBeInTheDocument();
  expect(screen.getByText('其他检索片段（未作为本次回答依据）')).toBeInTheDocument();
  expect(sendMessageToCoach.mock.calls[0][0]).not.toHaveProperty('user_id');
});

test('response started under another account cannot appear after account switch', async () => {
  let finish;
  sendMessageToCoach.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = render(<App />);
  send('查看我的预算');
  await waitFor(() => expect(sendMessageToCoach).toHaveBeenCalledTimes(1));
  useAuth.mockReturnValue({ currentUser: { uid: 'bob' } });
  view.rerender(<App />);
  await act(async () => finish({ reply: 'alice-private-budget' }));
  expect(screen.queryByText('alice-private-budget')).not.toBeInTheDocument();
});

test('revoking consent invalidates pending response and clears prior personal history', async () => {
  let finish;
  sendMessageToCoach.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  render(<App />);
  fireEvent.click(screen.getByRole('checkbox'));
  send('我的个人预算');
  expect(sendMessageToCoach.mock.calls[0][0].use_learning_context).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  await act(async () => finish({ reply: 'private-budget-response' }));
  expect(screen.queryByText('private-budget-response')).not.toBeInTheDocument();
  sendMessageToCoach.mockResolvedValueOnce({ reply: '预算是资金安排。' });
  send('解释预算概念');
  await screen.findByText('预算是资金安排。');
  const payload = sendMessageToCoach.mock.calls[1][0];
  expect(payload.use_learning_context).toBe(false);
  expect(JSON.stringify(payload.chat_history)).not.toContain('我的个人预算');
});

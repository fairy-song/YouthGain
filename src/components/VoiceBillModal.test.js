import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import VoiceBillModal from './VoiceBillModal';
import { assessPurchase, createTransaction } from '../services/api';

jest.mock('../services/api', () => ({ createTransaction: jest.fn(), assessPurchase: jest.fn(), transcribeAudio: jest.fn() }));

test('passes confirmed expense to the parent after closing so the money feedback is visible', async () => {
  const onSaved = jest.fn();
  const onClose = jest.fn();
  createTransaction.mockResolvedValue({ id: 'voice-bill', amount: 38 });
  const { unmount } = render(<VoiceBillModal show onClose={onClose} onSaved={onSaved} />);
  fireEvent.change(screen.getByPlaceholderText('例如：在食堂吃了顿午饭花了18'), { target: { value: '今天在食堂午餐花了38元' } });
  fireEvent.click(screen.getByRole('button', { name: '解析成账单' }));
  await screen.findByRole('button', { name: '确认保存' });
  jest.useFakeTimers();
  try {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '确认保存' })); });
    expect(onSaved).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(800));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'voice-bill', amount: 38, category: '餐饮' }));
    expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(onSaved.mock.invocationCallOrder[0]);
    unmount();
  } finally { jest.useRealTimers(); }
});

test('editing an assessed amount invalidates the old result and allows fresh input', async () => {
  assessPurchase.mockResolvedValue({ amount: 18, necessity: { level: 'optional', label: '由你判断' }, budget: { spent_this_month: 100, remaining: 900 }, surplus: { before: 900, after: 882 }, goal: { has_goal: false } });
  render(<VoiceBillModal show onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('或手动输入消费内容'), { target: { value: '今天在食堂花了18元' } });
  fireEvent.click(screen.getByRole('button', { name: '解析成账单' }));
  fireEvent.click(screen.getByRole('button', { name: '消费影响试算' }));
  expect(await screen.findByText('由你判断')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('金额（元）*'), { target: { value: '80' } });
  expect(screen.queryByText('由你判断')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '消费影响试算' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '重新输入' }));
  expect(screen.getByLabelText('或手动输入消费内容')).toBeInTheDocument();
});

test('closing during saved feedback cannot cancel parent notification', async () => {
  const onSaved = jest.fn();
  createTransaction.mockResolvedValue({ id: 'saved' });
  render(<VoiceBillModal show onClose={() => {}} onSaved={onSaved} />);
  fireEvent.change(screen.getByLabelText('或手动输入消费内容'), { target: { value: '午餐18元' } });
  fireEvent.click(screen.getByRole('button', { name: '解析成账单' }));
  jest.useFakeTimers();
  try {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '确认保存' })); });
    expect(screen.queryByRole('button', { name: '关闭语音记账' })).not.toBeInTheDocument();
    act(() => jest.advanceTimersByTime(800));
    expect(onSaved).toHaveBeenCalledTimes(1);
  } finally { jest.useRealTimers(); }
});

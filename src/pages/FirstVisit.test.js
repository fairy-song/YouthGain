import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import FirstVisit from './FirstVisit';
import { clearDraft, readDraft } from '../data/firstVisit';

jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: null }) }));

beforeEach(() => {
  clearDraft();
  Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => '12345678-1234-4123-8123-123456789abc' } });
});

test('a visitor can finish one question at a time and see the summary before login', () => {
  render(<MemoryRouter><FirstVisit /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: /你如何评价目前对个人理财/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /初学者/ }));
  fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
  expect(screen.getByText('02 / 12')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '上一步' }));
  expect(screen.getByRole('button', { name: /初学者/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
  for (let i = 1; i < 12; i += 1) fireEvent.click(screen.getByRole('button', { name: '暂不回答' }));
  expect(screen.getByRole('heading', { name: '你的简要财务知识评估' })).toBeInTheDocument();
  expect(screen.getByText(/仅依据本次问卷自述/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /登录并保存/ })).toHaveAttribute('href', '/login?from=questionnaire');
  expect(readDraft().complete).toBe(true);
  expect(readDraft().answers.q1).toBe('beginner');
});

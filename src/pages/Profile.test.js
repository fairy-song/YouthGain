import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Profile from './Profile';
import { getLearning, getQuestionnaires } from '../services/learning';
import { useAuth } from '../contexts/AuthContext';
import { authenticatedApi } from '../services/api';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../services/api', () => ({ authenticatedApi: { get: jest.fn() } }));
jest.mock('../services/learning', () => ({
  getLearning: jest.fn(), getQuestionnaires: jest.fn(), saveLearningProfile: jest.fn(), learningError: error => error.message,
}));

const logout = jest.fn();
const setup = (path = '/profile') => render(<MemoryRouter initialEntries={[path]}><Routes>
  <Route path="/profile" element={<Profile />} />
  <Route path="/login" element={<h1>登录页面</h1>} />
</Routes></MemoryRouter>);

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: { uid: 'student-1', email: 'student@example.com', displayName: '小青' }, logout });
  getLearning.mockResolvedValue({ profile: {}, topics: [] });
  getQuestionnaires.mockResolvedValue({ latest: null });
  authenticatedApi.get.mockResolvedValue({ data: { data: {}, goals: [] } });
});

test('a ledger link opens finance settings and preserves a route back', async () => {
  setup('/profile?edit=finance&from=ledger');
  const heading = await screen.findByRole('heading', { name: '财务资料设置' });
  await waitFor(() => expect(heading).toHaveFocus());
  expect(screen.getByRole('link', { name: /返回账本/ })).toHaveAttribute('href', '/dashboard');
  expect(screen.getByRole('button', { name: '保存资料' })).toBeVisible();
});

test.each([0, 12.5, -12.5])('My page retains decimal precision for confirmed funds %s', async amount => {
  authenticatedApi.get.mockResolvedValue({ data: { data: {
    available_complete: true, complete: true, available_remaining_month: amount,
  } } });
  setup();
  expect(await screen.findByText(`¥${amount.toFixed(2)}`)).toBeVisible();
});

test('My page does not present unconfirmed funds as an available balance', async () => {
  authenticatedApi.get.mockResolvedValue({ data: { data: { available_complete: false, available_remaining_month: -12.5 } } });
  setup();
  expect(await screen.findByText('资金资料待核对')).toBeVisible();
  expect(screen.queryByText('¥-12.50')).not.toBeInTheDocument();
});

test('the My page signs out and returns to login', async () => {
  logout.mockResolvedValue();
  setup();
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
  expect(logout).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole('heading', { name: '登录页面' })).toBeInTheDocument();
});

test('a failed sign-out keeps the user on My and offers retry', async () => {
  logout.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce();
  setup();
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
  expect(await screen.findByText('退出登录失败，请重试。')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: '退出登录' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
  expect(await screen.findByRole('heading', { name: '登录页面' })).toBeInTheDocument();
  expect(logout).toHaveBeenCalledTimes(2);
});

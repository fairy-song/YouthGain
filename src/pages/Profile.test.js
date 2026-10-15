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
const setup = () => render(<MemoryRouter initialEntries={['/profile']}><Routes>
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

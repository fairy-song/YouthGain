import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import HomeCoach from './HomeCoach';
import { useAuth } from '../contexts/AuthContext';
jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
function Destination() { const location = useLocation(); return <div data-testid="destination">{JSON.stringify({ path: location.pathname, state: location.state })}</div>; }
function setup(user) {
  useAuth.mockReturnValue({ currentUser: user });
  render(<MemoryRouter><Routes><Route path="/" element={<HomeCoach />} /><Route path="/coach" element={<Destination />} /><Route path="/login" element={<Destination />} /></Routes></MemoryRouter>);
}
test('a signed-in user can choose a question and continue in the coach', () => {
  setup({ uid: 'alice' });
  fireEvent.click(screen.getByRole('button', { name: '这笔消费值得买吗？' }));
  expect(JSON.parse(screen.getByTestId('destination').textContent)).toEqual({ path: '/coach', state: { prompt: '这笔消费值得买吗？', returnTo: '/' } });
});
test('guest custom question is passed through login without being sent', () => {
  setup(null);
  fireEvent.change(screen.getByLabelText('想问教练的问题'), { target: { value: ' 我想规划生活费 ' } });
  fireEvent.click(screen.getByRole('button', { name: '和教练聊聊' }));
  expect(JSON.parse(screen.getByTestId('destination').textContent)).toEqual({ path: '/login', state: { coachEntry: { prompt: '我想规划生活费', returnTo: '/' } } });
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import MobileNavBar from './MobileNavBar';
import Learning from '../pages/Learning';
import CoachHelp from './CoachHelp';
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: { uid: 'user' }, isAdmin: false }) }));
jest.mock('../services/api', () => ({}));
jest.mock('../services/learning', () => ({}));

test('four main destinations separate profile from learning and keep chat contextual', () => {
  render(<MemoryRouter initialEntries={['/profile']}><MobileNavBar /></MemoryRouter>);
  expect(screen.getAllByRole('link')).toHaveLength(4);
  expect(screen.getByRole('link', { name: '我的' })).toHaveAttribute('href', '/profile');
  expect(screen.getByRole('link', { name: '我的' })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('link', { name: 'AI教练' })).not.toBeInTheDocument();
});
test('old profile bookmarks redirect to the standalone page', async () => {
  render(<MemoryRouter initialEntries={['/learning?tab=profile']}><Routes><Route path="/learning" element={<Learning />} /><Route path="/profile" element={<h1>独立资料页</h1>} /></Routes></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: '独立资料页' })).toBeInTheDocument();
});
test('coach help retains the originating workflow without sending data', async () => {
  function Destination() { const location = useLocation(); return <div>{location.state.prompt} · {location.state.returnTo}</div>; }
  render(<MemoryRouter initialEntries={['/learning?tab=review']}><Routes><Route path="/learning" element={<CoachHelp prompt="一起复盘" />} /><Route path="/coach" element={<Destination />} /></Routes></MemoryRouter>);
  fireEvent.click(screen.getByRole('link', { name: '请教练帮我梳理' }));
  expect(await screen.findByText('一起复盘 · /learning?tab=review')).toBeInTheDocument();
});

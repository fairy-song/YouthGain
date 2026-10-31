import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MemberLayout from './MemberLayout';

test('keeps four clear destinations and marks the current section', () => {
  render(<MemoryRouter initialEntries={['/dashboard?tab=goals']}><Routes><Route element={<MemberLayout />}><Route path="dashboard" element={<h1>储蓄目标</h1>} /></Route></Routes></MemoryRouter>);
  expect(screen.getByRole('heading', { name: '储蓄目标' })).toBeInTheDocument();
  const navs = screen.getAllByRole('navigation', { name: '主要导航' });
  expect(navs).toHaveLength(2);
  navs.forEach(nav => {
    expect([...nav.querySelectorAll('a')].map(link => link.textContent)).toEqual(['今天', '账本', '学习', '我的']);
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent('账本');
  });
});

test('skip link focuses content without changing the current route', () => {
  render(<MemoryRouter initialEntries={['/dashboard?tab=goals']}><Routes><Route element={<MemberLayout />}><Route path="dashboard" element={<h1>储蓄目标</h1>} /></Route></Routes></MemoryRouter>);
  fireEvent.click(screen.getByRole('link', { name: '跳到主要内容' }));
  expect(screen.getByRole('main')).toHaveFocus();
  expect(screen.getByRole('heading', { name: '储蓄目标' })).toBeInTheDocument();
});

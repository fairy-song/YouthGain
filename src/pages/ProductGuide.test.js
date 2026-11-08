import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProductGuide from './ProductGuide';
import { needsGuide, readGuide, saveGuide } from '../data/productGuide';
let mockAuth;
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../config/features', () => ({ PRODUCT_GUIDE_ENABLED: true }));
const empty = { transactions: [], monthly_cashflow: { complete: true, has_expense_records: false, has_income_records: false } };
function show() { return render(<MemoryRouter initialEntries={['/guide']}><Routes><Route path="/guide" element={<ProductGuide />} /><Route path="/" element={<p>首页入口</p>} /><Route path="/admin" element={<p>管理入口</p>} /><Route path="/research" element={<p>学校入口</p>} /></Routes></MemoryRouter>); }
beforeEach(() => { mockAuth = { workspace: 'student', currentUser: { uid: expect.getState().currentTestName } }; });

test('a student tries coins without recording money, completes steps and can skip home', () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: /把数字变成钱/ }));
  expect(screen.getByRole('region', { name: '示例消费的钱币展示' })).toBeVisible();
  expect(screen.queryByText(/已计入这笔支出/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /接下来，钱怎么安排/ }));
  expect(screen.getByRole('heading')).toHaveFocus();
  expect(screen.getByText(/不能直接当作/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /明白了/ }));
  expect(screen.getByRole('link', { name: /先去记一笔/ })).toHaveAttribute('href', '/dashboard');
  fireEvent.click(screen.getByRole('button', { name: '先看看首页' }));
  expect(screen.getByText('首页入口')).toBeVisible();
  expect(needsGuide(mockAuth.currentUser.uid, empty, [])).toBe(false);
});

test('skipping stops auto entry while explicit replay starts from the beginning', () => {
  const view = show();
  fireEvent.click(screen.getByRole('button', { name: '跳过引导' }));
  expect(readGuide(mockAuth.currentUser.uid).status).toBe('skipped');
  view.unmount();show();
  expect(screen.getByText(/30 秒认识青盈/)).toHaveTextContent('1 / 3');
});

test('unfinished progress resumes for its own account only', () => {
  saveGuide(mockAuth.currentUser.uid, 1);show();
  expect(screen.getByText(/30 秒认识青盈/)).toHaveTextContent('2 / 3');
  expect(readGuide('another-student')).toBeNull();
});

test('blocked storage still allows completion in the current tab', () => {
  const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  show();fireEvent.click(screen.getByRole('button', { name: '跳过引导' }));
  expect(needsGuide(mockAuth.currentUser.uid, empty, [])).toBe(false);
  get.mockRestore();set.mockRestore();
});

test('only confirmed empty account data qualifies for automatic entry', () => {
  const owner = mockAuth.currentUser.uid;
  expect(needsGuide(owner, empty, [])).toBe(true);
  expect(needsGuide(owner, undefined, [])).toBe(false);
  expect(needsGuide(owner, empty, undefined)).toBe(false);
  expect(needsGuide(owner, { ...empty, transactions: [{ id: 'old' }] }, [])).toBe(false);
  expect(needsGuide(owner, empty, [{ kind: 'review' }])).toBe(false);
  expect(needsGuide(owner, { ...empty, monthly_cashflow: { ...empty.monthly_cashflow, complete: false } }, [])).toBe(false);
});

test.each([['admin', '管理入口'], ['school', '学校入口']])('keeps %s workspace separate', (workspace, text) => {
  mockAuth.workspace = workspace;show();expect(screen.getByText(text)).toBeVisible();
});

test('guests can learn before sign-in and keep a login destination', () => {
  mockAuth = { workspace: null, currentUser: null };show();
  fireEvent.click(screen.getByRole('button', { name: /接下来，钱怎么安排/ }));
  fireEvent.click(screen.getByRole('button', { name: /明白了/ }));
  expect(screen.getByRole('link', { name: /登录，从记一笔开始/ })).toHaveAttribute('href', '/login');
});

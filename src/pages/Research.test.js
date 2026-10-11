import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import ResearchParticipation from './ResearchParticipation';
import SchoolResearch from './SchoolResearch';
import * as api from '../services/research';

jest.mock('../services/research', () => ({
  getResearchAccess: jest.fn(), getResearchParticipation: jest.fn(), setResearchConsent: jest.fn(),
  createResearchProject: jest.fn(), setResearchMember: jest.fn(), getResearchReleases: jest.fn(),
  publishResearchRelease: jest.fn(), exportResearchRelease: jest.fn(), researchError: e => e.message,
  sendResearchVerification: jest.fn(), refreshResearchIdentity: jest.fn(),
}));

const project = { id: 'p1', title: '学期消费研究', school: '甲学校', purpose: '了解参与者消费结构',
  start_month: '2026-02', end_month: '2026-03', mode: 'live', consent_version: 'research-consent-v1',
  consent: null, can_join: true, epsilon_total: 2, epsilon_spent: 0, researchers: {} };
const snapshot = { project_id: 'p1', month: '2026-02', mode: 'live', status: 'published',
  charts: [{ title: '月度已记录支出区间', bins: [{ label: '500–1000元', percent: 60, estimate: 30 }] }],
  notice: '受保护统计，不代表全校', version: 'v1', epsilon: 1, delta: 0, coordinate_noise_95: 8.99 };

beforeEach(() => {
  jest.resetAllMocks();
  api.getResearchParticipation.mockResolvedValue({ projects: [project] });
  api.getResearchAccess.mockResolvedValue({ projects: [project], can_manage: false, role: 'research' });
  api.getResearchReleases.mockResolvedValue({ releases: [snapshot] });
  api.setResearchConsent.mockResolvedValue({});
  api.exportResearchRelease.mockResolvedValue({});
  api.setResearchMember.mockResolvedValue({});
  api.publishResearchRelease.mockResolvedValue({});
});

test('participation requires an explicit checkbox and sends the current consent version', async () => {
  render(<MemoryRouter><ResearchParticipation /></MemoryRouter>);
  const button = await screen.findByRole('button', { name: '确认参与' });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(button);
  await waitFor(() => expect(api.setResearchConsent).toHaveBeenCalledWith('p1', true, 'research-consent-v1'));
  await waitFor(() => expect(api.getResearchParticipation).toHaveBeenCalledTimes(2));
  expect(screen.getByText(/此授权独立于 AI 教练/)).toBeInTheDocument();
});

test('withdrawal stops participation and refreshes the displayed state', async () => {
  api.getResearchParticipation.mockResolvedValueOnce({ projects: [{ ...project, consent: { active: true, effective_month: '2026-02' } }] });
  api.getResearchParticipation.mockResolvedValue({ projects: [{ ...project, consent: { active: false, withdrawn_at: '2026-03-01' } }] });
  render(<MemoryRouter><ResearchParticipation /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: '退出本研究' }));
  expect(await screen.findByText(/已退出，之后的新发布/)).toBeInTheDocument();
  expect(api.setResearchConsent).toHaveBeenCalledWith('p1', false, 'research-consent-v1');
});

test('researchers see only snapshots and export the selected month', async () => {
  render(<MemoryRouter><SchoolResearch /></MemoryRouter>);
  expect(await screen.findByText('60.0%')).toBeInTheDocument();
  expect(screen.queryByText('建立研究项目')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '生成月度快照' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '导出本月快照' }));
  await waitFor(() => expect(api.exportResearchRelease).toHaveBeenCalledWith('p1', '2026-02'));
  await waitFor(() => expect(api.getResearchReleases).toHaveBeenCalledTimes(2));
});

test('accounts without project membership get no research data', async () => {
  api.getResearchAccess.mockResolvedValue({ projects: [], can_manage: false, role: 'student' });
  render(<MemoryRouter><SchoolResearch /></MemoryRouter>);
  expect(await screen.findByText(/当前账号没有有效的学校研究授权/)).toBeInTheDocument();
  expect(api.getResearchReleases).not.toHaveBeenCalled();
});

test('unverified accounts can request verification and refresh their identity explicitly', async () => {
  api.getResearchAccess.mockResolvedValue({ projects: [], can_manage: false, requires_email_verification: true });
  api.sendResearchVerification.mockResolvedValue();
  api.refreshResearchIdentity.mockResolvedValue();
  render(<MemoryRouter><SchoolResearch /></MemoryRouter>);
  expect(api.sendResearchVerification).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: '发送邮箱验证链接' }));
  expect(await screen.findByText(/验证邮件已发送/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: '已验证，刷新权限' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '已验证，刷新权限' }));
  await waitFor(() => expect(api.refreshResearchIdentity).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(api.getResearchAccess).toHaveBeenCalledTimes(3));
});

test('administrators can publish a month and grant scoped researcher access', async () => {
  api.getResearchAccess.mockResolvedValue({ projects: [project], can_manage: true, role: 'admin',
    global_budget: { total_milli: 6000, spent_milli: 0 }, live_enabled: false });
  render(<MemoryRouter><SchoolResearch /></MemoryRouter>);
  const month = await screen.findByLabelText('发布月份');
  fireEvent.change(month, { target: { value: '2026-02' } });
  fireEvent.click(screen.getByRole('button', { name: '生成月度快照' }));
  await waitFor(() => expect(api.publishResearchRelease).toHaveBeenCalledWith('p1', '2026-02'));
  await waitFor(() => expect(screen.getByRole('button', { name: '生成月度快照' })).toBeEnabled());
  fireEvent.click(screen.getByText('管理学校研究授权'));
  fireEvent.change(screen.getByLabelText('研究者登录邮箱'), { target: { value: 'teacher@example.org' } });
  fireEvent.change(screen.getByLabelText('授权截止日期'), { target: { value: '2026-12-31' } });
  fireEvent.click(screen.getByRole('button', { name: '保存授权' }));
  await waitFor(() => expect(api.setResearchMember).toHaveBeenCalledWith('p1', { email: 'teacher@example.org', expires: '2026-12-31' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '保存授权' })).toBeEnabled());
});

test('suppressed releases show the budget notice instead of fabricated charts', async () => {
  api.getResearchReleases.mockResolvedValue({ releases: [{ ...snapshot, status: 'insufficient_signal', charts: [],
    message: '受保护统计信号不足，本次已消耗预算' }] });
  render(<MemoryRouter><SchoolResearch /></MemoryRouter>);
  expect(await screen.findByText('受保护统计信号不足，本次已消耗预算')).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: '月度已记录支出区间' })).not.toBeInTheDocument();
});

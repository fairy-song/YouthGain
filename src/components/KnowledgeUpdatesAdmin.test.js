import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import KnowledgeUpdatesAdmin from './KnowledgeUpdatesAdmin';
import { knowledgeUpdatesApi } from '../services/api';
jest.mock('../services/api', () => ({ knowledgeUpdatesApi: jest.fn() }));

const value = { sources: [{ id: 's', name: '官方来源', url: 'https://www.investor.org.cn/', region: 'CN', enabled: false }],
  versions: [{ id: 'v', document_id: 'd', title: '更新的预算方法', content: '新正文', previous_content: '旧正文',
    source_url: 'https://www.investor.org.cn/a.html', region: 'CN', status: 'pending', current_id: null }] };
beforeEach(() => { jest.clearAllMocks(); knowledgeUpdatesApi.mockResolvedValue(value); });

test('requires explicit review confirmation and sends the displayed current version', async () => {
  render(<KnowledgeUpdatesAdmin />);
  await screen.findByText('更新的预算方法');
  expect(screen.getByRole('button', { name: '立即检查' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /查看正文与变化/ }));
  const publish = screen.getByRole('button', { name: '审核通过并发布' });
  expect(publish).toBeDisabled();
  expect(screen.getByText('旧正文')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(publish);
  await waitFor(() => expect(knowledgeUpdatesApi).toHaveBeenCalledWith('POST', '/versions/v/review', { decision: 'approve', confirmed: true, expected_current: null }));
  await screen.findByText('已发布审核版本。');
});

test('supports enabling a source and clearly shows loading failure', async () => {
  render(<KnowledgeUpdatesAdmin />);
  fireEvent.click(await screen.findByText('管理采集来源'));
  fireEvent.click(await screen.findByRole('button', { name: '启用' }));
  await waitFor(() => expect(knowledgeUpdatesApi).toHaveBeenCalledWith('PUT', '/sources/s', { enabled: true }));
  await screen.findByText('已更新来源状态。');
});

test('shows measured inventory and requires source usage confirmation for automation', async () => {
  knowledgeUpdatesApi.mockResolvedValue({ ...value, capacity: { published_articles: 27, passages: 40,
    body_characters: 14657, limits: { articles: 1000, passages: 20000 }, index_current: true,
    index: { passages: 40, cached_vectors: 0 } } });
  render(<KnowledgeUpdatesAdmin />);
  await screen.findByRole('region', { name: '知识库实际容量' });
  expect(screen.getByText(/1,000|1000/, { exact: false })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '设置发布策略' }));
  const enable = screen.getByRole('button', { name: '启用基础内容自动发布' });
  expect(enable).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /已确认该来源允许/ }));
  fireEvent.click(enable);
  await waitFor(() => expect(knowledgeUpdatesApi).toHaveBeenCalledWith('PUT', '/sources/s', { usage_confirmed: true, publish_policy: 'basic_auto' }));
  await screen.findByText('已启用合格基础内容自动发布；异常仍需复核。');
});

test('excluded suggestions remain inspectable and can be re-screened', async () => {
  knowledgeUpdatesApi.mockResolvedValue({ ...value, versions: [{ ...value.versions[0], screening: {
    decision: 'exclude', policy: 'test-v1', generation_mode: 'model+rules', reasons: ['与校园主题不匹配'] } }] });
  render(<KnowledgeUpdatesAdmin />);
  await screen.findByText('目前没有待审核版本。');
  fireEvent.change(screen.getByRole('combobox', { name: '版本状态' }), { target: { value: 'excluded' } });
  fireEvent.click(screen.getByRole('button', { name: /查看正文与变化/ }));
  expect(screen.getByText('与校园主题不匹配')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重新自动筛选' }));
  await waitFor(() => expect(knowledgeUpdatesApi).toHaveBeenCalledWith('POST', '/versions/v/screen', {}));
  await screen.findByText('筛选已完成，请查看结果与发布状态。');
});

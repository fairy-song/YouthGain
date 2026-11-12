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
  await screen.findByText('更新的预算方法');
  fireEvent.change(screen.getByRole('combobox', { name: '版本状态' }), { target: { value: 'excluded' } });
  fireEvent.click(await screen.findByRole('button', { name: /查看正文与变化/ }));
  expect(screen.getByText('与校园主题不匹配')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重新自动筛选' }));
  await waitFor(() => expect(knowledgeUpdatesApi).toHaveBeenCalledWith('POST', '/versions/v/screen', {}));
  await screen.findByText('筛选已完成，请查看结果与发布状态。');
});


test('capacity uses labelled meters and keeps technical counts behind details', async () => {
  knowledgeUpdatesApi.mockResolvedValue({ ...value, capacity: { published_articles: 27, passages: 40,
    body_characters: 14657, limits: { articles: 1000, passages: 20000 }, index_current: false,
    index: { passages: 20, cached_vectors: 10 } } });
  render(<KnowledgeUpdatesAdmin />);
  const meter = await screen.findByLabelText('文章配额');
  expect(meter.tagName).toBe('METER');
  expect(meter).toHaveAttribute('value', '27');
  expect(meter).toHaveAttribute('max', '1000');
  expect(screen.getByLabelText('知识片段配额')).toHaveAttribute('value', '40');
  expect(screen.getByText('索引待更新')).toBeVisible();
  const detail = screen.getByText(/向量缓存 10 条/);
  expect(detail.closest('details')).not.toHaveAttribute('open');
  fireEvent.click(screen.getByText('统计详情', { exact: true }));
  expect(detail).toBeVisible();
});


test('requests complete status pages and resets to first page on filter change', async () => {
  knowledgeUpdatesApi.mockImplementation(async (method, path) => ({ ...value,
    versions: [{ ...value.versions[0], title: path.includes('page=2') ? '较早的待审核' : '更新的预算方法' }],
    pagination: { page: path.includes('page=2') ? 2 : 1, page_size: 25, total: 26, pages: 2 } }));
  render(<KnowledgeUpdatesAdmin />);
  await screen.findByText('更新的预算方法');
  expect(knowledgeUpdatesApi).toHaveBeenCalledWith('GET', '?status=pending&page=1&page_size=25');
  expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  await screen.findByText('较早的待审核');
  expect(knowledgeUpdatesApi).toHaveBeenCalledWith('GET', '?status=pending&page=2&page_size=25');
  expect(screen.getByText('26–26 / 26 · 第 2 / 2 页')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
  fireEvent.change(screen.getByRole('combobox', { name: '版本状态' }), { target: { value: 'approved' } });
  await waitFor(() => expect(knowledgeUpdatesApi).toHaveBeenCalledWith('GET', '?status=approved&page=1&page_size=25'));
  await screen.findByText('更新的预算方法');
});

test('read failure offers retry and never claims the failed queue is empty', async () => {
  knowledgeUpdatesApi.mockRejectedValueOnce(new Error('offline'));
  render(<KnowledgeUpdatesAdmin />);
  await screen.findByRole('alert');
  expect(screen.queryByText('目前没有待审核版本。')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重试读取' }));
  await screen.findByText('更新的预算方法');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('pending queue includes exclusion suggestions and publishing keeps the selected page', async () => {
  const excluded = { ...value.versions[0], screening: { decision: 'exclude', reasons: [] } };
  knowledgeUpdatesApi.mockResolvedValue({ ...value, versions: [excluded],
    pagination: { page: 1, page_size: 25, total: 1, pages: 1 } });
  render(<KnowledgeUpdatesAdmin />);
  fireEvent.click(await screen.findByRole('button', { name: /查看正文与变化/ }));
  expect(screen.getByRole('heading', { name: '更新的预算方法' })).toHaveFocus();
  expect(screen.getByRole('button', { name: '审核通过并发布' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '拒绝本次版本' }));
  await screen.findByText('已拒绝本次版本。');
  expect(knowledgeUpdatesApi.mock.calls.filter(call => call[0] === 'GET').every(call => call[1] === '?status=pending&page=1&page_size=25')).toBe(true);
});


test('hides old rows while loading and uses the clamped page after the last item is reviewed', async () => {
  let finish;
  let reads = 0;
  knowledgeUpdatesApi.mockImplementation((method) => {
    if (method !== 'GET') return Promise.resolve({ saved: true });
    reads += 1;
    if (reads === 2) return new Promise(resolve => { finish = resolve; });
    return Promise.resolve({ ...value, pagination: { page: 1, page_size: 25, total: 25, pages: reads === 1 ? 2 : 1 } });
  });
  render(<KnowledgeUpdatesAdmin />);
  await screen.findByText('更新的预算方法');
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  expect(screen.getByText('正在读取审核队列…')).toBeInTheDocument();
  expect(screen.queryByText('更新的预算方法')).not.toBeInTheDocument();
  expect(screen.queryByText('目前没有待审核版本。')).not.toBeInTheDocument();
  finish({ ...value, pagination: { page: 2, page_size: 25, total: 26, pages: 2 } });
  fireEvent.click(await screen.findByRole('button', { name: /查看正文与变化/ }));
  fireEvent.click(screen.getByRole('button', { name: '拒绝本次版本' }));
  await screen.findByText('1–25 / 25 · 第 1 / 1 页');
  expect(knowledgeUpdatesApi).toHaveBeenLastCalledWith('GET', '?status=pending&page=2&page_size=25');
  expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
});

test.each([
  ['updated', '检查完成，发现新版本。', 'status'],
  ['unchanged', '检查完成，没有发现新版本。', 'status'],
  ['failed', '检查失败：来源暂不可用', 'alert'],
])('shows the returned source check outcome: %s', async (outcome, message, role) => {
  const source = { ...value.sources[0], enabled: true };
  knowledgeUpdatesApi.mockImplementation(async (method) => method === 'POST'
    ? { source: { ...source, last_result: outcome, last_error: '来源暂不可用' } }
    : { ...value, sources: [source] });
  render(<KnowledgeUpdatesAdmin />);
  const details = (await screen.findByText('管理采集来源')).closest('details');
  details.open = true;
  fireEvent.click(screen.getByRole('button', { name: '立即检查' }));
  expect(await screen.findByText(message)).toHaveAttribute('role', role);
  await waitFor(() => expect(screen.getByRole('button', { name: '立即检查' })).toBeEnabled());
});

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
  fireEvent.click(screen.getByRole('button', { name: '查看正文与变化' }));
  const publish = screen.getByRole('button', { name: '审核通过并发布' });
  expect(publish).toBeDisabled();
  expect(screen.getByText('旧正文')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(publish);
  await waitFor(() => expect(knowledgeUpdatesApi).toHaveBeenCalledWith('POST', '/versions/v/review', { decision: 'approve', confirmed: true, expected_current: null }));
});

test('supports enabling a source and clearly shows loading failure', async () => {
  render(<KnowledgeUpdatesAdmin />);
  fireEvent.click(await screen.findByRole('button', { name: '启用' }));
  await waitFor(() => expect(knowledgeUpdatesApi).toHaveBeenCalledWith('PUT', '/sources/s', { enabled: true }));
});

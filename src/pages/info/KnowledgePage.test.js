import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import KnowledgePage from './KnowledgePage';
import { fetchKnowledgeArticles } from '../../services/api';
jest.mock('../../services/api', () => ({ fetchKnowledgeArticles: jest.fn() }));
jest.mock('react-markdown', () => ({ __esModule: true, default: ({ children }) => <div>{children}</div> }));
const articles = [{ id:'1', title:'预算方法', summary:'生活费', category:'budget', content:'正文内容\n## 参考答案\n参考解释\n## 资料来源\n来源', tags:[], date:'2026-09-26' }, { id:'2', title:'储蓄方法', category:'saving', tags:[] }];
beforeEach(() => { window.scrollTo = jest.fn(); fetchKnowledgeArticles.mockResolvedValue(articles); });
const setup = (url='/info/knowledge') => render(<MemoryRouter initialEntries={[url]}><KnowledgePage /></MemoryRouter>);
test('从API加载内容并按目标筛选', async () => {
  setup(); await screen.findByText('预算方法');
  fireEvent.click(screen.getByRole('button', { name:'开始存钱' }));
  expect(screen.queryByText('预算方法')).toBeNull();
  expect(screen.getByText('储蓄方法')).toBeTruthy();
});
test('打开全文并保留分类返回地址', async () => {
  setup('/info/knowledge?category=budget');
  fireEvent.click(await screen.findByRole('link', { name:'阅读全文：预算方法' }));
  expect(screen.getByText('正文内容')).toBeTruthy();
  expect(screen.getByText('想好后，查看参考答案').closest('details').open).toBe(false);
  expect(screen.getByRole('link', { name:/返回知识库/ }).getAttribute('href')).toContain('category=budget');
});
test('错误可以重试，删除的文章显示缺失提示', async () => {
  fetchKnowledgeArticles.mockRejectedValueOnce(new Error('offline'));
  setup('/info/knowledge?article=missing');
  fireEvent.click(await screen.findByRole('button', { name:'重新加载' }));
  expect(await screen.findByText('这篇文章暂不可用')).toBeTruthy();
});

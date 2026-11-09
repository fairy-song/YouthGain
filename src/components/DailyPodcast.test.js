import React from 'react';
import { fireEvent, render as renderUI, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@testing-library/jest-dom';
import DailyPodcast from './DailyPodcast';
import { getTodayPodcast, sendPodcastFeedback, sendPodcastImpression } from '../services/podcasts';

jest.mock('../services/podcasts', () => ({ getTodayPodcast: jest.fn(), sendPodcastFeedback: jest.fn(), sendPodcastImpression: jest.fn() }));
const render = ui => renderUI(ui, { wrapper: MemoryRouter });

const recommendation = { date: '2026-10-11', status: 'ready', reason: '你选择了收支主题。', followed: false,
  program: { id: 'show-1', name: '好好说钱', publisher: '某编辑部', description: '长期讨论预算和金融选择。',
    canonical_url: 'https://podcasts.example/show-1', episode_title: '这一期谈预算',
    episode_url: 'https://podcasts.example/episode/one', episode_summary: '给生活费分配先后顺序。',
    episode_published_at: '2026-10-10', platform_links: [], topics: ['budget'] } };

beforeEach(() => {
  jest.clearAllMocks();
  getTodayPodcast.mockResolvedValue(recommendation);
  sendPodcastFeedback.mockResolvedValue({ saved: true });
  sendPodcastImpression.mockResolvedValue({ saved: true });
});

test('hands off a recommendation title for confirmation without claiming access to the transcript', async () => {
  const Destination = () => <output>{JSON.stringify(useLocation().state)}</output>;
  render(<><DailyPodcast userId="alice" /><Destination /></>);
  fireEvent.click(await screen.findByRole('link', { name: /这期知识怎么用/ }));
  expect(screen.getByRole('status')).toHaveTextContent('这一期谈预算');
  expect(screen.getByRole('status')).toHaveTextContent('不要编造节目内容');
  expect(sendPodcastFeedback).not.toHaveBeenCalled();
});

test('labels a fallback honestly without hiding the recommended episode', async () => {
  getTodayPodcast.mockResolvedValue({ ...recommendation, selection_tier: 'revisit' });
  render(<DailyPodcast userId="alice" />);
  expect(await screen.findByRole('heading', { name: '这一期谈预算' })).toBeInTheDocument();
  expect(screen.getByText(/重听推荐：近期新候选有限/)).toBeInTheDocument();
});

test('lets an empty recommendation recover on the same day without reloading the page', async () => {
  getTodayPodcast.mockResolvedValueOnce({ status: 'none', program: null,
    message: '当前目录暂无可播放的已审核单集，稍后可重试。' }).mockResolvedValueOnce(recommendation);
  render(<DailyPodcast userId="alice" />);
  fireEvent.click(await screen.findByRole('button', { name: '重新挑选' }));
  expect(await screen.findByRole('heading', { name: '这一期谈预算' })).toBeInTheDocument();
  expect(getTodayPodcast).toHaveBeenCalledTimes(2);
});

test('reports only visible exposure once and binds helpful feedback to its recommendation', async () => {
  let observe;
  const prior = window.IntersectionObserver;
  let visibility = 'hidden';
  const priorVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  window.IntersectionObserver = jest.fn(callback => {
    observe = callback;
    return { observe: jest.fn(), disconnect: jest.fn() };
  });
  getTodayPodcast.mockResolvedValue({ ...recommendation, recommendation_id: 'rec-1', as_of: '2026-10-11T12:00:00+08:00',
    evidence: [{ feature: 'upcoming_30d', label: '未来30日已记录待处理开支', value: 500, unit: '元' }] });
  try {
    render(<DailyPodcast userId="alice" />);
    await screen.findByRole('heading', { name: '这一期谈预算' });
    await waitFor(() => expect(typeof observe).toBe('function'));
    observe([{ isIntersecting: false, intersectionRatio: 0 }]);
    expect(sendPodcastImpression).not.toHaveBeenCalled();
    observe([{ isIntersecting: true, intersectionRatio: 1 }]);
    expect(sendPodcastImpression).not.toHaveBeenCalled();
    visibility = 'visible';
    fireEvent(document, new Event('visibilitychange'));
    observe([{ isIntersecting: true, intersectionRatio: 1 }]);
    expect(sendPodcastImpression).toHaveBeenCalledTimes(1);
    expect(sendPodcastImpression).toHaveBeenCalledWith('show-1', 'rec-1', expect.any(String));
    fireEvent.click(screen.getByRole('button', { name: '对我有帮助' }));
    await screen.findByRole('button', { name: '已反馈有帮助' });
    expect(sendPodcastFeedback).toHaveBeenCalledWith('show-1', 'helpful', expect.objectContaining({ recommendation_id: 'rec-1', event_id: expect.any(String) }));
    expect(screen.getByText(/未来30日已记录待处理开支：500.00/)).toBeInTheDocument();
  } finally {
    window.IntersectionObserver = prior;
    if (priorVisibility) Object.defineProperty(document, 'visibilityState', priorVisibility);
    else delete document.visibilityState;
  }
});

test('shows one episode, its direct link, and saves follow and dislike feedback', async () => {
  render(<DailyPodcast userId="alice" />);
  expect(await screen.findByRole('heading', { name: '这一期谈预算' })).toBeInTheDocument();
  expect(screen.getByText('给生活费分配先后顺序。')).toBeInTheDocument();
  const reason = screen.getByText('你选择了收支主题。');
  expect(reason.closest('details')).not.toHaveAttribute('open');
  fireEvent.click(screen.getByText('为什么推荐', { exact: true }));
  expect(reason).toBeVisible();
  const listenLink = screen.getByRole('link', { name: /直接听这一期/ });
  expect(listenLink).toHaveAttribute('href', recommendation.program.episode_url);
  expect(listenLink).not.toHaveAttribute('target', '_blank');
  fireEvent.click(screen.getByRole('button', { name: '收藏本期' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '已收藏本期' })).toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: '不感兴趣' }));
  expect(await screen.findByText('今天的节目已收起。点下方按钮可恢复。')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '这一期谈预算' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '恢复本期推荐' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: '恢复本期推荐' })).not.toBeInTheDocument());
  expect(sendPodcastFeedback.mock.calls).toEqual([['show-1', 'follow'], ['show-1', 'dislike'], ['show-1', 'undislike']]);
});

test('restores a recommendation dismissed before loading the page', async () => {
  getTodayPodcast.mockResolvedValueOnce({ ...recommendation, program: null, status: 'dismissed',
    program_id: 'show-1', recommendation_id: 'rec-1', message: '今天的节目已收起。' })
    .mockResolvedValueOnce(recommendation);
  render(<DailyPodcast userId="alice" />);
  fireEvent.click(await screen.findByRole('button', { name: '恢复本期推荐' }));
  expect(await screen.findByRole('heading', { name: '这一期谈预算' })).toBeInTheDocument();
  expect(sendPodcastFeedback).toHaveBeenCalledWith('show-1', 'undislike', expect.objectContaining({ recommendation_id: 'rec-1', event_id: expect.any(String) }));
});

test('shows an honest empty state when no programme qualifies', async () => {
  getTodayPodcast.mockResolvedValue({ date: '2026-10-11', status: 'none', program: null, message: '今天没有合适的新节目。' });
  render(<DailyPodcast userId="alice" />);
  expect(await screen.findByText('今天没有合适的新节目。')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /直接听这一期/ })).not.toBeInTheDocument();
});

test('late response from a previous account cannot replace the current recommendation', async () => {
  let finishOld;
  getTodayPodcast.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }))
    .mockResolvedValueOnce({ ...recommendation, program: { ...recommendation.program, id: 'show-2', episode_title: '新账户单集' } });
  const { rerender } = render(<DailyPodcast userId="alice" />);
  rerender(<DailyPodcast userId="bob" />);
  expect(await screen.findByRole('heading', { name: '新账户单集' })).toBeInTheDocument();
  finishOld(recommendation);
  expect(screen.queryByRole('heading', { name: '这一期谈预算' })).not.toBeInTheDocument();
});

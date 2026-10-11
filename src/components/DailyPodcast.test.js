import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DailyPodcast from './DailyPodcast';
import { getTodayPodcast, sendPodcastFeedback } from '../services/podcasts';

jest.mock('../services/podcasts', () => ({ getTodayPodcast: jest.fn(), sendPodcastFeedback: jest.fn() }));

const recommendation = { date: '2026-10-11', status: 'ready', reason: '你选择了收支主题。', followed: false,
  program: { id: 'show-1', name: '好好说钱', publisher: '某编辑部', description: '长期讨论预算和金融选择。',
    canonical_url: 'https://podcasts.example/show-1', episode_title: '这一期谈预算',
    episode_url: 'https://podcasts.example/episode/one', episode_summary: '给生活费分配先后顺序。',
    episode_published_at: '2026-10-10', platform_links: [], topics: ['budget'] } };

beforeEach(() => {
  jest.clearAllMocks();
  getTodayPodcast.mockResolvedValue(recommendation);
  sendPodcastFeedback.mockResolvedValue({ saved: true });
});

test('shows one episode, its direct link, and saves follow and dislike feedback', async () => {
  render(<DailyPodcast userId="alice" />);
  expect(await screen.findByRole('heading', { name: '这一期谈预算' })).toBeInTheDocument();
  expect(screen.getByText('给生活费分配先后顺序。')).toBeInTheDocument();
  expect(screen.getByText(/为什么适合你：你选择了收支主题/)).toBeInTheDocument();
  const listenLink = screen.getByRole('link', { name: /直接听这一期/ });
  expect(listenLink).toHaveAttribute('href', recommendation.program.episode_url);
  expect(listenLink).not.toHaveAttribute('target', '_blank');
  fireEvent.click(screen.getByRole('button', { name: '收藏本期' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '已收藏本期' })).toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: '不感兴趣' }));
  expect(await screen.findByText('今天的节目已收起。')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '这一期谈预算' })).not.toBeInTheDocument();
  expect(sendPodcastFeedback.mock.calls).toEqual([['show-1', 'follow'], ['show-1', 'dislike']]);
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

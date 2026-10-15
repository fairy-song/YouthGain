import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PodcastAdmin from './PodcastAdmin';
import { listPodcastPrograms, reviewPodcastProgram, savePodcastProgram, syncDuePodcasts } from '../services/podcasts';

jest.mock('../services/podcasts', () => ({
  listPodcastPrograms: jest.fn(), reviewPodcastProgram: jest.fn(), savePodcastProgram: jest.fn(),
  syncPodcastProgram: jest.fn(), syncDuePodcasts: jest.fn(),
  getPodcastPipeline: jest.fn().mockResolvedValue({ counts: { sources: 0, healthy_sources: 0, episodes: 0, pending_review: 0 }, sources: [], discoveries: [], jobs: [], integrations: {} }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  const program = { id: 'one', name: '收支节目', publisher: '某编辑部', topics: ['budget'],
    episode_title: '这一期谈预算', episode_url: 'https://podcasts.example/episode/one',
    episode_summary: '预算的具体安排。', episode_published_at: '2026-10-10',
    status: 'draft', last_episode_at: '2026-10-10', platform_links: [], source_error: null };
  listPodcastPrograms.mockResolvedValueOnce([]).mockResolvedValue([program]);
  savePodcastProgram.mockResolvedValue(program);
  reviewPodcastProgram.mockResolvedValue({ ...program, status: 'approved' });
  syncDuePodcasts.mockResolvedValue({ synced: [], failed: [] });
});

test('administrator can create a draft and explicitly approve it', async () => {
  render(<PodcastAdmin />);
  expect(await screen.findByText('目录还没有单集。请先添加并审核。')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('节目名称'), { target: { value: '收支节目' } });
  fireEvent.change(screen.getByLabelText('发布者'), { target: { value: '某编辑部' } });
  fireEvent.change(screen.getByLabelText('发布者填写的节目简介'), { target: { value: '长期讨论收支安排' } });
  fireEvent.change(screen.getByLabelText('节目主页（HTTPS）'), { target: { value: 'https://podcasts.example/show' } });
  fireEvent.change(screen.getByLabelText('单集标题'), { target: { value: '这一期谈预算' } });
  fireEvent.change(screen.getByLabelText('单集直达链接（HTTPS）'), { target: { value: 'https://podcasts.example/episode/one' } });
  fireEvent.change(screen.getByLabelText('本期内容简介'), { target: { value: '预算的具体安排。' } });
  fireEvent.change(screen.getByLabelText('单集发布日期'), { target: { value: '2026-10-10' } });
  fireEvent.change(screen.getByLabelText('节目最近更新日期'), { target: { value: '2026-10-10' } });
  fireEvent.click(screen.getByLabelText('安排收支'));
  fireEvent.click(screen.getByRole('button', { name: '保存待审核' }));
  await waitFor(() => expect(savePodcastProgram).toHaveBeenCalledWith(expect.objectContaining({
    name: '收支节目', episode_title: '这一期谈预算',
    episode_url: 'https://podcasts.example/episode/one', topics: ['budget'], difficulty: 1, quality_score: 0.8,
  }), null));
  fireEvent.click(await screen.findByRole('button', { name: '审核发布' }));
  await waitFor(() => expect(reviewPodcastProgram).toHaveBeenCalledWith('one', true));
  expect(await screen.findByText('单集已审核发布。')).toBeInTheDocument();
});

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PodcastPipelineAdmin from './PodcastPipelineAdmin';
import { getPodcastPipeline, savePodcastSource, queuePodcastSource, reviewPodcastSource,
  retryPodcastJob } from '../services/podcasts';

jest.mock('../services/podcasts', () => ({
  getPodcastPipeline: jest.fn(), savePodcastSource: jest.fn(), queuePodcastSource: jest.fn(),
  discoverPodcastSources: jest.fn(), submitPodcastSource: jest.fn(), reviewPodcastSource: jest.fn(),
  retryPodcastJob: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  getPodcastPipeline.mockResolvedValue({ counts: { sources: 1, healthy_sources: 1, episodes: 3, pending_review: 2 },
    sources: [{ id: 'feed1', name: '校园订阅', url: 'https://feeds.example/rss', enabled: true, trusted: false, auto_approve: false }],
    jobs: [{ id: 'job1', kind: 'fetch', state: 'failed', attempts: 4, error: '来源离线' }],
    discoveries: [{ id: 'candidate1', title: '预算课程', url: 'https://new.example/rss', provider: 'podcastindex', status: 'pending' }],
    integrations: { podcastindex: true, listennotes: false } });
  savePodcastSource.mockResolvedValue({ id: 'newfeed' });
  queuePodcastSource.mockResolvedValue({ state: 'queued' });
});

test('add a permitted source queues discovery without publishing episodes', async () => {
  render(<PodcastPipelineAdmin />);
  expect(await screen.findByText('校园订阅')).toBeInTheDocument();
  fireEvent.click(screen.getByText('添加 RSS 来源'));
  fireEvent.change(screen.getByLabelText('来源名称'), { target: { value: '金融课堂' } });
  fireEvent.change(screen.getByLabelText('公开 RSS 地址'), { target: { value: 'https://feeds.example/new.xml' } });
  fireEvent.click(screen.getByRole('button', { name: '保存来源并采集' }));
  expect(await screen.findByText('来源已保存，首次采集已排队。')).toBeInTheDocument();
  expect(savePodcastSource).toHaveBeenCalledWith({ name: '金融课堂', url: 'https://feeds.example/new.xml', permission: 'public_rss' });
  expect(queuePodcastSource).toHaveBeenCalledWith('newfeed');
});

test('unconfigured integrations stay disabled and source review and retry require explicit actions', async () => {
  render(<PodcastPipelineAdmin />);
  await screen.findByText('校园订阅');
  expect(await screen.findByRole('button', { name: 'Listen Notes 搜索（未配置）' })).toBeDisabled();
  expect(screen.getByLabelText('完整资料通过规则检查后自动发布（默认关闭）')).toBeDisabled();
  fireEvent.click(screen.getByText('候选来源待确认'));
  fireEvent.click(screen.getByRole('button', { name: '已核对公开 RSS，接入' }));
  await waitFor(() => expect(reviewPodcastSource).toHaveBeenCalledWith('candidate1', true));
  await screen.findByText('已按公开 RSS 接入，等待后台采集；请核准服务端来源主机。');
  fireEvent.click(screen.getByText('后台任务与失败重试'));
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(await screen.findByText('重试任务已排队。')).toBeInTheDocument();
  expect(retryPodcastJob).toHaveBeenCalledWith('job1');
});

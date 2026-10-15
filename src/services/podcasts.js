import { authenticatedApi as api } from './api';

export const getTodayPodcast = async () => (await api.get('/podcasts/today')).data;
export const sendPodcastFeedback = async (programId, kind, options = {}) =>
  (await api.post('/podcasts/feedback', { program_id: programId, kind, ...options })).data.feedback;
export const sendPodcastImpression = async (programId, recommendationId, eventId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`) =>
  (await api.post('/podcasts/events', { program_id: programId, recommendation_id: recommendationId,
    kind: 'impression', event_id: eventId })).data.event;

export const listPodcastPrograms = async () => (await api.get('/podcasts/admin/programs')).data.programs;
export const savePodcastProgram = async (program, id) =>
  (await (id ? api.put(`/podcasts/admin/programs/${encodeURIComponent(id)}`, program)
    : api.post('/podcasts/admin/programs', program))).data.program;
export const reviewPodcastProgram = async (id, approved) =>
  (await api.post(`/podcasts/admin/programs/${encodeURIComponent(id)}/review`, { approved })).data.program;
export const syncPodcastProgram = async id =>
  (await api.post(`/podcasts/admin/programs/${encodeURIComponent(id)}/sync`)).data.program;
export const syncDuePodcasts = async () => (await api.post('/podcasts/admin/sync-due')).data;
export const getPodcastPipeline = async () => (await api.get('/podcasts/admin/pipeline')).data;
export const savePodcastSource = async (source, id) =>
  (await (id ? api.put(`/podcasts/admin/sources/${encodeURIComponent(id)}`, source)
    : api.post('/podcasts/admin/sources', source))).data.source;
export const queuePodcastSource = async id =>
  (await api.post(`/podcasts/admin/sources/${encodeURIComponent(id)}/sync`)).data;
export const discoverPodcastSources = async provider =>
  (await api.post('/podcasts/admin/discover', { provider })).data;
export const submitPodcastSource = async data =>
  (await api.post('/podcasts/admin/discoveries', data)).data.discovery;
export const reviewPodcastSource = async (id, accepted, permission = 'public_rss') =>
  (await api.post(`/podcasts/admin/discoveries/${encodeURIComponent(id)}/review`, { accepted, permission })).data;
export const retryPodcastJob = async id =>
  (await api.post(`/podcasts/admin/jobs/${encodeURIComponent(id)}/retry`)).data;

import { authenticatedApi as api } from './api';

export const getTodayPodcast = async () => (await api.get('/podcasts/today')).data;
export const sendPodcastFeedback = async (programId, kind, options = {}) =>
  (await api.post('/podcasts/feedback', { program_id: programId, kind, ...options })).data.feedback;
export const sendPodcastImpression = async (programId, recommendationId) =>
  (await api.post('/podcasts/events', { program_id: programId, recommendation_id: recommendationId,
    kind: 'impression', event_id: `impression:${recommendationId}` })).data.event;

export const listPodcastPrograms = async () => (await api.get('/podcasts/admin/programs')).data.programs;
export const savePodcastProgram = async (program, id) =>
  (await (id ? api.put(`/podcasts/admin/programs/${encodeURIComponent(id)}`, program)
    : api.post('/podcasts/admin/programs', program))).data.program;
export const reviewPodcastProgram = async (id, approved) =>
  (await api.post(`/podcasts/admin/programs/${encodeURIComponent(id)}/review`, { approved })).data.program;
export const syncPodcastProgram = async id =>
  (await api.post(`/podcasts/admin/programs/${encodeURIComponent(id)}/sync`)).data.program;
export const syncDuePodcasts = async () => (await api.post('/podcasts/admin/sync-due')).data;

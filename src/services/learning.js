import { authenticatedApi as api } from './api';

export const getLearning = async () => (await api.get('/learning')).data;
export const getLearningProfile = async () => (await api.get('/learning/profile')).data.profile;
export const saveLearningProfile = async profile => (await api.put('/learning/profile', profile)).data.profile;
export const saveLearningEntry = async (kind, data) => (await api.post(`/learning/entries/${kind}`, data)).data.entry;
export const saveDecisionOutcome = async (id, data) => (await api.put(`/learning/decisions/${encodeURIComponent(id)}/outcome`, data)).data.entry;
export const saveTransactionReflection = async (id, data) => (await api.put(`/learning/transactions/${encodeURIComponent(id)}/reflection`, data)).data.entry;
export const getWeeklyFacts = async () => (await api.get('/learning/weekly-facts')).data;
export const updateUpcoming = async (id, handled) => (await api.put(`/learning/upcoming/${encodeURIComponent(id)}`, { handled })).data.entry;
export const learningError = error => error?.response?.data?.message || error?.message || '暂时无法保存，请重试。';

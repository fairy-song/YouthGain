import { authenticatedApi as api } from './api';
import { getAuth, getIdToken, sendEmailVerification } from 'firebase/auth';
import { app } from './firebase';

function firebaseUser() {
  const user = app && getAuth(app).currentUser;
  if (!user) throw new Error('请使用真实账号登录后验证邮箱');
  return user;
}
export const sendResearchVerification = async () => sendEmailVerification(firebaseUser());
export const refreshResearchIdentity = async () => {
  const user = firebaseUser();
  await user.reload();
  localStorage.setItem('authToken', await getIdToken(user, true));
};

export const getResearchAccess = async () => (await api.get('/research/access')).data;
export const getResearchParticipation = async () => (await api.get('/research/participation')).data;
export const setResearchConsent = async (id, participate, version) => (await api.put(`/research/projects/${id}/consent`, { participate, version })).data;
export const createResearchProject = async payload => (await api.post('/research/projects', payload)).data;
export const setResearchMember = async (id, payload) => (await api.put(`/research/projects/${id}/members`, payload)).data;
export const getResearchReleases = async id => (await api.get(`/research/projects/${id}/releases`)).data;
export const publishResearchRelease = async (id, month) => (await api.post(`/research/projects/${id}/releases`, { month })).data;
export const exportResearchRelease = async (id, month) => {
  const response = await api.get(`/research/projects/${id}/releases/${month}/export`, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `research-${month}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export const researchError = error => error.response?.data?.message || error.message || '研究服务暂时不可用';

import { readDraft } from '../data/firstVisit';

const STUDENT_PATHS = new Set(['/', '/dashboard', '/onboarding', '/learning', '/profile', '/profile/research', '/assessment', '/coach']);
const ADMIN_PATHS = new Set(['/admin', '/admin/stats', '/admin/users', '/admin/knowledge', '/admin/coach', '/admin/podcasts', '/admin/research']);

function allowedDestination(from, paths) {
  if (typeof from !== 'string' || /[\\#\r\n\t]/.test(from)) return null;
  const [pathname] = from.split('?');
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return paths.has(normalized) && !from.startsWith('//') ? from : null;
}

export function authDestination(state, { schoolMode = false, adminMode = false } = {}) {
  if (schoolMode) return { to: '/research' };
  if (adminMode) return { to: allowedDestination(state?.from, ADMIN_PATHS) || '/admin' };

  if (typeof state?.coachEntry?.prompt === 'string') {
    return { to: '/coach', state: { prompt: state.coachEntry.prompt.slice(0, 2000), returnTo: '/' } };
  }
  if (state?.questionnaireIntent) {
    const draft = readDraft();
    if (draft?.complete && draft.submission_id === state.questionnaireIntent) {
      return { to: '/onboarding/complete', state: { questionnaireIntent: draft.submission_id } };
    }
    return { to: '/start', state: { draftUnavailable: true } };
  }

  return { to: allowedDestination(state?.from, STUDENT_PATHS) || '/' };
}

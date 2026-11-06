import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { readDraft, writeDraft, clearDraft, draftOwner, normalizedAnswers } from '../data/firstVisit';
import { saveQuestionnaire, learningError } from '../services/learning';

export default function OnboardingComplete() {
  const navigate = useNavigate();
  const intent = useLocation().state?.questionnaireIntent;
  const owner = draftOwner(useAuth().currentUser);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const owned = readDraft(owner);
    const draft = owned?.submission_id === intent ? owned : readDraft();
    if (!owner || !intent || !draft?.complete || draft.submission_id !== intent) {
      navigate('/start', { replace: true, state: { draftUnavailable: true } });
      return undefined;
    }
    if (!draft.owner) writeDraft({ ...draft, owner });
    saveQuestionnaire({ version: draft.version, submission_id: draft.submission_id,
      answers: normalizedAnswers(draft.answers) }).then(() => {
      if (!active) return;
      if (readDraft(owner)?.submission_id === intent) clearDraft();
      navigate('/profile?section=questionnaire', { replace: true, state: { questionnaireSaved: true } });
    }).catch(e => { if (active) setError(learningError(e)); });
    return () => { active = false; };
  }, [navigate, attempt, intent, owner]);
  return <main className="py-5 mx-auto" style={{ maxWidth: 520 }}>
    <h1 className="h3">正在保存你的问卷</h1>
    {error ? <div role="alert" className="alert alert-warning">{error}<div className="mt-3"><button className="btn btn-primary me-2" onClick={() => { setError(''); setAttempt(v => v + 1); }}>重试保存</button><Link to="/start" className="btn btn-outline-secondary">返回结果</Link></div></div>
      : <p className="text-muted">保存完成后会打开“我的 · 用户问卷”。</p>}
  </main>;
}

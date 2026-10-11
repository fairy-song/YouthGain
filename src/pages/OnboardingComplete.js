import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { readDraft, clearDraft, normalizedAnswers } from '../data/firstVisit';
import { saveQuestionnaire, learningError } from '../services/learning';

export default function OnboardingComplete() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const draft = readDraft();
    if (!draft?.complete) { navigate('/start', { replace: true }); return () => { active = false; }; }
    saveQuestionnaire({ version: draft.version, submission_id: draft.submission_id,
      answers: normalizedAnswers(draft.answers) }).then(() => {
      if (!active) return;
      clearDraft();
      navigate('/profile?section=questionnaire', { replace: true, state: { questionnaireSaved: true } });
    }).catch(e => { if (active) setError(learningError(e)); });
    return () => { active = false; };
  }, [navigate, attempt]);
  return <main className="py-5 mx-auto" style={{ maxWidth: 520 }}>
    <h1 className="h3">正在保存你的问卷</h1>
    {error ? <div role="alert" className="alert alert-warning">{error}<div className="mt-3"><button className="btn btn-primary me-2" onClick={() => { setError(''); setAttempt(v => v + 1); }}>重试保存</button><Link to="/start" className="btn btn-outline-secondary">返回结果</Link></div></div>
      : <p className="text-muted">保存完成后会打开“我的 · 用户问卷”。</p>}
  </main>;
}

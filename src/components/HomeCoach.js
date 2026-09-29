import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaRobot, FaArrowRight } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import './HomeCoach.css';

export default function HomeCoach() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const openCoach = (prompt = '') => {
    const state = { prompt, returnTo: '/' };
    if (currentUser) navigate('/coach', { state });
    else navigate('/login', { state: { coachEntry: state } });
  };
  return <section className="home-coach" aria-labelledby="home-coach-title">
    <div className="home-coach-intro"><span className="home-coach-icon"><FaRobot aria-hidden="true" /></span><div><h2 id="home-coach-title">AI 智能教练</h2><p>花钱前犹豫？和青盈聊聊，把选择想清楚。</p></div></div>
    <div className="home-coach-questions" aria-label="常见问题">{['这笔消费值得买吗？', '这周生活费怎么安排？', '如何开始存下第一笔钱？'].map(prompt => <button type="button" key={prompt} onClick={() => openCoach(prompt)}>{prompt}<FaArrowRight aria-hidden="true" /></button>)}</div>
    <form onSubmit={e => { e.preventDefault(); openCoach(question.trim()); }}>
      <label className="visually-hidden" htmlFor="home-coach-question">想问教练的问题</label>
      <input id="home-coach-question" value={question} onChange={e => setQuestion(e.target.value)} maxLength={2000} placeholder="也可以写下你自己的问题…" />
      <button type="submit" className="btn btn-success">和教练聊聊 <FaArrowRight aria-hidden="true" /></button>
    </form>
    <small>{currentUser ? '进入对话后确认发送，按你的节奏聊。' : '登录后继续，刚才的问题会为你保留。'}</small>
  </section>;
}

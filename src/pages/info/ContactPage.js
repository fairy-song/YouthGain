import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import InfoPageHeader from './InfoPageHeader';

export default function ContactPage() {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState('');
  const [download, setDownload] = useState('');
  useEffect(() => {
    if (!draft) return;
    const url = URL.createObjectURL(new Blob([draft], { type: 'text/plain;charset=utf-8' }));
    setDownload(url);
    return () => URL.revokeObjectURL(url);
  }, [draft]);
  return <div className="bg-neutral-50 min-h-screen pb-20">
    <InfoPageHeader title="联系与反馈" subtitle="先把遇到的问题记下来，方便与项目维护者沟通。" category="about" />
    <div className="container" style={{ maxWidth: 850 }}>
      <div className="alert alert-info">当前版本尚未接入在线客服或留言发送服务。这里生成的反馈草稿只在当前页面保留，不会自动发给任何人。</div>
      <div className="d-flex flex-wrap gap-3 mb-4"><Link to="/info/faq">查看常见问题</Link><Link to="/info/tutorial">查看使用教程</Link><Link to="/">返回首页</Link></div>
      <section className="card border-0 shadow-sm"><div className="card-body p-4">
        <h2 className="h4">整理反馈</h2><p className="text-muted">请描述操作步骤、预期结果和实际结果。不要填写密码、验证码或完整支付信息。</p>
        <form onSubmit={event => { event.preventDefault(); setDraft('青盈反馈\n主题：' + subject.trim() + '\n\n' + message.trim()); }}>
          <label className="form-label" htmlFor="feedback-subject">反馈主题</label><input id="feedback-subject" className="form-control mb-3" required maxLength={100} value={subject} onChange={event => { setSubject(event.target.value); setDraft(''); }} />
          <label className="form-label" htmlFor="feedback-message">问题描述</label><textarea id="feedback-message" className="form-control mb-3" required rows={6} maxLength={5000} value={message} onChange={event => { setMessage(event.target.value); setDraft(''); }} />
          <button className="btn btn-primary" type="submit" disabled={!subject.trim() || !message.trim()}>生成反馈草稿</button>
        </form>
        {draft && <div className="mt-4"><p role="status">草稿已生成，尚未发送。请下载后自行交给项目维护者。</p><label className="form-label" htmlFor="feedback-draft">反馈草稿</label><textarea id="feedback-draft" className="form-control mb-3" rows={8} readOnly value={draft} />{download && <a className="btn btn-outline-primary" href={download} download="青盈反馈.txt">下载反馈草稿</a>}</div>}
      </div></section>
    </div>
  </div>;
}

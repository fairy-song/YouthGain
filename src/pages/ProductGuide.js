import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { readGuide, saveGuide } from '../data/productGuide';
import ExpenseMoney from '../components/ExpenseMoney';
import { PRODUCT_GUIDE_ENABLED } from '../config/features';
import './ProductGuide.css';

export default function ProductGuide() {
  const { currentUser, workspace, initializing } = useAuth();
  if (initializing) return <p role="status">正在恢复登录状态…</p>;
  if (workspace === 'admin') return <Navigate to="/admin" replace />;
  if (workspace === 'school') return <Navigate to="/research" replace />;
  if (!PRODUCT_GUIDE_ENABLED) return <Navigate to="/" replace />;
  const owner = workspace === 'student' ? currentUser?.uid : null;
  return <Guide key={owner || 'guest'} owner={owner} />;
}

function Guide({ owner }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(() => {
    const saved = readGuide(owner);
    return saved?.status === 'active' ? saved.step : 0;
  });
  const [expanded, setExpanded] = useState(false);
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  const move = next => { saveGuide(owner, next); setStep(next); };
  const leave = status => { saveGuide(owner, step, status); navigate('/', { replace: true }); };
  const titles = ['花出去的钱，也可以看得见。', '先留出需要的钱，再考虑这一笔。', '现在，只做你需要的第一步。'];
  return <main className="product-guide">
    <header className="guide-nav"><Link to="/" onClick={() => saveGuide(owner, step, 'skipped')} className="guide-brand">青盈 <small>YouthGain</small></Link>
      <button type="button" onClick={() => leave('skipped')}>跳过引导</button></header>
    <div className="guide-layout">
      <aside className="guide-index" aria-label="引导进度"><p>从这里，轻松开始</p><ol>{['看见花费', '理解安排', '开始实践'].map((label, i) => <li key={label} aria-current={i === step ? 'step' : undefined}><span>{`0${i + 1}`}</span>{label}</li>)}</ol><p>不用一次学会所有功能，<br />也不用每天打卡。</p></aside>
      <section className="guide-content" aria-labelledby="guide-title">
        <div key={step} className="guide-scene">
          <p className="guide-kicker">30 秒认识青盈 · {step + 1} / 3</p>
          <h1 id="guide-title" ref={heading} tabIndex={-1}>{titles[step]}</h1>
          {step === 0 && <>
            <p className="guide-copy">数字很容易划过眼前。把一笔花费展开，看看它由多少张纸币、多少枚硬币组成。</p>
            <div className="guide-demo"><span>示例 · 一次餐饮消费</span><strong>¥38.50</strong>
              <button className="guide-expand" type="button" aria-expanded={expanded} aria-controls="guide-money" onClick={() => setExpanded(value => !value)}>{expanded ? '收起钱币' : '点一下，把数字变成钱'} <span aria-hidden="true">↓</span></button>
              {expanded && <div id="guide-money"><ExpenseMoney amount={38.5} title="示例消费" note="这只是演示，不会记入账本或实际扣款。图形为面额示意。" /></div>}
              {!expanded && <p className="guide-note">这只是演示，不会记入账本。</p>}
            </div>
          </>}
          {step === 1 && <>
            <p className="guide-copy">记账后，可以回看花费；需要做选择时，再补充未来开支和资金安排。教练会帮助梳理条件，由你决定。</p>
            <div className="guide-plan"><p>假设你手里有 <strong>¥200</strong></p><div><span>周末要预留的车费</span><strong>¥120</strong></div><div><span>扣除这笔预留后</span><strong>¥80</strong></div><p className="guide-note">¥200 − ¥120 = ¥80。其他必要开支还未计入，不能直接当作“放心花”的额度。</p></div>
            <p className="guide-note">你可以先记账，之后有需要再用安排、辅导和学习。</p>
          </>}
          {step === 2 && <>
            <p className="guide-copy">先记录一笔你愿意回看的花费。回到“今天”，就能查看累计花费；想进一步理解，再选择提问或复盘。</p>
            <ol className="guide-path"><li><b>账本</b><span>记一笔或导入已有账单</span></li><li><b>今天</b><span>看看钱的去向和近期安排</span></li><li><b>学习与教练</b><span>遇到具体问题时再进入</span></li></ol>
            <div className="guide-actions"><Link className="guide-primary" to={owner ? '/dashboard' : '/login'} state={owner ? undefined : { from: '/?intro=done&first=ledger' }} onClick={() => saveGuide(owner, step, 'done')}>{owner ? '先去记一笔' : '登录，从记一笔开始'} <span aria-hidden="true">→</span></Link>
              {owner ? <button type="button" onClick={() => leave('done')}>先看看首页</button> : <Link to="/login" state={{ from: '/?intro=done' }} onClick={() => saveGuide(owner, step, 'done')}>登录后先看看首页</Link>}</div>
          </>}
        </div>
        <footer className="guide-footer"><button type="button" disabled={step === 0} onClick={() => move(step - 1)}>上一步</button>
          {step < 2 ? <button className="guide-primary" type="button" onClick={() => move(step + 1)}>{step === 0 ? '接下来，钱怎么安排' : '明白了，开始使用'} <span aria-hidden="true">→</span></button> : <button type="button" onClick={() => leave('skipped')}>稍后再说</button>}</footer>
        <p className="guide-note">进度保存在本机浏览器。以后可以从首页“使用引导”重新查看。</p>
      </section>
    </div>
  </main>;
}

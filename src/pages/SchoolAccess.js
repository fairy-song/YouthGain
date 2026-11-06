import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { focusContent } from '../utils/focusContent';
import ResearchCharts from '../components/ResearchCharts';
import './SchoolResearch.css';

export function SchoolWorkspace() {
  const { workspace, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');

  async function leave() {
    setError(''); setSigningOut(true);
    try { await logout(); navigate('/research/login', { replace: true }); }
    catch { setError('退出失败，请重试。'); }
    finally { setSigningOut(false); }
  }

  return <div className="school-workspace">
    <a className="member-skip" href="#school-main" onClick={e => focusContent(e, 'school-main')}>跳到学校端内容</a>
    <header className="school-workspace-bar">
      <Link to="/research" className="school-workspace-brand"><span aria-hidden="true">青</span> 青盈学校端</Link>
      <nav aria-label="学校端导航">
        {pathname !== '/research/demo' && <Link to="/research/demo">演示月报</Link>}
        {workspace === 'school' && <button type="button" disabled={signingOut} onClick={leave}>{signingOut ? '正在退出…' : '退出登录'}</button>}
      </nav>
    </header>
    {error && <p role="alert" className="school-workspace-error">{error}</p>}
    <main id="school-main" tabIndex={-1}><Outlet /></main>
  </div>;
}

const demoCharts = [
  { title: '参与者的月度支出区间', bins: [{ label: '500 元以下', percent: 20 }, { label: '500–1000 元', percent: 52 }, { label: '1000 元以上', percent: 28 }] },
  { title: '是否记录开支计划', bins: [{ label: '有开支计划', percent: 61 }, { label: '未记录计划', percent: 39 }] },
];

export function SchoolReportDemo() {
  return <div className="school-research school-demo-report">
    <header className="research-masthead">
      <div><span>学校端 / 公开演示</span><h1>演示月报</h1></div>
      <Link to="/research/login">登录学校端 <span aria-hidden="true">→</span></Link>
    </header>
    <p className="research-intro">这是一个使用固定模拟数据的示例，可先了解老师能看到什么。示例与任何学校或学生的真实记录无关。</p>
    <section className="research-project-summary">
      <p className="research-kicker">示例项目</p>
      <h2>新生生活费规划试点</h2>
      <p className="research-source" data-kind="demo"><strong>模拟数据</strong> · 仅用于演示，不能用于研究结论。</p>
    </section>
    <article className="research-report" aria-label="模拟项目月报">
      <header className="research-report-heading"><div><span className="research-kicker">月度报告 / 模拟</span><h2>2026-10</h2></div></header>
      <ResearchCharts charts={demoCharts} />
      <p className="research-report-note">正式月报只能由已获项目授权的账号查看和导出。正式报告展示群体统计及适用范围。</p>
    </article>
  </div>;
}

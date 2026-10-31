import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import InfoPageHeader from './InfoPageHeader';

const tutorials = [
  { id: 'account', category: '入门指南', title: '登录与完善资料', to: '/profile', action: '打开我的资料', steps: ['使用邮箱登录；本地开发模式会在登录页说明模拟登录方式。', '进入“我的”，点击“编辑资料”，填写生活费、到账日和必要开支。', '点击“保存资料”；只有你主动点击“确认实际余额”时才重新核对余额。'] },
  { id: 'record', category: '入门指南', title: '记录一笔收支', to: '/dashboard', action: '打开账本', steps: ['选择支出或收入，填写金额、类别和实际日期。', '点击“记一笔”，等待保存成功；支出可展开钱币查看。', '漏记时用“补记账单”；批量导入先下载标准模板、预览，再确认入账。'] },
  { id: 'goals', category: '入门指南', title: '设置储蓄目标与未来开支', to: '/dashboard?tab=goals', action: '打开储蓄目标', steps: ['在账本选择“储蓄目标”，填写目标金额、已存金额和截止日。', '保存后核对锁定金额与留钱建议；建议依赖你已填写的资料。', '考试费、订阅等尚未支付的事项可在“未来开支”记录，标记处理不会自动记账。'] },
  { id: 'practice', category: '学习与复盘', title: '练习、回看与每周复盘', to: '/learning', action: '开始练习', steps: ['学习页每次展示一个问题，填写或选择答案后点击“看看我的想法”。', '多步骤情境可用“上一步”回看；也可展开“自己选一节课”。', '在“其他功能”进入每周复盘。不需要每天登录，没有消费也可以回看计划。'] },
  { id: 'assessment', category: '学习与复盘', title: '理解自我探索结果', to: '/assessment', action: '打开自我探索', steps: ['按照自己的真实情况作答，不需要追求高分。', '提交后查看各维度的自述情况和历史趋势。', '结果反映这次回答，不能代替真实财务能力评价或投资判断。'] },
  { id: 'coach', category: 'AI教练', title: '让教练帮助比较消费选择', to: '/coach', action: '打开教练', steps: ['输入一个具体问题，例如“想买一副耳机，如何比较选择”。', '默认不引用你的个人财务资料；如需结合账本，由你主动勾选授权。', '查看回答中的依据与来源；实际购买后仍需到账本记录，聊天不会扣款。'] },
  { id: 'privacy', category: '设置与账户', title: '管理研究参与和退出登录', to: '/profile', action: '打开我的', steps: ['在“我的”查看研究参与说明，再决定是否参与开放项目。', '学校研究入口按账号授权开放，普通用户没有研究管理权限。', '共用设备使用后点击“退出登录”。当前没有双因素认证、自动转账或付费订阅入口。'] },
];

export default function TutorialPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const filtered = tutorials.filter(item => (category === '全部' || item.category === category) && [item.title, ...item.steps].join(' ').includes(query.trim()));
  return <div className="bg-neutral-50 min-h-screen pb-20">
    <InfoPageHeader title="使用教程" subtitle="按照当前版本的实际操作，一步步完成记账、学习和复盘。" category="resources" />
    <div className="container" style={{ maxWidth: 1000 }}>
      <label htmlFor="tutorial-search" className="form-label">搜索教程</label><input id="tutorial-search" type="search" className="form-control mb-3" value={query} onChange={event => setQuery(event.target.value)} placeholder="试试：记账、储蓄、教练" />
      <div className="d-flex flex-wrap gap-2 mb-3">{['全部', ...new Set(tutorials.map(item => item.category))].map(name => <button type="button" key={name} aria-pressed={category === name} className={'btn ' + (category === name ? 'btn-primary' : 'btn-outline-secondary')} onClick={() => setCategory(name)}>{name}</button>)}</div>
      <p role="status">找到 {filtered.length} 篇图文教程</p>
      <div className="row g-3">{filtered.map(item => <div key={item.id} className="col-12 col-md-6"><article className="card h-100 border-0 shadow-sm"><div className="card-body p-4"><small className="text-muted">{item.category}</small><h2 className="h5 mt-2">{item.title}</h2><details><summary>阅读操作步骤</summary><ol className="mt-3 ps-4">{item.steps.map(step => <li className="mb-2" key={step}>{step}</li>)}</ol></details><Link to={item.to} className="btn btn-outline-primary mt-3">{item.action}</Link></div></article></div>)}</div>
      {!filtered.length && <div className="text-center py-5"><p>没有找到相关教程，换个关键词或清除筛选。</p><button type="button" className="btn btn-outline-secondary" onClick={() => { setQuery(''); setCategory('全部'); }}>查看所有教程</button></div>}
      <p className="mt-4"><Link to="/info/faq">常见问题</Link> · <Link to="/info/contact">整理使用反馈</Link></p>
    </div>
  </div>;
}

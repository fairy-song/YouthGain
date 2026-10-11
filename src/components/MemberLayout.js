import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { FaBookOpen, FaHome, FaUser, FaWallet } from 'react-icons/fa';
import { mainNavigation } from '../services/navigation';
import './MemberLayout.css';

const icons = { home: FaHome, wallet: FaWallet, book: FaBookOpen, user: FaUser };

export default function MemberLayout() {
  const { pathname } = useLocation();
  const navigation = <nav className="member-navigation" aria-label="主要导航">
    {mainNavigation.map(({ path, label, icon }) => {
      const Icon = icons[icon];
      const active = path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
      return <Link key={path} to={path} className={`member-nav-link${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
        <Icon aria-hidden="true" /><span>{label}</span>
      </Link>;
    })}
  </nav>;

  return <div className="member-shell">
    <a className="member-skip" href="#member-main">跳到主要内容</a>
    <header className="member-header">
      <div className="member-header-inner">
        <Link className="member-brand" to="/" aria-label="青盈，返回今天"><span className="member-brand-mark" aria-hidden="true">青</span><span>青盈</span></Link>
        <div className="member-desktop-nav">{navigation}</div>
      </div>
    </header>
    <main id="member-main" className="member-main"><Outlet /></main>
    <div className="member-mobile-nav">{navigation}</div>
  </div>;
}

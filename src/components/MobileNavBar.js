import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { mainNavigation } from '../services/navigation';
import { useAuth } from '../contexts/AuthContext';
import { FaHome, FaUser, FaWallet, FaBook } from 'react-icons/fa';

const icons = { home: FaHome, wallet: FaWallet, book: FaBook, user: FaUser };

export default function MobileNavBar() {
  const { workspace } = useAuth();
  const signedIn = workspace === 'student';
  const location = useLocation();
  const itemWidth = `${100 / mainNavigation.length}%`;
  return <div className="d-md-none mobile-main-nav" aria-label="主导航">
    {mainNavigation.map(item => {
      const Icon = icons[item.icon];
      const active = location.pathname === item.path;
      return <Link key={item.path} to={item.requireAuth && !signedIn ? '/login' : item.path} state={item.requireAuth && !signedIn ? { from: item.path } : undefined} aria-current={active ? 'page' : undefined} className={`mobile-main-nav-item ${active ? 'active' : ''}`} style={{ width: itemWidth }}>
        <Icon aria-hidden="true" /><span>{item.label}</span>
      </Link>;
    })}
  </div>;
}

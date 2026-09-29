import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { mainNavigation } from '../services/navigation';
import { useAuth } from '../contexts/AuthContext';
import { FaHome, FaUser, FaWallet, FaBook, FaShieldAlt } from 'react-icons/fa';

const icons = { home: FaHome, wallet: FaWallet, book: FaBook, user: FaUser };

export default function MobileNavBar() {
  const { currentUser, isAdmin } = useAuth();
  const location = useLocation();
  const destinations = [...mainNavigation, ...(currentUser && isAdmin ? [{ path: '/admin', label: '管理', icon: 'admin' }] : [])];
  const itemWidth = `${100 / destinations.length}%`;
  return <div className="d-md-none mobile-main-nav" aria-label="主导航">
    {destinations.map(item => {
      const Icon = item.icon === 'admin' ? FaShieldAlt : icons[item.icon];
      const active = location.pathname === item.path;
      return <Link key={item.path} to={item.requireAuth && !currentUser ? '/login' : item.path} aria-current={active ? 'page' : undefined} className={`mobile-main-nav-item ${active ? 'active' : ''}`} style={{ width: itemWidth }}>
        <Icon aria-hidden="true" /><span>{item.label}</span>
      </Link>;
    })}
  </div>;
}

import React from 'react';
import { Link } from 'react-router-dom';

export default function SectionNav({ label, items, active }) {
  return <nav className="d-flex flex-wrap gap-2 mb-4" aria-label={label}>{items.map(([key, text, href]) =>
    <Link key={key} className={`btn ${active === key ? 'btn-success' : 'btn-outline-secondary'}`} aria-current={active === key ? 'page' : undefined} to={href}>{text}</Link>
  )}</nav>;
}

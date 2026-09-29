import React from 'react';
import { Link, useLocation } from 'react-router-dom';

// Prefill a question only. Account data remains subject to the chat's explicit consent.
export default function CoachHelp({ prompt = '请帮我梳理一个理财问题。', label = '请教练帮我梳理' }) {
  const location = useLocation();
  return <Link className="btn btn-outline-success btn-sm" to="/coach" state={{ prompt, returnTo: location.pathname + location.search }}>{label}</Link>;
}

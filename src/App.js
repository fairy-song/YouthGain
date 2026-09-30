import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { checkHealth } from './services/api';

// 导入样式
import './mobile-styles.css'; // 添加移动端样式

// 页面组件
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Learning from './pages/Learning';
import Profile from './pages/Profile';
import Assessment from './pages/Assessment';
import CoachChat from './pages/CoachChat';
import AdminDashboard from './pages/AdminDashboard';
import AdminOrb from './pages/AdminOrb';
import NotFound from './pages/NotFound';
import Onboarding from './pages/Onboarding';
import { getLearningProfile } from './services/learning';

// 信息页面组件
import { 
  TeamPage, 
  ContactPage, 
  HistoryPage, 
  KnowledgePage, 
  FAQPage, 
  TutorialPage, 
  LegalPage 
} from './pages/info';

// 布局组件
import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';

// API连接状态组件
const ApiStatusIndicator = () => {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const check = () => checkHealth().then(() => { if (active) setFailed(false); }).catch(() => { if (active) setFailed(true); });
    check();
    const timer = setInterval(check, 30000);
    window.addEventListener('focus', check);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', check); };
  }, []);
  return failed ? <div role="status" className="alert alert-warning m-3">暂时无法连接服务，保存操作可能失败。连接恢复后此提示会自动消失。</div> : null;
};

// 受保护的路由组件
const ProtectedRoute = ({ children }) => {
  const { currentUser, loading, initializing } = useAuth();
  
  // initializing: 首次挂载时正在恢复登录状态（Firebase 异步），此时不能判定未登录
  if (loading || initializing) {
    return <div className="flex justify-center items-center h-screen">加载中...</div>;
  }
  
  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  
  return <React.Fragment key={currentUser.uid}>{children}</React.Fragment>;
};

const OnboardingRoute = ({ children }) => {
  const { currentUser, loading, initializing } = useAuth();
  const userId = currentUser?.uid;
  const [checking, setChecking] = useState(true);
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    if (!userId) return;
    const localDone = currentUser?.email && localStorage.getItem(`onboarding_complete:${currentUser.email.toLowerCase()}`) === 'true';
    if (localDone) { setComplete(true); setChecking(false); return; }
    getLearningProfile().then(profile => setComplete(profile?.onboarding_complete === true)).catch(() => setComplete(false)).finally(() => setChecking(false));
  }, [userId]);
  if (loading || initializing || checking) return <div className="flex justify-center items-center h-screen">准备你的理财空间…</div>;
  if (!currentUser) return <Navigate to="/login" replace />;
  return complete ? children : <Navigate to="/onboarding" replace />;
};

// 管理员专属路由，等待角色恢复后再判断权限。
const AdminRoute = ({ children }) => {
  const { currentUser, isAdmin, loading, initializing } = useAuth();

  if (loading || initializing) {
    return <div className="flex justify-center items-center h-screen">加载中...</div>;
  }

  if (!currentUser) {
    return <Navigate to="/admin/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  return <React.Fragment key={currentUser.uid}>{children}</React.Fragment>;
};

// 重定向组件 - 处理各种路径情况
const RedirectHandler = () => {
  const location = useLocation();
  
  useEffect(() => {
    // 当访问根路径且没有使用hash路由格式时重定向
    if (location.pathname === '/' && !location.hash) {
      window.location.replace('/#/');
    }
  }, [location]);
  
  return null;
};

function App() {
  return (
    <AuthProvider>
      <RedirectHandler />
      <Routes>
        {/* 重定向YouthGain路径到主页 */}
        <Route path="/YouthGain/*" element={<Navigate to="/" replace />} />
        <Route path="YouthGain/*" element={<Navigate to="/" replace />} />
        
        <Route path="/admin/login" element={<main className="admin-login"><Login key="admin" adminMode /></main>} />
        <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route index element={<AdminOrb />} />
          <Route path="stats" element={<AdminDashboard />} />
          <Route path="users" element={<AdminDashboard section="users" />} />
          <Route path="knowledge" element={<AdminDashboard section="kb" />} />
          <Route path="coach" element={<AdminDashboard section="coach" />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>

        {/* 公共路由 */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          
          {/* 受保护的路由 */}
          <Route path="dashboard" element={
            <OnboardingRoute>
              <Dashboard />
            </OnboardingRoute>
          } />
          <Route path="onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
          <Route path="learning" element={<ProtectedRoute><Learning /></ProtectedRoute>} />
          <Route path="profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="assessment" element={
            <ProtectedRoute>
              <Assessment />
            </ProtectedRoute>
          } />
          <Route path="coach" element={
            <ProtectedRoute>
              <CoachChat />
            </ProtectedRoute>
          } />
          {/* 信息页面路由 */}
          <Route path="info/team" element={<TeamPage />} />
          <Route path="info/contact" element={<ContactPage />} />
          <Route path="info/history" element={<HistoryPage />} />
          <Route path="info/knowledge" element={<KnowledgePage />} />
          <Route path="info/faq" element={<FAQPage />} />
          <Route path="info/tutorial" element={<TutorialPage />} />
          <Route path="info/legal" element={<LegalPage />} />
          
          {/* 404页面 */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      
      {/* API连接状态指示器 */}
      <ApiStatusIndicator />
    </AuthProvider>
  );
}

export default App; 

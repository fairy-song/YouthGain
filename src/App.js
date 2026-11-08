import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { checkHealth } from './services/api';

// 导入样式
import './mobile-styles.css'; // 添加移动端样式

// 页面组件
import TodayHome from './pages/TodayHome';
import ProductGuide from './pages/ProductGuide';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Learning from './pages/Learning';
import Profile from './pages/Profile';
import Assessment from './pages/Assessment';
import CoachChat from './pages/CoachChat';
import AdminDashboard from './pages/AdminDashboard';
import PodcastAdmin from './pages/PodcastAdmin';
import NotFound from './pages/NotFound';
import Onboarding from './pages/Onboarding';
import FirstVisit, { TryLivingFunds, Welcome } from './pages/FirstVisit';
import OnboardingComplete from './pages/OnboardingComplete';
import SchoolResearch from './pages/SchoolResearch';
import { SchoolWorkspace, SchoolReportDemo } from './pages/SchoolAccess';
import ResearchParticipation from './pages/ResearchParticipation';

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
  const { pathname } = useLocation();
  if (['/try', '/start', '/guide', '/research/demo'].includes(pathname)) return null;
  return <ApiHealthWarning />;
};

const ApiHealthWarning = () => {
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
const workspaceLogin = { student: '/login', school: '/research/login', admin: '/admin/login' };

const ProtectedRoute = ({ children, workspace = 'student' }) => {
  const { currentUser, workspace: activeWorkspace, isAdmin, loading, initializing } = useAuth();
  const location = useLocation();
  
  // initializing: 首次挂载时正在恢复登录状态（Firebase 异步），此时不能判定未登录
  if (loading || initializing) {
    return <div className="flex justify-center items-center h-screen">加载中...</div>;
  }
  
  if (!currentUser || activeWorkspace !== workspace || (workspace === 'admin' ? !isAdmin : isAdmin)) {
    return <Navigate to={workspaceLogin[workspace]} replace state={{ from: location.pathname + location.search }} />;
  }
  
  return <React.Fragment key={currentUser.uid}>{children}</React.Fragment>;
};

const HomeEntry = () => {
  const { currentUser, workspace, loading, initializing } = useAuth();
  if (loading || initializing) return <div className="flex justify-center items-center h-screen">加载中...</div>;
  return workspace === 'student' ? <TodayHome key={currentUser.uid} /> : <Welcome />;
};

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* 重定向YouthGain路径到主页 */}
        <Route path="/YouthGain/*" element={<Navigate to="/" replace />} />
        <Route path="YouthGain/*" element={<Navigate to="/" replace />} />
        
        <Route path="/login" element={<Login key="student" />} />
        <Route path="/register" element={<Register key="student" />} />
        <Route path="/try" element={<TryLivingFunds />} />
        <Route path="/guide" element={<ProductGuide />} />
        <Route path="/admin/login" element={<main className="admin-login"><Login key="admin" adminMode /></main>} />
        <Route path="/research" element={<SchoolWorkspace />}>
          <Route index element={<ProtectedRoute workspace="school"><SchoolResearch /></ProtectedRoute>} />
          <Route path="login" element={<Login key="school" schoolMode />} />
          <Route path="register" element={<Register key="school" schoolMode />} />
          <Route path="demo" element={<SchoolReportDemo />} />
        </Route>
        <Route path="/admin" element={<ProtectedRoute workspace="admin"><AdminLayout /></ProtectedRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="stats" element={<AdminDashboard />} />
          <Route path="users" element={<AdminDashboard section="users" />} />
          <Route path="knowledge" element={<AdminDashboard section="kb" />} />
          <Route path="coach" element={<AdminDashboard section="coach" />} />
          <Route path="podcasts" element={<PodcastAdmin />} />
          <Route path="research" element={<SchoolResearch managementMode />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>

        {/* 公共路由 */}
        <Route path="/" element={<Layout />}>
          <Route index element={<HomeEntry />} />
          <Route path="start" element={<FirstVisit />} />
          
          {/* 受保护的路由 */}
          <Route path="dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
          <Route path="onboarding/complete" element={<ProtectedRoute><OnboardingComplete /></ProtectedRoute>} />
          <Route path="learning" element={<ProtectedRoute><Learning /></ProtectedRoute>} />
          <Route path="profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="research/participation" element={<Navigate to="/profile/research" replace />} />
          <Route path="profile/research" element={<ProtectedRoute><ResearchParticipation /></ProtectedRoute>} />
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

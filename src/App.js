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
import Assessment from './pages/Assessment';
import CoachChat from './pages/CoachChat';
import AdminDashboard from './pages/AdminDashboard';
import NotFound from './pages/NotFound';

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

// 管理员专属路由：未登录跳登录页，普通用户跳个人中心
const AdminRoute = ({ children }) => {
  const { currentUser, isAdmin, loading, initializing } = useAuth();

  if (loading || initializing) {
    return <div className="flex justify-center items-center h-screen">加载中...</div>;
  }

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" />;
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
        
        {/* 公共路由 */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          
          {/* 受保护的路由 */}
          <Route path="dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="learning" element={<ProtectedRoute><Learning /></ProtectedRoute>} />
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
          <Route path="admin" element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
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

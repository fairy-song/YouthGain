import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, getIdToken } from 'firebase/auth';
import { app } from '../services/firebase';
import { fetchMyRole } from '../services/api';

// 创建认证上下文
const AuthContext = createContext();

// 自定义hook用于在组件中使用认证上下文
export function useAuth() {
  return useContext(AuthContext);
}

// Firebase 是否已配置（.env.local 中填写 REACT_APP_FIREBASE_* 后自动启用真实认证）。
// 未配置时回退到本地开发模式（localStorage 模拟），保证本地开发不被阻塞。
const FIREBASE_ENABLED = Boolean(app);

// 把 Firebase 常见错误码翻译成用户能看懂的中文
function translateFirebaseError(code) {
  const messages = {
    'auth/email-already-in-use': '该邮箱已被注册，请直接登录',
    'auth/invalid-email': '邮箱格式不正确',
    'auth/weak-password': '密码太弱，至少需要 6 位',
    'auth/user-not-found': '该账号不存在，请先注册',
    'auth/wrong-password': '密码错误',
    'auth/invalid-credential': '邮箱或密码错误',
    'auth/too-many-requests': '尝试次数过多，请稍后再试',
    'auth/network-request-failed': '网络异常，请检查网络后重试',
  };
  return messages[code] || '请稍后重试';
}

// 认证提供者组件
export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // 当前登录用户是否为管理员。角色由后端 /api/auth/me 权威判定
  // （后端按 ADMIN_EMAILS 配置；DEV_MODE 下固定返回 admin）。
  const [isAdmin, setIsAdmin] = useState(false);
  // 首次挂载时正在恢复登录状态（Firebase 模式下 onAuthStateChanged 是异步的），
  // 保护路由需要等待它结束，否则会误把已登录用户重定向到登录页。
  const [initializing, setInitializing] = useState(true);

  // Firebase 认证实例：未配置时为 null（开发模式）
  const auth = FIREBASE_ENABLED ? getAuth(app) : null;

  // 从后端查询用户角色并写入 isAdmin。
  // - 生产（Firebase）：按后端 ADMIN_EMAILS 判定
  // - 开发模式：携带 X-Dev-Email 模拟登录邮箱，后端同样按 ADMIN_EMAILS 判定，
  //   使本地开发也模拟"专用管理员账号"（只有 admin@youthgain.com 才是管理员）
  // 后端不可达时保守按普通用户处理（无法确认管理员身份就不给权限）。
  const resolveAdminRole = useCallback(async (email = '') => {
    try {
      const headers = FIREBASE_ENABLED ? {} : { 'X-Dev-Email': email };
      const data = await fetchMyRole(headers);
      return data && data.role === 'admin';
    } catch (e) {
      console.warn('获取用户角色失败，按普通用户处理:', e);
      return false;
    }
  }, []);

  // 登录状态监听：Firebase 模式下同步登录/登出，并把 ID token 写入 localStorage，
  // api.js 的 axios 拦截器会自动以 "Bearer <token>" 形式携带，后端 require_auth 据此鉴权。
  useEffect(() => {
    if (!auth) {
      // 开发模式：先尝试恢复 localStorage 中保存的模拟用户
      let devEmail = '';
      try {
        const storedUser = localStorage.getItem('dev_current_user');
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          setCurrentUser(parsed);
          devEmail = parsed.email || '';
          const storedProfile = localStorage.getItem('dev_user_profile');
          if (storedProfile) setUserProfile(JSON.parse(storedProfile));
        }
      } catch (e) {
        console.error('恢复开发模式登录态失败:', e);
      }
      // 开发模式也按后端角色判定（模拟专用管理员账号）
      resolveAdminRole(devEmail).then(setIsAdmin);
      setInitializing(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || (user.email || '').split('@')[0],
        });
        try {
          const token = await getIdToken(user);
          localStorage.setItem('authToken', token);
          const admin = await resolveAdminRole();
          setIsAdmin(admin);
        } catch (e) {
          console.error('获取 Firebase token 失败:', e);
          setIsAdmin(false);
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
        setIsAdmin(false);
        localStorage.removeItem('authToken');
      }
      setInitializing(false);
    });

    return unsubscribe;
  }, [auth, resolveAdminRole]);

  // 注册新用户
  async function signup(email, password) {
    try {
      setError('');
      setLoading(true);

      if (!auth) {
        // 开发模式模拟注册
        const mockUser = {
          uid: 'dev-user-' + Math.random().toString(36).substring(2, 9),
          email: email,
          displayName: email.split('@')[0],
        };

        setCurrentUser(mockUser);

        // 模拟创建用户资料
        const mockProfile = {
          userId: mockUser.uid,
          name: mockUser.displayName,
          email: mockUser.email,
          createdAt: new Date().toISOString(),
        };

        setUserProfile(mockProfile);

        // 存储到localStorage模拟持久化
        localStorage.setItem('dev_current_user', JSON.stringify(mockUser));
        localStorage.setItem('dev_user_profile', JSON.stringify(mockProfile));

        // 开发模式按实际登录邮箱判定角色（模拟专用管理员账号）
        const admin = await resolveAdminRole(email);
        setIsAdmin(admin);
        setLoading(false);
        return { user: mockUser, role: admin ? 'admin' : 'user' };
      }

      // 真实 Firebase 注册；登录态由 onAuthStateChanged 自动同步
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const token = await getIdToken(userCredential.user);
      localStorage.setItem('authToken', token);
      const admin = await resolveAdminRole();
      setIsAdmin(admin);
      setLoading(false);
      return {
        user: {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          displayName: userCredential.user.displayName || email.split('@')[0],
        },
        role: admin ? 'admin' : 'user',
      };
    } catch (err) {
      setLoading(false);
      setError('注册失败：' + (err.code ? translateFirebaseError(err.code) : err.message));
      throw err;
    }
  }

  // 用户登录
  async function login(email, password) {
    try {
      setError('');
      setLoading(true);

      if (!auth) {
        // 开发模式模拟登录
        const mockUser = {
          uid: 'dev-user-' + Math.random().toString(36).substring(2, 9),
          email: email,
          displayName: email.split('@')[0],
        };

        setCurrentUser(mockUser);

        // 模拟用户资料
        const mockProfile = {
          userId: mockUser.uid,
          name: mockUser.displayName,
          email: mockUser.email,
          createdAt: new Date().toISOString(),
        };

        setUserProfile(mockProfile);

        // 存储到localStorage模拟持久化
        localStorage.setItem('dev_current_user', JSON.stringify(mockUser));
        localStorage.setItem('dev_user_profile', JSON.stringify(mockProfile));

        // 开发模式按实际登录邮箱判定角色（模拟专用管理员账号）
        const admin = await resolveAdminRole(email);
        setIsAdmin(admin);
        setLoading(false);
        return { user: mockUser, role: admin ? 'admin' : 'user' };
      }

      // 真实 Firebase 登录；登录态由 onAuthStateChanged 自动同步
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const token = await getIdToken(userCredential.user);
      localStorage.setItem('authToken', token);
      const admin = await resolveAdminRole();
      setIsAdmin(admin);
      setLoading(false);
      return {
        user: {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          displayName: userCredential.user.displayName || email.split('@')[0],
        },
        role: admin ? 'admin' : 'user',
      };
    } catch (err) {
      setLoading(false);
      setError('登录失败：' + (err.code ? translateFirebaseError(err.code) : err.message));
      throw err;
    }
  }

  // 用户登出
  async function logout() {
    try {
      setError('');
      setLoading(true);

      if (auth) {
        await signOut(auth);
      }

      setCurrentUser(null);
      setUserProfile(null);
      setIsAdmin(false);

      // 清除localStorage中的数据
      localStorage.removeItem('dev_current_user');
      localStorage.removeItem('dev_user_profile');
      localStorage.removeItem('authToken');
      setLoading(false);
    } catch (err) {
      setLoading(false);
      setError('登出失败：' + err.message);
      throw err;
    }
  }

  // 获取用户资料
  const fetchUserProfile = useCallback(async () => {
    if (!currentUser) return;

    try {
      setLoading(true);
      if (auth) {
        // Firebase 模式下直接用当前登录用户信息作为基础资料
        setUserProfile(currentUser);
        setLoading(false);
        return currentUser;
      }
      // 开发模式：从localStorage获取用户资料
      const storedProfile = localStorage.getItem('dev_user_profile');
      if (storedProfile) {
        const profileData = JSON.parse(storedProfile);
        setUserProfile(profileData);
        setLoading(false);
        return profileData;
      }
      setLoading(false);
      return null;
    } catch (err) {
      console.error('获取用户资料失败:', err);
      setError('获取用户资料失败');
      setLoading(false);
    }
  }, [currentUser, auth]);

  const value = {
    currentUser,
    userProfile,
    loading,
    error,
    initializing,
    isAdmin,
    signup,
    register: signup, // 添加register别名
    login,
    logout,
    fetchUserProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

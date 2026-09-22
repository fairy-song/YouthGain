import { initializeApp } from 'firebase/app';

// Firebase配置 (这些值应该从环境变量中获取)
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// 只有配置了 apiKey + projectId 时才初始化 Firebase。
// 未配置时返回 null，前端认证回退到本地开发模式（localStorage 模拟），
// 避免 initializeApp 收到空配置直接抛错导致整个应用白屏。
const hasFirebaseConfig = Boolean(
  process.env.REACT_APP_FIREBASE_API_KEY && process.env.REACT_APP_FIREBASE_PROJECT_ID
);

export const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
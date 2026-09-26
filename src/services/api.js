import axios from 'axios';

// 这里是API服务模块，用于处理与后端的通信

// 检查是否在GitHub Pages环境
const isGitHubPages = window.location.hostname === 'fairy-song.github.io';

// 默认的API基础URL
//
// 注意：本地开发一律写 127.0.0.1 而不是 localhost。
// Windows 上 localhost 会优先解析为 IPv6 的 ::1，而后端监听在 IPv4 的 0.0.0.0，
// 每次都先连接超时再回退，实测使每个请求多花约 2 秒（127.0.0.1 只要 5 毫秒）。
const API_BASE_URL = process.env.REACT_APP_API_URL ||
                    (isGitHubPages ?
                     'https://你的API服务器地址' : 'http://127.0.0.1:5001/api');

// 创建axios实例
const api = axios.create({
  timeout: 30000,
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});
export const authenticatedApi = api;

// 请求拦截器 - 添加认证令牌
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    // 开发模式（未配置 Firebase）下，自动携带登录邮箱头，
    // 后端据此按 ADMIN_EMAILS 判定管理员/普通用户角色
    if (!process.env.REACT_APP_FIREBASE_API_KEY) {
      try {
        const raw = localStorage.getItem('dev_current_user');
        if (raw) {
          const devUser = JSON.parse(raw);
          if (devUser && devUser.email) {
            config.headers['X-Dev-Email'] = devUser.email;
          }
        }
      } catch (e) {
        // 本地存储解析失败时忽略，不带头则后端按普通用户处理
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理错误
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // 处理401错误 (未认证)
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('authToken');
      // 可以在这里添加重定向到登录页的逻辑
    }
    return Promise.reject(error);
  }
);

// 示例：注册用户
export const registerUser = async (userData) => {
  try {
    const response = await api.post('/auth/register', userData);
    return response.data;
  } catch (error) {
    console.error('注册失败:', error);
    throw error;
  }
};

// 示例：用户登录
export const loginUser = async (email, password) => {
  try {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  } catch (error) {
    console.error('登录失败:', error);
    throw error;
  }
};

// 提交问卷结果
export const submitAssessment = async (userId, assessmentData) => {
  try {
    const response = await api.post(`/assessments/${userId}`, { 
      assessmentData 
    });
    return response.data;
  } catch (error) {
    console.error('提交问卷失败:', error);
    throw error;
  }
};

// 用户信息相关
export const fetchUserProfile = async (userId) => {
  try {
    const response = await api.get(`/users/${userId}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 评估相关
export const fetchAssessmentResults = async (userId) => {
  try {
    const response = await api.get(`/assessments/${userId}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * 向AI教练发送消息并获取回复
 * @param {object} data - 包含消息内容、用户ID、聊天历史和评估结果的对象
 * @returns {Promise} 返回AI回复
 */
export const sendMessageToCoach = async (data) => {
  const response = await api.post('/coach/chat', data, { timeout: 60000 });
  if (response.data.status !== 'success') throw new Error(response.data.message || '教练暂时无法回复');
  return { reply: response.data.reply };
};

// 系统健康检查
export const checkHealth = async () => {
  try {
    const response = await api.get('/health');
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Dashboard API
export const getDashboardOverview = async () => {
  try {
    const response = await api.get('/dashboard/overview');
    return response.data;
  } catch (error) {
    console.error('获取Dashboard概览失败:', error);
    throw error;
  }
};

export const getFinancialHealth = async () => {
  try {
    const response = await api.get('/dashboard/financial-health');
    return response.data;
  } catch (error) {
    console.error('获取财务健康度失败:', error);
    throw error;
  }
};

export const getUserGoals = async (status = null) => {
  try {
    const params = status ? { status } : {};
    const response = await api.get('/dashboard/goals', { params });
    return response.data;
  } catch (error) {
    console.error('获取用户目标失败:', error);
    throw error;
  }
};

export const createGoal = async (goalData) => {
  try {
    const response = await api.post('/dashboard/goals', goalData);
    return response.data;
  } catch (error) {
    console.error('创建目标失败:', error);
    throw error;
  }
};

export const updateGoal = async (goalId, updates) => {
  try {
    const response = await api.put(`/dashboard/goals/${goalId}`, updates);
    return response.data;
  } catch (error) {
    console.error('更新目标失败:', error);
    throw error;
  }
};

export const deleteGoal = async (goalId) => {
  try {
    const response = await api.delete(`/dashboard/goals/${goalId}`);
    return response.data;
  } catch (error) {
    console.error('删除目标失败:', error);
    throw error;
  }
};

export const getRecommendations = async () => {
  try {
    const response = await api.get('/dashboard/recommendations');
    return response.data;
  } catch (error) {
    console.error('获取建议失败:', error);
    throw error;
  }
};

// Assessment API (新增)
export const submitAssessmentNew = async (assessmentData) => {
  try {
    const response = await api.post('/assessment/submit', { assessment: assessmentData });
    return response.data;
  } catch (error) {
    console.error('提交评估失败:', error);
    throw error;
  }
};

export const getLatestAssessment = async () => {
  try {
    const response = await api.get('/assessment/latest');
    return response.data;
  } catch (error) {
    console.error('获取最新评估失败:', error);
    throw error;
  }
};

export const getAssessmentHistory = async () => {
  try {
    const response = await api.get('/assessment/history');
    return response.data;
  } catch (error) {
    console.error('获取评估历史失败:', error);
    throw error;
  }
};

// ============================================================
// Decision APIs —— 决策引擎
// 所有数值由后端 decision_engine 以纯函数算出，前端只做展示，不参与计算
// ============================================================

/**
 * 获取完整决策报告。
 * @param {Object} params
 * @param {number} [params.monthlyIncome] 月收入（元），默认 2000
 * @param {number} [params.incomeDay] 每月发生活费的日子（1-31）
 * @returns {Object} { has_data, transaction_count, report, warnings }
 */
export const getDecisionReport = async ({ monthlyIncome, incomeDay } = {}) => {
  try {
    const params = {};
    if (monthlyIncome !== undefined) params.monthly_income = monthlyIncome;
    if (incomeDay !== undefined) params.income_day = incomeDay;

    const response = await api.get('/decision/report', { params });
    return response.data.data;
  } catch (error) {
    console.error('获取决策报告失败:', error);
    throw error;
  }
};

/**
 * 计算单笔消费的机会成本——用于记录当下的即时反馈。
 * @param {number} amount 消费金额
 * @param {number} [monthlyIncome] 月收入
 * @returns {Object} { amount, delay_days, surplus_ratio, message }
 * @throws 用户入不敷出时后端返回 409，此处会抛出 error.response.data
 */
export const getOpportunityCost = async (amount, monthlyIncome) => {
  try {
    const body = { amount };
    if (monthlyIncome !== undefined) body.monthly_income = monthlyIncome;

    const response = await api.post('/decision/opportunity-cost', body);
    return response.data.data;
  } catch (error) {
    console.error('计算机会成本失败:', error);
    throw error;
  }
};

/** 获取当前用户的每日记账打卡统计。 */
export const getCheckin = async () => {
  const response = await api.get('/decision/checkin');
  return response.data.data;
};

/** 获取消费记录列表（按消费日期倒序）。 */
export const listTransactions = async (limit = 200) => {
  try {
    const response = await api.get('/decision/transactions', { params: { limit } });
    return response.data.data;
  } catch (error) {
    console.error('获取消费记录失败:', error);
    throw error;
  }
};

/**
 * 新增一笔消费记录。
 * @param {Object} data 必填 amount / category / date(YYYY-MM-DD)，可选 merchant / note / hour
 */
export const createTransaction = async (data) => {
  try {
    const response = await api.post('/decision/transactions', data);
    window.dispatchEvent(new Event('transaction-saved'));
    return response.data.data;
  } catch (error) {
    console.error('保存消费记录失败:', error);
    throw error;
  }
};

/** 删除一笔消费记录。 */
export const deleteTransaction = async (transactionId) => {
  try {
    const response = await api.delete(`/decision/transactions/${transactionId}`);
    return response.data;
  } catch (error) {
    console.error('删除消费记录失败:', error);
    throw error;
  }
};

/**
 * 提交事后回访结果——"这笔消费，现在回头看值吗"。
 * 后悔率是行为改变最强的预测因子之一，也是「后悔集中」模式识别的输入。
 */
export const submitRegret = async (transactionId, regret) => {
  try {
    const response = await api.put(`/decision/transactions/${transactionId}/regret`, { regret });
    return response.data;
  } catch (error) {
    console.error('提交回访结果失败:', error);
    throw error;
  }
};

/**
 * 单笔消费智能评估（语音记账第三步的数据源）。
 * 后端读取预算/结余/储蓄目标/历史同类消费，输出合理性判断、储蓄影响与干预话术。
 * @param {Object} data 必填 amount / category，可选 merchant / note / monthly_income
 * @returns {Object} { budget, surplus, goal, similar, necessity, suggestion, tip }
 */
export const assessPurchase = async (data) => {
  try {
    const response = await api.post('/decision/assess', data);
    return response.data.data;
  } catch (error) {
    console.error('AI消费评估失败:', error);
    throw error;
  }
};

/**
 * 语音转文字：把录音的 PCM 音频(base64)交给后端，后端调讯飞识别。
 * @param {string} audioB64 16k 16bit 单声道 PCM 的 base64
 * @returns {string} 识别出的中文文本
 */
export const transcribeAudio = async (audioB64) => {
  try {
    const response = await api.post('/asr/transcribe', { audio_b64: audioB64 });
    return response.data.data.text;
  } catch (error) {
    console.error('语音识别失败:', error);
    throw error;
  }
};

// ============================================================
// Auth / 角色
// ============================================================

/**
 * 获取当前登录用户的角色（admin / user）。
 * 后端根据 ADMIN_EMAILS 配置判定；开发模式下按 X-Dev-Email 模拟登录邮箱判定。
 * @param {object} [extraHeaders] 附加请求头（开发模式传 { 'X-Dev-Email': email }）
 * @returns {Promise<{user: object, role: string, uid: string, email: string}>}
 */
export const fetchMyRole = async (extraHeaders = {}) => {
  const response = await api.get('/auth/me', { headers: extraHeaders });
  return response.data;
};

// ============================================================
// Admin APIs —— 管理员系统（需要管理员角色）
// ============================================================

/** 用户列表 [{uid, profile, disabled}] */
export const adminListUsers = async () => {
  const response = await api.get('/admin/users');
  return response.data.data;
};

/** 用户详情 {uid, profile, disabled, data_summary} */
export const adminGetUser = async (uid) => {
  const response = await api.get(`/admin/users/${encodeURIComponent(uid)}`);
  return response.data.data;
};

/** 停用/启用用户（disabled: bool） */
export const adminSetUserStatus = async (uid, disabled) => {
  const response = await api.put(`/admin/users/${encodeURIComponent(uid)}/status`, { disabled });
  return response.data;
};

/** 删除用户 */
export const adminDeleteUser = async (uid) => {
  const response = await api.delete(`/admin/users/${encodeURIComponent(uid)}`);
  return response.data;
};

/** 平台统计 {total_users, assessment_completed_users, ...} */
export const adminGetStats = async () => {
  const response = await api.get('/admin/stats');
  return response.data.data;
};

/** 知识库文章列表 */
export const adminListKbArticles = async () => {
  const response = await api.get('/admin/kb');
  return response.data.data;
};

/** 新增知识库文章 */
export const adminCreateKbArticle = async (articleData) => {
  const response = await api.post('/admin/kb', articleData);
  return response.data;
};

/** 更新知识库文章 */
export const adminUpdateKbArticle = async (articleId, articleData) => {
  const response = await api.put(`/admin/kb/${encodeURIComponent(articleId)}`, articleData);
  return response.data;
};

/** 删除知识库文章 */
export const adminDeleteKbArticle = async (articleId) => {
  const response = await api.delete(`/admin/kb/${encodeURIComponent(articleId)}`);
  return response.data;
};

// 导出API服务
const apiService = {
  loginUser,
  registerUser,
  fetchUserProfile,
  fetchAssessmentResults,
  submitAssessment,
  sendMessageToCoach,
  checkHealth,
  // Dashboard APIs
  getDashboardOverview,
  getFinancialHealth,
  getUserGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  getRecommendations,
  // Assessment APIs
  submitAssessmentNew,
  getLatestAssessment,
  getAssessmentHistory,
  // Decision APIs
  getDecisionReport,
  getOpportunityCost,
  listTransactions,
  createTransaction,
  deleteTransaction,
  submitRegret,
  assessPurchase,
  transcribeAudio,
  // Auth / 角色
  fetchMyRole,
  // Admin APIs
  adminListUsers,
  adminGetUser,
  adminSetUserStatus,
  adminDeleteUser,
  adminGetStats,
  adminListKbArticles,
  adminCreateKbArticle,
  adminUpdateKbArticle,
  adminDeleteKbArticle
};

export default apiService;

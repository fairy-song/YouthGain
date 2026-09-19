import axios from 'axios';

// 这里是API服务模块，用于处理与后端的通信

// 检查是否在GitHub Pages环境
const isGitHubPages = window.location.hostname === 'xiaocow666.github.io';

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
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 添加认证令牌
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
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

// 通用请求函数
async function fetchApi(endpoint, options = {}) {
  // 根据环境选择API基础URL
  let baseUrl;
  
  // 在GitHub Pages环境中使用外部API服务
  if (isGitHubPages) {
    baseUrl = 'https://你的API服务器地址';  // 替换为你的实际API服务地址
    // 注意: 外部API服务需要配置CORS允许GitHub Pages域名访问
  } else if (process.env.NODE_ENV === 'production') {
    baseUrl = '';  // 在其他生产环境中使用相对路径
  } else {
    baseUrl = 'http://127.0.0.1:5001';  // 开发环境
  }
  
  // 确保endpoint格式正确
  const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}/api${formattedEndpoint}`;
  
  // 默认配置
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
    },
    // 添加跨域支持
    credentials: 'include',
    mode: 'cors',
  };
  
  // 合并配置
  const fetchOptions = {
    ...defaultOptions,
    ...options,
  };
  
  console.log(`正在请求API: ${url}`, options.method || 'GET');
  
  try {
    const response = await fetch(url, fetchOptions);
    
    // 非2xx状态码
    if (!response.ok) {
      console.error(`API错误: ${response.status}`, response);
      // 尝试解析错误响应
      let errorMessage;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || `请求失败，状态码: ${response.status}`;
      } catch (e) {
        errorMessage = `请求失败，状态码: ${response.status}`;
      }
      throw new Error(errorMessage);
    }
    
    // 尝试解析JSON响应
    try {
    const data = await response.json();
    console.log(`API响应:`, data);
    return data;
    } catch (e) {
      // 处理非JSON响应
      console.log('API响应不是JSON格式');
      return { status: 'success', message: '请求成功但返回非JSON格式' };
    }
  } catch (error) {
    console.error('API请求错误:', error);
    // 友好错误信息
    if (error.message === 'Failed to fetch') {
      console.error('无法连接到服务器，请确认后端服务已启动');
      error.message = '无法连接到服务器，请确认后端服务已启动';
    }
    throw error;
  }
}

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
  try {
    // 使用通用请求函数来处理请求
    console.log('发送消息到AI教练:', data);
    
    // 根据环境选择正确的 API 基础 URL
    let baseUrl;
    if (isGitHubPages) {
      baseUrl = process.env.REACT_APP_API_URL || 'https://你的API服务器地址';
    } else if (process.env.NODE_ENV === 'production') {
      baseUrl = process.env.REACT_APP_API_URL || '';
    } else {
      baseUrl = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5001';
    }
    
    const url = `${baseUrl}/api/coach/chat`;
    console.log('请求 URL:', url);
    
    // 发送请求
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI教练响应错误:', response.status, errorText);
      throw new Error(`服务器响应错误: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('AI教练响应:', result);
    
    if (result.status === 'success') {
      return { reply: result.reply };
    } else {
      throw new Error(result.message || '获取回复失败');
    }
  } catch (error) {
    console.error('AI教练请求错误:', error);
    // 提供更友好的错误信息
    if (error.message.includes('无法连接到服务器') || error.message === 'Failed to fetch') {
      throw new Error('无法连接到AI教练服务，请确认后端服务已启动');
    } else {
      throw new Error(`AI教练回复错误: ${error.message}`);
    }
  }
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
  submitRegret
};

export default apiService;
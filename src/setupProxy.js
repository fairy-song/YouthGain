const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // API 代理
  //
  // 注意：这里**不能**写成 app.use('/api', createProxyMiddleware(...))。
  // Express 的挂载路径会把 req.url 的 '/api' 前缀剥掉，而 http-proxy-middleware v3
  // 不会再把它补回来，结果是后端收到 /health 而不是 /api/health，全部 404。
  // 用 pathFilter 做匹配，路径保持完整转发。
  app.use(
    createProxyMiddleware({
      pathFilter: '/api',
      target: 'http://127.0.0.1:5001',
      changeOrigin: true,
      logLevel: 'warn',
    })
  );

  // 允许所有源的跨域请求
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

    // 处理预检请求
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // 处理 /YouthGain 子路径的重定向（GitHub Pages 部署遗留）
    if (req.path === '/YouthGain' || req.path.startsWith('/YouthGain/')) {
      return res.redirect('/#/');
    }

    next();
  });
};

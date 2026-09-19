/**
 * 青盈应用代理服务器
 * 提供API代理和静态文件托管
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const fs = require('fs');

// 获取命令行参数
const args = process.argv.slice(2);
const FRONTEND_PORT = args[0] || 3000;
const BACKEND_PORT = args[1] || 5001;
const BACKEND_API = `http://localhost:${BACKEND_PORT}`;

// 创建Express应用
const app = express();

// API代理配置
const apiProxy = createProxyMiddleware('/api', {
  target: BACKEND_API,
  changeOrigin: true,
  pathRewrite: { '^/api': '/api' }
});

// 设置API代理
app.use('/api', apiProxy);

// 查找前端构建文件夹
const buildPath = path.join(__dirname, '..', '..', 'build');
const hasBuildFolder = fs.existsSync(buildPath);

if (hasBuildFolder) {
  console.log(`找到前端构建文件，将提供静态文件服务`);
  app.use(express.static(buildPath));
  
  // 对于SPA应用，将所有未匹配的路由指向index.html
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(buildPath, 'index.html'));
    }
  });
} else {
  // 创建一个简单的首页
  app.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>青盈应用 - API代理</title>
        <style>
          body {
            font-family: 'Microsoft YaHei', Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
            color: #333;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            background-color: white;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 {
            color: #1e88e5;
            border-bottom: 1px solid #eee;
            padding-bottom: 10px;
          }
          .status {
            background-color: #e8f5e9;
            border-left: 4px solid #4caf50;
            padding: 12px;
            margin: 15px 0;
          }
          .warning {
            background-color: #fff8e1;
            border-left: 4px solid #ff9800;
            padding: 12px;
            margin: 15px 0;
          }
          code {
            background-color: #f5f5f5;
            padding: 2px 5px;
            border-radius: 3px;
            font-family: Consolas, monospace;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>青盈应用 - API代理服务器</h1>
          
          <div class="status">
            <strong>状态:</strong> 代理服务器正在运行
            <p>API 请求将被转发到: <code>${BACKEND_API}</code></p>
          </div>
          
          <div class="warning">
            <strong>注意:</strong> 未找到前端构建文件。您看到的是API代理服务器的默认页面。
            <p>请运行 <code>npm run build</code> 生成前端构建文件，或确保启动脚本正确设置了工作目录。</p>
          </div>
          
          <h2>API 端点测试</h2>
          <ul>
            <li>后端状态: <span id="backend-status">检查中...</span></li>
          </ul>
          
          <script>
            // 检测后端API状态
            fetch('/api/health', { method: 'GET' })
              .then(response => response.ok ? '在线' : '离线')
              .then(status => {
                document.getElementById('backend-status').textContent = status;
                document.getElementById('backend-status').style.color = status === '在线' ? 'green' : 'red';
              })
              .catch(() => {
                document.getElementById('backend-status').textContent = '离线';
                document.getElementById('backend-status').style.color = 'red';
              });
          </script>
        </div>
      </body>
      </html>
    `);
  });
}

// 启动服务器
app.listen(FRONTEND_PORT, () => {
  console.log(`启动代理服务器，前端端口: ${FRONTEND_PORT}，后端端口: ${BACKEND_PORT}`);
  console.log('================================================');
  console.log(`  青盈应用代理服务器已启动`);
  console.log('================================================');
  console.log(`- 前端页面: http://localhost:${FRONTEND_PORT}`);
  console.log(`- 后端API: ${BACKEND_API}/api`);
  console.log('- 代理状态: 已将所有 /api 请求转发到后端服务');
  if (!hasBuildFolder) {
    console.log('[警告] 未找到前端构建文件，将只提供API代理和状态页面');
  }
  console.log(`访问 http://localhost:${FRONTEND_PORT} 开始使用应用`);
}); 
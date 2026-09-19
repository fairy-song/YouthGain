// 前后端代理服务器
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const fs = require('fs');
const app = express();

// 从命令行参数获取端口
const FRONTEND_PORT = process.argv[2] || 3000;
const BACKEND_PORT = process.argv[3] || 5001;
// React开发服务器通常运行在3000端口
const REACT_DEV_PORT = 3000;

console.log(`启动代理服务器，前端端口: ${FRONTEND_PORT}，后端端口: ${BACKEND_PORT}`);

// 解析JSON请求体
app.use(express.json());

// 配置API代理 - 简化配置，避免path-to-regexp错误
app.use('/api', createProxyMiddleware({
  target: `http://localhost:${BACKEND_PORT}`,
  changeOrigin: true,
  ws: true
}));

// 检查可能的前端路径
const rootPath = path.resolve(__dirname, '..', '..');
const buildPath = path.join(rootPath, 'build');
const publicPath = path.join(rootPath, 'public');
const srcPath = path.join(rootPath, 'src');

console.log(`[检查] 项目路径: ${rootPath}`);
console.log(`[检查] React源码: ${fs.existsSync(srcPath) ? '存在' : '不存在'}`);
console.log(`[检查] 公共目录: ${fs.existsSync(publicPath) ? '存在' : '不存在'}`);
console.log(`[检查] 构建目录: ${fs.existsSync(buildPath) ? '存在' : '不存在'}`);

// 尝试运行React开发服务器
const { spawn } = require('child_process');
let reactProcess = null;

function startReactDev() {
  console.log('[尝试] 启动React开发服务器...');
  
  try {
    reactProcess = spawn('npm', ['start'], {
      cwd: rootPath,
      shell: true,
      stdio: 'inherit'
    });
    
    reactProcess.on('error', (error) => {
      console.error(`[错误] 无法启动React开发服务器: ${error.message}`);
    });
    
    console.log('[成功] React开发服务器已启动');
    
    // 将所有非API请求转发到React开发服务器
    app.use('/', createProxyMiddleware({
      target: `http://localhost:${REACT_DEV_PORT}`,
      changeOrigin: true,
      ws: true
    }));
  } catch (err) {
    console.error(`[错误] 启动React开发服务器失败: ${err.message}`);
    showFallbackPage();
  }
}

function showFallbackPage() {
  // 如果React开发服务器无法启动，显示引导页面
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>青盈应用 - 开发模式</title>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
              h1 { color: #333; }
              .container { max-width: 800px; margin: 0 auto; }
              .info { background: #f4f4f4; padding: 20px; border-radius: 5px; }
              .success { color: green; }
              .error { color: red; margin-top: 20px; }
              .instructions { background: #f8f9fa; padding: 15px; border-left: 4px solid #007bff; margin: 20px 0; }
              code { background: #eee; padding: 2px 5px; border-radius: 3px; font-family: monospace; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>青盈应用 - 开发模式</h1>
              <div class="info">
                <p class="success">✓ 代理服务器已成功启动!</p>
                <p>所有 /api 请求已被代理到后端服务: <b>http://localhost:${BACKEND_PORT}</b></p>
                
                <div class="error">
                  <p>注意: 无法自动启动前端开发服务器</p>
                </div>
                
                <div class="instructions">
                  <h3>请手动启动React开发服务器:</h3>
                  <p>1. 打开新的命令行窗口</p>
                  <p>2. 切换到项目目录: <code>cd ${rootPath}</code></p>
                  <p>3. 执行命令: <code>npm start</code></p>
                  <p>4. 前端将在 <a href="http://localhost:${REACT_DEV_PORT}" target="_blank">http://localhost:${REACT_DEV_PORT}</a> 启动</p>
                </div>
                
                <p>项目目录情况:</p>
                <ul>
                  <li>React源码目录(src): ${fs.existsSync(srcPath) ? '✓ 存在' : '✗ 不存在'}</li>
                  <li>公共资源目录(public): ${fs.existsSync(publicPath) ? '✓ 存在' : '✗ 不存在'}</li>
                  <li>构建目录(build): ${fs.existsSync(buildPath) ? '✓ 存在' : '✗ 不存在'}</li>
                </ul>
              </div>
            </div>
          </body>
        </html>
      `);
    }
  });
}

// 启动React开发服务器
startReactDev();

// 启动代理服务器
app.listen(FRONTEND_PORT, () => {
  console.log(`
================================================
  青盈应用代理服务器已启动
================================================

- 前端开发服务器: http://localhost:${REACT_DEV_PORT}
- 后端API: http://localhost:${BACKEND_PORT}/api
- 代理状态: 已将所有 /api 请求转发到后端服务

访问 http://localhost:${REACT_DEV_PORT} 开始使用应用
`);

  // 如果代理服务器端口与React开发服务器端口不同
  if (FRONTEND_PORT != REACT_DEV_PORT) {
    console.log(`
[注意] 代理服务器运行在 http://localhost:${FRONTEND_PORT}
       但React应用运行在 http://localhost:${REACT_DEV_PORT}
       请直接访问React应用地址
`);
  }
}); 
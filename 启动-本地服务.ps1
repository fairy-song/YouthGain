# 青盈应用启动脚本 - 本地服务
Clear-Host
Write-Host "================================================"
Write-Host "   青盈应用 本地启动程序 (PowerShell版)"
Write-Host "================================================"
Write-Host ""

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendPort = 3000
$backendPort = 5001

# 检查依赖
Write-Host "[1/3] 检查依赖..."
if (-not (Test-Path "$scriptPath\node_modules\express")) {
    Write-Host "[提示] 安装必要的依赖..."
    Set-Location $scriptPath
    npm install --save express http-proxy-middleware
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[错误] 依赖安装失败" -ForegroundColor Red
        Read-Host "按Enter键退出"
        exit 1
    }
    Write-Host "[成功] 依赖安装完成" -ForegroundColor Green
} else {
    Write-Host "[提示] 依赖已安装" -ForegroundColor Green
}

# 确保scripts_new/local目录存在
if (-not (Test-Path "$scriptPath\scripts_new\local")) {
    New-Item -ItemType Directory -Path "$scriptPath\scripts_new\local" -Force | Out-Null
}

# 如果proxy-server.js不存在，复制或创建它
if (-not (Test-Path "$scriptPath\scripts_new\local\proxy-server.js")) {
    Write-Host "[提示] 创建代理服务器脚本..."
    $proxyServerCode = @"
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const fs = require('fs');

// 获取命令行参数
const args = process.argv.slice(2);
const FRONTEND_PORT = args[0] || 3000;
const BACKEND_PORT = args[1] || 5001;
const BACKEND_API = `http://localhost:\${BACKEND_PORT}`;

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
        <title>青盈应用 - API代理</title>
        <style>
          body { font-family: 'Microsoft YaHei', Arial, sans-serif; padding: 20px; }
          .container { max-width: 800px; margin: 0 auto; }
          .status { background-color: #e8f5e9; border-left: 4px solid #4caf50; padding: 12px; }
          .warning { background-color: #fff8e1; border-left: 4px solid #ff9800; padding: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>青盈应用 - API代理服务器</h1>
          <div class="status">代理服务器正在运行，API 请求将被转发到: \${BACKEND_API}</div>
          <div class="warning">未找到前端构建文件。这是API代理服务器的默认页面。</div>
          <p>后端状态: <span id="backend-status">检查中...</span></p>
          <script>
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
  console.log(`启动代理服务器，前端端口: \${FRONTEND_PORT}，后端端口: \${BACKEND_PORT}`);
  console.log('================================================');
  console.log(`  青盈应用代理服务器已启动`);
  console.log('================================================');
  console.log(`- 前端页面: http://localhost:\${FRONTEND_PORT}`);
  console.log(`- 后端API: \${BACKEND_API}/api`);
  console.log('- 代理状态: 已将所有 /api 请求转发到后端服务');
  console.log(`访问 http://localhost:\${FRONTEND_PORT} 开始使用应用`);
});
"@
    
    Set-Content -Path "$scriptPath\scripts_new\local\proxy-server.js" -Value $proxyServerCode
    Write-Host "[成功] 已创建代理服务器脚本" -ForegroundColor Green
}

# 启动后端服务
Write-Host ""
Write-Host "[2/3] 启动后端服务..."
Start-Process -FilePath "cmd" -ArgumentList "/c cd $scriptPath\backend && python run_dev_enhanced.py" -WindowStyle Normal

# 启动代理服务器
Write-Host ""
Write-Host "[3/3] 启动代理服务器..."
Start-Process -FilePath "cmd" -ArgumentList "/c cd $scriptPath && node scripts_new\local\proxy-server.js $frontendPort $backendPort" -WindowStyle Normal

Write-Host ""
Write-Host "================================================"
Write-Host "                  启动完成!"
Write-Host "================================================"
Write-Host ""
Write-Host "  本地前端+代理: http://localhost:$frontendPort"
Write-Host "  本地后端: http://localhost:$backendPort"
Write-Host ""
Write-Host "  如果显示"这是一个测试回复"，请等待1分钟让AI模型初始化"
Write-Host ""
Read-Host "按Enter键退出此窗口(但保持服务运行)" 
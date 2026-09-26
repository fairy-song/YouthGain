/*
 * 青盈 YouthGain —— 前端静态托管 + API 代理服务器
 *
 * 由「快速启动.cmd」以 `node simple-static-server.js <port> <backendPort>` 启动：
 *   1. 托管项目 build/ 目录的静态产物（SPA 路由回退到 index.html）
 *   2. 把 /api/* 请求代理到后端（默认 127.0.0.1:5001），前端无需配置跨域
 *
 * 仅使用 Node 内置模块，不依赖任何第三方包，避免因缺少依赖再次启动失败。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = parseInt(process.argv[2], 10) || 3000;
const BACKEND_PORT = parseInt(process.argv[3], 10) || 5001;
const BACKEND_HOST = process.env.BACKEND_HOST || '127.0.0.1';

const ROOT = __dirname;
const BUILD_DIR = path.join(ROOT, 'build');
const INDEX_FILE = path.join(BUILD_DIR, 'index.html');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function serveStatic(req, res, pathname) {
  // 防止路径穿越：只允许访问 build 目录内的文件
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(BUILD_DIR, safePath);
  if (!filePath.startsWith(BUILD_DIR)) {
    return send(res, 403, 'Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
      // HTML 不缓存：保证前端重新构建后，用户刷新即可加载最新版本
      if (ext === '.html') {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      }
      return fs.createReadStream(filePath).pipe(res.writeHead(200, headers));
    }
    // 目录或不存在 → SPA 回退到 index.html
    fs.readFile(INDEX_FILE, (readErr, html) => {
      if (readErr) return send(res, 500, 'Build not found. Run `npm run build` first.');
      send(res, 200, html, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
    });
  });
}

function proxyApi(req, res, pathname) {
  const options = {
    hostname: BACKEND_HOST,
    port: BACKEND_PORT,
    path: pathname + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''),
    method: req.method,
    headers: { ...req.headers, host: `${BACKEND_HOST}:${BACKEND_PORT}` },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => {
    console.error(`[代理错误] 后端 ${BACKEND_HOST}:${BACKEND_PORT} 不可达: ${err.message}`);
    send(res, 502, JSON.stringify({ status: 'error', message: '后端服务不可达，请确认后端已启动' }),
      { 'Content-Type': 'application/json; charset=utf-8' });
  });
  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (pathname.startsWith('/api/')) {
    return proxyApi(req, res, pathname);
  }
  return serveStatic(req, res, decodeURIComponent(pathname));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[青盈前端] http://localhost:${PORT}  静态目录: ${BUILD_DIR}`);
  console.log(`[API代理] /api/* -> http://${BACKEND_HOST}:${BACKEND_PORT}`);
});

import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
// 样式加载顺序（重要，勿调换）：
//   1. Bootstrap 骨架
//   2. 项目色板 token
//   3. Tailwind + 全站覆盖
// index.css 必须排在最后。它里面的 :root { --bs-* } 覆盖依赖层叠顺序，
// 若排在 Bootstrap 之前会被 Bootstrap 自己的 :root 压回去。
// Bootstrap 原本在 Home.js / Dashboard.js 里单独引入，那样会导致
// 「只有访问过这两个页面才加载」以及顺序不可控，故统一提到入口。
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/palette.css';
import './index.css';

import App from './App';
// 导入API测试工具
import './utils/testApi';

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
); 
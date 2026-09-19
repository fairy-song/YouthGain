# 🌟 青盈 (YouthGain) - AI金融心智教练

![应用版本](https://img.shields.io/badge/version-1.0.0-blue)
![构建状态](https://img.shields.io/badge/build-passing-brightgreen)
![前端框架](https://img.shields.io/badge/React-18-blue)
![后端服务](https://img.shields.io/badge/Flask-Python-darkgreen)
![AI平台](https://img.shields.io/badge/AI-Zhipu(GLM--4)-purple)

青盈是一款**基于人工智能的金融心智教练应用**，旨在帮助用户培养健康的财务心态，提升金融决策能力，并实现个人财务目标。本项目不仅提供丰富的金融知识，还深度整合了情绪引导与压力管理策略。

---

## ✨ 核心特性

- 🧠 **AI金融心智教练**: 基于智谱 AI (GLM-4) 驱动的个性化指导，随时为您进行深度的智能对话与心智策略建议。
- 📊 **专业心智评测体系**: 采用多维度量表评估您的财务状况与心智模式，全面提供历史记录跟踪和深度数据可视化呈现。
- 🎨 **极具现代感的用户体验**: 引入全屏级动态粒子背景、沉浸式打字特效，以及全面优化的个人中心等，为您带来流畅、极具科技感与主流美感并存的视觉交互。
- 📈 **财务目标跟踪与压力管理**: 在提供交互式学习体验的同时，科学管理您的财务压力与情绪波动。
- 🔐 **企业级安全防护**: 严密保护敏感接口与核心数据，所有 API 均不包含硬编码配置，完整支持基于项目根目录环境变量的可控与安全隔离架构。

## 🛠 技术架构

**客户端 (Frontend):**
- React 18 / React Router
- Tailwind CSS / Bootstrap 5 / Animate.css
- Firebase / 动态交互扩展 (typed.js 等)

**服务端 (Backend):**
- Python 3.8+ / Flask 框架
- 智谱AI SDK 模型串联

---

## 🚀 快速启动

### 1. 环境准备清单
* Node.js 18+ 
* Python 3.8+
* [智谱AI API 密钥](https://open.bigmodel.cn/) (必需)
* [Firebase 项目配置](https://console.firebase.google.com/) (必需)

### 2. 🔑 配置安全环境变量 (核心步骤)

**警告：本项目已移除所有硬编码的资源依赖！必须首先通过本地环境变量进行加载：**

1. **生成本地环境配置：**
   ```bash
   # Windows 系统复制环境配置文件
   copy .env.example .env.local
   
   # Linux/Mac系统复制环境配置文件
   cp .env.example .env.local
   ```
2. **填写 `.env.local`：**
   - 填写您的智谱 AI API 密钥 (`ZHIPUAI_API_KEY`) 
   - 填写 Firebase 相关的各项访问配置
   - 生成安全密钥配置到 `SECRET_KEY`:
     `python -c "import secrets; print(secrets.token_hex(32))"`

> 想要了解更详尽的安全规约以及密钥导入设置细节，请务必阅读：[🔐 SECURITY_SETUP.md](SECURITY_SETUP.md)

### 3. 安装依赖项

```bash
# 1. 前端核心模块
npm install

# 2. 后端服务端架构模块
cd backend
pip install -r requirements.txt
```

### 4. 运行与服务启动

- **Windows 用户** (推荐使用自动化脚本):
  👉 建议直接双击运行根目录下的 `快速启动.cmd`

- **手动开发者模式启动**:
  ```bash
  # 终端 A: 启动稳定版后端 API (默认运行于 :5001)
  cd backend && python run_dev_enhanced.py

  # 终端 B: 启动 React 交互前端系统 (默认运行于 :3000)
  npm start
  ```

---

## 📚 规范指南与延伸阅读

- 💻 **开发调试/进阶配置说明**: 请参阅 [`使用说明.md`](使用说明.md)
- ☁️ **生产环境与项目部署准则**: 请参阅 [`手动构建指南.md`](手动构建指南.md) 和 [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md)
- 🔍 **开发辅助调试**: 如果启动或者组件显示遇到异常，参阅 [`启动问题排查.md`](启动问题排查.md)

## 🌐 线上演示

一键体验最新 Alpha 尝鲜版 (前端页面展示)：[青盈 - 线上体验](https://fairy-song.github.io/YouthGain/)
*(注：在线构建版本受限于网络请求，体验全功能需自行搭建并正确配置线上 API 代理服务器)*

## 📄 社区支持与开源许可

本项目遵循 LICENSE 文件中规定的许可协议条款进行开源支持。
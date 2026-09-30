# 🌟 青盈 (YouthGain) - AI金融心智教练

![应用版本](https://img.shields.io/badge/version-1.0.0-blue)
![构建状态](https://img.shields.io/badge/build-passing-brightgreen)
![前端框架](https://img.shields.io/badge/React-18-blue)
![后端服务](https://img.shields.io/badge/Flask-Python-darkgreen)
![AI平台](https://img.shields.io/badge/AI-Zhipu(GLM--4)-purple)

青盈是一款**基于人工智能的金融心智教练应用**，旨在帮助用户培养健康的财务心态，提升金融决策能力，并实现个人财务目标。本项目不仅提供丰富的金融知识，还深度整合了情绪引导与压力管理策略。

青盈面向管理生活费的年轻人：看清生活费去向，买之前比较影响，买之后回看选择。账本显示本月预算剩余，“我的”保留实际余额核对，消费决策提供购买比较、简短复盘和历史记录。情境练习与知识库为可选辅助内容。

---

## ✨ 核心特性

- 🧠 **AI金融心智教练**: 基于智谱 AI (GLM-4) 驱动的个性化指导，随时为您进行深度的智能对话与心智策略建议。
- 📊 **理财自我探索与情境学习**: 通过习惯自我探索和可解释情境反馈选择练习方向；这些记录不是专业量表、心理诊断或能力认证。
- 🎨 **极具现代感的用户体验**: 引入全屏级动态粒子背景、沉浸式打字特效，以及全面优化的个人中心等，为您带来流畅、极具科技感与主流美感并存的视觉交互。
- 📈 **财务目标跟踪与压力管理**: 在提供交互式学习体验的同时，查看储蓄目标进度，记录消费选择与体验。
- 🔐 **账户与配置管理**: 接口通过账号身份访问数据，服务端密钥通过环境变量配置；正式部署须关闭开发认证绕过并验收数据隔离。

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


### 管理员登录

- 用户入口：`/#/login`；管理员入口：`/#/admin/login`，导航栏和登录页均可切换。
- 管理员权限由后台 `ADMIN_EMAILS` 决定。将已注册的管理员邮箱写入项目根目录 `.env.local`（多个邮箱用逗号分隔），然后重启后台。仅选择管理员入口不会获得权限。
- 本地开发启动器读取 `.env.local`。在 `DEV_MODE=true` 且前端未配置 Firebase 时，可用 `admin@youthgain.com`（须已配置到 `ADMIN_EMAILS`）和任意非空密码模拟登录；这不是正式账号或正式密码。
- 正式环境必须关闭 `DEV_MODE`，配置前后端 Firebase，并使用真实已注册账号及密码。部署时将 `ADMIN_EMAILS` 设置为服务端环境变量。
- 登录时若提示无法验证权限，请先检查后台服务；若提示没有管理员权限，请核对后台邮箱配置并重启服务。


### 知识库内容维护

用户端 `/#/info/knowledge` 通过公开只读接口 `/api/knowledge` 读取管理员发布的同一份文章。正文支持 Markdown；HTML 不执行。现有六个核心分类外的历史分类仍保留。

首批 24 篇内容保存在 `backend/content/knowledge_starter.json`，每篇包括生活算例、行动清单、情境题、参考答案、来源、适用人群和更新日期。管理员可在 `/#/admin/knowledge` 修改正文；以 `## 参考答案` 和 `## 资料来源` 标记的答案会在用户端收起。

首次部署需主动导入：在本地模拟后台已启用并配置相应管理员邮箱时，运行 `.venv\Scripts\python.exe backend/content/import_knowledge.py --dev-email admin@youthgain.com`。真实认证环境通过环境变量 `YOUTHGAIN_TOKEN` 提供管理员 ID token，并用 `--url` 指定 API 地址，不传模拟邮箱。导入按现有标题跳过重复内容，不覆盖管理员修改；删除后再次主动导入会补回对应文章。导入不在启动时自动执行。

知识库页面的计算工具仅进行页面内预算、储蓄目标和分期总价计算，不计算投资收益或贷款年化利率，也不上传输入金额。AI 教练中的试算是独立功能，勾选授权后会发送资料和计算汇总给模型服务。

### AIC 技术升级

可选情境练习包含八道可解释自适应情境题；AI 教练接入站内知识检索和授权后的消费试算，并展示计算依据与资料摘录。离线评测、可选模型对照与真实试用方案见 [AIC 技术升级与验证说明](docs/AIC_TECHNICAL_UPGRADE.md)。开发样例结果不代表教学效果。

# 🌟 青盈 (YouthGain) - AI金融心智教练

![应用版本](https://img.shields.io/badge/version-v2.0%20development-orange)
![构建状态](https://img.shields.io/badge/build-passing-brightgreen)
![前端框架](https://img.shields.io/badge/React-18-blue)
![后端服务](https://img.shields.io/badge/Flask-Python-darkgreen)
![AI平台](https://img.shields.io/badge/AI-Zhipu(GLM--4)-purple)

青盈是一款**基于人工智能的金融心智教练应用**，旨在帮助用户培养健康的财务心态，提升金融决策能力，并实现个人财务目标。本项目不仅提供丰富的金融知识，还深度整合了情绪引导与压力管理策略。

青盈面向管理生活费的年轻人：可记录或导入账单，核对退款与收款；首页一次展示一个可完成的财商练习，并结合问卷、已记录消费和答题情况解释推荐原因。“我的”保留问卷与实际余额核对，每日音频博客提供一期可选内容。学习题目仍处于试用审核阶段，个性化教学效果尚待真实试测。

v2.0 的功能范围、已完成部分与评估边界见 [修改方案](docs/QINGYING_V2_PLAN.md) 和 [B/C/D 学习评估说明](docs/B_C_D_LEARNING_EVALUATION.md)。

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
- Python 3.10+ / Flask 框架
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

### 消费模式探索（PCA）

账本的分析区域新增按周主成分分析，比较本账号最近最多 26 个有记录的完整自然周。至少需要 12 周；首个不完整周、当前周、未来记录和空白周不作为样本。完整自然周不意味着已完整记账，漏记仍会影响结果。

指标包括消费笔数、平均单笔金额、小额支出金额占比、周末支出金额占比、前三大类别及其他类别支出金额占比。指标按样本总体标准差标准化，无变化指标剔除，通过 NumPy SVD 求主成分。最多保留 3 个方向，累计解释方差目标为 80%，不足时展示实际比例；12 周只是启用门槛，并不保证统计稳定性。

`GET /api/decision/report` 的 `report.pca` 包含状态、样本周数、解释方差、指标贡献（载荷平方）及周得分。数据不足、变化不足或读取不完整时不生成结论。AI 教练只在用户允许引用资料与消费统计后接收摘要，不接收逐周得分。PCA 不参与预算、机会成本和目标计算，也不用于人格或财商评分。

安装后端依赖后可运行 `python -m pytest backend/tests/test_pca_service.py` 验证数学一致性及降级行为。现有验证使用构造数据，不代表真实用户效果；上线效果需在完整的历史记录上比较新增洞察与原规则的重复率、跨时间稳定性和用户理解情况。

### 学校研究与差分隐私

首个里程碑已实现：学生研究参与与退出、项目范围内的学校研究权限、三项月度群体统计、差分隐私预算账本、固定快照和受保护导出。学生入口为 `/#/research/participation`，学校及项目管理入口为 `/#/research`；“我的”和管理员后台均提供入口。

默认仅开放模拟演示。管理员可建立已结束月份的模拟项目并发布看板；真实研究通过 `RESEARCH_LIVE_ENABLED` 显式启用，学生仍需逐项目主动参与。该原型使用可信后端处理明细，学校研究者读取受保护统计，尚未实现联邦学习。研究账本需要同一主机上的持久化路径，不适合直接部署为多主机无状态服务。操作步骤、依赖、预算及统计口径见 [学校研究首个里程碑说明](docs/SCHOOL_RESEARCH_MILESTONE.md)。

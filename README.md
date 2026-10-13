<div align="center">

<h1>青盈 · YouthGain</h1>

<p><strong>把收支记清楚，把未来安排好。</strong></p>

<p>面向大学生的收支记录与财商学习应用<br />从真实消费出发，练习理解预算、储蓄与日常选择。</p>

<p>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-168575?style=flat-square" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/React-18-149eca?style=flat-square&logo=react&logoColor=white" alt="React 18" />
  <img src="https://img.shields.io/badge/Flask-3-333333?style=flat-square&logo=flask&logoColor=white" alt="Flask 3" />
  <img src="https://img.shields.io/badge/SQLite-资金与推荐-4169e1?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite 资金与推荐存储" />
</p>

<p>
  <a href="#快速开始">快速开始</a> ·
  <a href="#核心功能">核心功能</a> ·
  <a href="#开发与验证">开发与验证</a> ·
  <a href="#文档导航">文档导航</a> ·
  <a href="https://github.com/fairy-song/YouthGain/issues">反馈问题</a>
</p>

</div>

---

青盈把**记账、资金安排和财商练习**放在同一个应用中：记录今天的钱花在哪里，为未来开支和储蓄目标留出位置，再通过情境练习与复盘理解自己的选择。

> [!NOTE]
> 项目正在持续迭代。本说明对应当前源码；公开部署与外部服务的运行状态需单独核对。每日播客默认使用本地基线，HSTU 通过外部 HTTP 服务接入。

## 核心功能

| 入口 | 功能 |
| --- | --- |
| **今天** | 当前情境练习、收支摘要、近期安排，以及每天至多一期的个性化音频推荐 |
| **账本** | 手动与语音记账、CSV / 微信 XLSX 导入、退款关联、分类图表、储蓄目标与未来开支 |
| **学习** | 多步情境练习、消费方案比较、反馈与复盘，根据问卷和本人记录选择学习内容 |
| **我的** | 个人财务资料、问卷、学习主题、时区、登录与退出 |
| **AI 教练与后台** | 独立教练对话；管理员维护用户、知识资料和已审核音频目录 |

### 资金有清楚的口径

```text
本月可用剩余 = 上月结转结余 + 本月实际收入 − 本月净支出 − 本月净储蓄划拨
```

储蓄目标的锁定总资金独立保存。划入储蓄会减少日常可用资金，释放则反向调整，二者都不记作收入或支出；锁定总额不会被重复扣减。预计收入与实际到账分开，缺少结转确认时显示未知。详细规则见 [财务推荐 v2 模块定义](docs/财务推荐v2模块定义.md)。

### 推荐可以核对依据

每日播客从审核目录中选择具体单集，结合财务快照、学习主题与历史反馈排序。当天结果固定，最近 30 日推荐过的单集会被排除；没有合适候选时显示空状态。用户可以查看推荐时点与依据，提交收藏、不感兴趣或“对我有帮助”反馈。

排序器支持 `baseline / shadow / hstu`。HSTU 推理超时或不可用时回退本地基线；项目内不训练 HSTU 网络或权重。

## 快速开始

统一启动器面向 **Windows**，需要 **Git、Node.js 18+、Python 3.10+**。首次安装依赖需要联网。

**1. 获取代码并创建本地配置**

```powershell
git clone https://github.com/fairy-song/YouthGain.git
cd YouthGain
Copy-Item .env.example .env.local
```

已有工作区请直接使用原来的配置，不要覆盖 `.env.local`。

**2. 选择本机演示模式**

在 `.env.local` 中设置以下值；本机演示无需填写 Firebase 前端配置或 AI 密钥：

```dotenv
APP_ENV=development
DEV_MODE=true
DB_TYPE=memory
RESEARCH_LIVE_ENABLED=false
PODCAST_RANKER_MODE=baseline
```

此模式使用模拟登录，不验证真实密码，只用于本机体验；不同模拟邮箱对应不同开发账户。开发数据会持久化，`DB_TYPE=memory` 不表示重启后清空。

**3. 启动应用**

```powershell
.\快速启动.cmd
```

也可以双击根目录的 `快速启动.cmd`。启动器会准备虚拟环境和依赖，启动前后端，并检查服务是否就绪。

| 入口 | 地址 |
| --- | --- |
| 应用 | [http://127.0.0.1:3000/#/](http://127.0.0.1:3000/#/) |
| 后端健康检查 | [http://127.0.0.1:5001/api/health](http://127.0.0.1:5001/api/health) |

<details>
<summary>启动检查、重启与日志</summary>

```powershell
.\快速启动.cmd -CheckOnly   # 检查本地环境
.\快速启动.cmd -Restart     # 重启本项目服务
.\快速启动.cmd -NoBrowser   # 启动但不打开浏览器
```

后端代码或配置更新后需要重启。服务日志位于 `logs/`；关闭启动窗口不等于停止后台服务。更多操作见 [启动与配置](docs/使用说明.md#1-启动与配置)。

</details>

## 配置与部署

按需在后端配置服务；完整配置模板见 [.env.example](.env.example)。

| 能力 | 主要配置 | 使用条件 |
| --- | --- | --- |
| 真实登录 | `FIREBASE_ADMIN_SDK_PATH`、前端 `REACT_APP_FIREBASE_*` | 配置 Firebase 认证，关闭 `DEV_MODE` |
| AI 教练 | `ZHIPUAI_API_KEY`；可选 `ZHIPUAI_MODEL` | 使用已配置的外部模型服务 |
| 语音记账 | `XFYUN_APP_ID`、`XFYUN_API_KEY`、`XFYUN_API_SECRET` | 配置讯飞服务与麦克风权限 |
| 业务数据 | `DB_TYPE`、`MYSQL_*` 或 Firestore 配置 | 选择开发存储、MySQL 或 Firestore |
| 资金与推荐 | `PODCAST_DB_PATH` | 储蓄目标、内部划拨、推荐、快照与事件共用持久化 SQLite |
| HSTU 排序 | `PODCAST_RANKER_MODE`、`PODCAST_HSTU_URL`、`PODCAST_HSTU_API_KEY` | 外部服务符合 [请求与响应协议](docs/api/finance-podcasts.openapi.json) |
| 音频 RSS | `PODCAST_RSS_ALLOWED_HOSTS` | 仅同步已核准来源；定时任务由部署端配置 |
| 管理后台 | `ADMIN_EMAILS` | 登录邮箱匹配管理员名单 |

公开部署需配置认证、数据库、随机 `SECRET_KEY`、HTTPS 后端与允许的跨域来源，并关闭模拟登录。GitHub Pages 只托管前端；前端通过 `REACT_APP_API_URL` 连接实际后端。部署步骤见 [数据、部署与回退](docs/使用说明.md#9-数据部署与回退)。

## 技术与目录

前端采用 **React 18、React Router、React Bootstrap 与 Three.js**；后端采用 **Flask**。收支计算、资金划拨与目标规划由确定性程序完成；推荐使用不可变财务快照、追加事件和独立排序适配器。

```text
YouthGain/
├── src/                 # 页面、组件、认证与前端 API
├── public/              # 静态资源与账单模板
├── backend/
│   ├── app/routes/      # HTTP 接口与权限校验
│   ├── app/services/    # 财务、学习、教练与推荐服务
│   ├── app/sql/         # SQLite 表结构与迁移
│   └── tests/           # 后端回归测试
├── scripts/             # 启动、检查与本地维护工具
├── docs/                # 使用说明、模块定义与接口 schema
├── output/              # 方案文档的 Markdown / PDF / Word 版本
└── 快速启动.cmd          # Windows 统一启动入口
```

## 开发与验证

在项目根目录执行。启动器安装业务依赖；后端测试另需 `pytest`。

```powershell
# 后端回归
.\.venv\Scripts\python.exe -m pip install pytest
.\.venv\Scripts\python.exe -m pytest backend/tests -q

# 前端测试与生产构建
npm test -- --watchAll=false --runInBand
npm run build
```

最近一轮本地验证（**2026-10-14**）：后端 **260 项**通过，财务与推荐相关前端 **29 项**通过，生产构建成功。HSTU 使用模拟 HTTP 验证接入行为，真实外部模型尚未联调；上述结果不代表已完成线上验收。

后续重点包括试用情境题内容审核、真实服务联调，以及个性化推荐的离线评价与受控线上验证。产品演进见 [长期迭代思路](docs/青盈长期迭代里程思路.md)。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [完整使用说明](docs/使用说明.md) | 配置、登录、账单导入、功能操作与故障排查 |
| [功能与技术](docs/目前版本实现的功能及其对应的技术.md) | 功能概览与对应实现 |
| [财务推荐 v2 模块定义](docs/财务推荐v2模块定义.md) | 资金口径、快照约束、服务职责与 HSTU 协议 |
| [OpenAPI schema](docs/api/finance-podcasts.openapi.json) | 资金、每日推荐、反馈与外部推理接口 |
| [每日推荐接口与实施说明](docs/每日推荐接口与实施说明.md) | 推荐编排、事件语义、兼容规则与验证 |
| [个性化推荐修改方案](output/pdf/青盈每日内容个性化推荐修改方案.md) | 原始算法与工程设计；另有 [PDF](output/pdf/青盈每日内容个性化推荐修改方案.pdf) / [Word](output/docx/青盈每日内容个性化推荐修改方案.docx) |

## 参与贡献

欢迎通过 [Issues](https://github.com/fairy-song/YouthGain/issues) 提交问题或建议，通过 [Pull Requests](https://github.com/fairy-song/YouthGain/pulls) 贡献改进。

- 报告问题时提供系统环境、复现步骤与预期结果，日志中移除密钥和个人财务信息。
- 修改业务逻辑时说明计算口径，补充能验证行为的测试，使用合成账户和账单。
- 提交源码与必要文档；保留 `.env.local`、服务账号、开发数据库、原始账单及本地备份的忽略规则。

## 许可与致谢

项目采用 [MIT License](LICENSE)。青盈由 [XiaoCow666 / 财赋思](https://github.com/XiaoCow666/Caifusi) 演进而来，当前由 [fairy-song](https://github.com/fairy-song) 重构与维护，原始作者与维护者的版权声明保留在许可证中。

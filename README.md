<div align="center">

<img src="docs/assets/readme-cover.svg" width="100%" alt="青盈 YouthGain：看懂花费，安排生活" />

# 青盈 · YouthGain

**当前版本 [v1.5](CHANGELOG.md)**

**融合行为经济学与情境化智能辅导及推荐的大学生财商实践平台**

从一笔真实消费开始，连接消费感知、资金安排、知识学习与自主回顾。

[![License: MIT](https://img.shields.io/badge/License-MIT-28785c?style=flat-square)](LICENSE) [![React 18](https://img.shields.io/badge/React-18-149eca?style=flat-square&logo=react&logoColor=white)](package.json) [![Flask](https://img.shields.io/badge/Backend-Flask-333333?style=flat-square&logo=flask&logoColor=white)](backend/requirements.txt) [![Status](https://img.shields.io/badge/Status-Research%20Prototype-b18b46?style=flat-square)](#project-status)

[产品预览](#preview) · [快速开始](#quick-start) · [三端入口](#workspaces) · [系统设计](#architecture) · [文档](#documentation)

[报告问题](https://github.com/fairy-song/YouthGain/issues) · [参与贡献](#contributing) · [改进进展](docs/持续改进任务台账.md)

</div>

---

## 为什么做青盈

记下“花了多少钱”只是开始。青盈希望把消费记录进一步连接到三个问题：**钱去了哪里、接下来要留多少钱、这次选择是否符合自己的需要。**

项目将记账、目标规划、情境练习与 AI 教练放在同一条使用路径里，让金融知识可以回到日常生活中实践。应用不会代用户支付、自动转账或执行投资交易。

**记录或导入 → 看见钱的去向 → 理解消费选择 → 学习与辅导 → 行动与回顾**

<a id="preview"></a>
## 看见花费，才开始理解花费

<img src="docs/assets/clarity-student-v1.4.png" width="100%" alt="青盈真实界面的模拟场景：186.50 元餐饮净支出被展开为纸币和硬币" />

<p align="center"><sub>实际界面 · 模拟数据：把 ¥186.50 展开成纸币和硬币，让抽象数字变得可感知。</sub></p>

| 看见消费 | 理解选择 | 形成行动 |
| :--- | :--- | :--- |
| 分类累计支出、退款口径与钱币展开，让花费有具体形态。 | 情境化教练结合已确认事实与知识依据，帮助梳理条件。 | 把观察带入学习与复盘，记录自主选择和后续体验。 |

<details>
<summary><strong>v1.5：审核不再漏掉较早的资料</strong></summary>

知识更新按完整台账筛选、分页；待审核包括排除建议。显示页码和准确数量，失败可重试，审核后自动回到有效页。详见[实施与验证记录](docs/v1.5知识审核完整台账实施记录.md)。

</details>

<details>
<summary><strong>v1.4：少读说明，直接看结果</strong></summary>

删去三端重复介绍，消费与复盘用并列数字呈现；知识容量使用带数字的进度条，说明与技术信息按需展开。默认教练回答更简短，要求详细时仍可展开。

<img src="docs/assets/clarity-admin-v1.4.png" width="100%" alt="v1.4知识管理演示：文章及片段以数量和配额进度条呈现，统计详情按需查看" />

<sub>程序界面 · 隔离演示数据。范围、对比与验证见[文字减负实施记录](docs/v1.4文字减负实施记录.md)。</sub>

</details>

<details>
<summary><strong>v1.2：先轻松记下一笔</strong></summary>

金额、类别、日期直接填写，其他信息按需展开；没有设置收入也能保存。资金资料不全时明确显示待核对。

<img src="docs/assets/first-entry-v1.2.png" width="100%" alt="v1.2 实际账本界面：金额、类别、日期为主要输入，补充详情与更多记账方式按需展开" />

<sub>实际界面 · 隔离模拟环境，无真实账户数据。详见[本版实施与验证记录](docs/v1.2首笔记账减负实施记录.md)。</sub>

</details>

<a id="features"></a>
## 功能概览

| 模块 | 可以做什么 |
| --- | --- |
| 今天 | 查看分类累计消费并展开成钱币；确认感受后带入教练或复盘，回看上次行动；保留本月收支、开支安排、情境练习和音频推荐 |
| 收支账本 | 手动记账、语音转文字录入、CSV / 微信 XLSX 导入、退款关联、分类图表与花销钱币展示 |
| 资金安排 | 区分实际收入、上月结转和储蓄锁定，管理目标金额、截止日与未来开支 |
| 学习与复盘 | 完成多步情境练习，比较消费方案，记录选择理由并回看实际体验 |
| AI 教练 | 围绕具体问题交流；根据资料缺口选择追问、补检或解释已有计算，主动授权后结合个人资料与消费汇总，展示回答方式与依据；中文选字时回车不会提前发送 |
| 知识与音频 | 阅读金融教育资料；自动筛选可信来源的增量更新，按来源策略发布或复核；从已审核目录推荐具体音频单集，支持收藏和反馈 |
| 管理与研究 | 管理用户、知识与音频内容；研究参与单独授权，学校端按权限查看群体统计 |

<details>
<summary><strong>当前实现与验证边界</strong></summary>

首页使用完整月度分类汇总，区分支出、退款和净支出；没有记录不等于没有花费。用户确认感受后，自主选择带入教练或复盘。已有推荐服务保持独立，不会根据首页临时选择实时重排。

当前处于研究原型阶段，尚无真实用户试用或教育效果结论。模拟使用用于验证流程与数据边界。入口开关与试用任务见[情境化财商实践改进计划](docs/青盈情境化财商实践改进计划.md)。

</details>

<details>
<summary><strong>财务口径、AI 辅导与自动知识库如何工作？</strong></summary>

### 财务计算与 AI 解释分开

```text
本月可用剩余 = 上月结转结余 + 本月实际收入 − 本月净支出 − 本月净储蓄划拨
```

- **实际到账才计入收入**：预计兼职收入或生活费不直接当成可用资金。
- **储蓄独立记账**：内部划拨不算收入或消费；已锁定资金不会重复扣减。
- **缺失数据明确提示**：没有确认结转、漏记账单或资料过期时，结果可能不完整。
- **试算有各自口径**：收支结余、账户估算余额和本月可用剩余不能混用。详见[资金模块定义](docs/财务推荐v2模块定义.md)。

### 自动知识库与自适应辅导

知识管理页显示实际文章数、全文片段数、持久索引状态及可配置配额（默认 1,000 篇 / 20,000 片段，非实际库存或性能承诺）。自动筛选结合来源规则、模型分类与原文摘录校验；现有来源保留人工发布，确认使用范围后可逐来源开启合格基础内容自动发布，异常仍需复核。教练的动作选择采用模型与程序约束，并保留规则回退；目前未训练新策略模型，也未证明教育效果。实际库存、验证结果、限制及开关回退见[实施记录](docs/自动知识库与自适应辅导实施记录.md)。

</details>

<a id="quick-start"></a>
## 快速开始

### 环境要求

统一启动器面向 **Windows**，需要 **Git、Node.js 18+、Python 3.10+**。首次安装依赖需要联网。其他操作系统未通过此启动器验证。

### 1. 获取源码

```powershell
git clone https://github.com/fairy-song/YouthGain.git
cd YouthGain
Copy-Item .env.example .env.local
```

已有工作区请保留原配置，**不要覆盖 `.env.local`**。

### 2. 配置本机演示模式

在 `.env.local` 中设置：

```dotenv
APP_ENV=development
DEV_MODE=true
DB_TYPE=memory
COACH_RETRIEVAL_MODE=bm25
RESEARCH_LIVE_ENABLED=false
PODCAST_RANKER_MODE=baseline
```

> [!IMPORTANT]
> `DEV_MODE=true` 会使用模拟身份登录，不验证真实密码，仅用于可信的本机开发环境。不要填入常用真实密码，不要将开发服务暴露到公网。`DB_TYPE=memory` 的开发数据会持久化到本地文件，并非重启即清空。

这套入门配置使用关键词检索与规则推荐，可先体验记账和基础学习；无需填写 Firebase 前端配置与 AI 密钥。语音识别、完整模型回答等能力需要另外配置服务。

### 3. 启动

```powershell
.\快速启动.cmd
```

也可以双击根目录的 `快速启动.cmd`。启动器会检查环境、准备虚拟环境与依赖，然后启动前后端并检查就绪状态。

| 服务 | 本地地址 |
| --- | --- |
| 应用 | [http://127.0.0.1:3000/#/](http://127.0.0.1:3000/#/) |
| 后端健康检查 | [http://127.0.0.1:5001/api/health](http://127.0.0.1:5001/api/health) |

本地模拟登录可使用自己的测试邮箱与任意非空密码。管理后台默认示例邮箱为 `admin@youthgain.com`，实际权限由后端 `ADMIN_EMAILS` 判定。

<details>
<summary>环境检查、重启与常见问题</summary>

```powershell
.\快速启动.cmd -CheckOnly   # 只检查环境
.\快速启动.cmd -Restart     # 重启本项目服务
.\快速启动.cmd -NoBrowser   # 启动但不打开浏览器
```

- **页面无法连接**：先检查健康接口与 `logs/` 中的前后端日志，确认端口 3000 / 5001 未被其他程序占用。
- **修改配置没有生效**：重启后端；修改 `REACT_APP_*` 后还需重新启动或构建前端。
- **语音不可用**：检查讯飞配置、浏览器权限和麦克风，也可使用文本录入。
- **教练或推荐降级**：检查对应密钥、模型文件与来源目录；降级结果不代表完整模型分析成功。
- **更新前备份**：保留开发数据、SQLite 文件和本地配置。关闭启动窗口不等于停止后台服务。

启动后可用独立演示邮箱 `demo@youthgain.local` 登录，再运行根目录的 `刷新演示数据.cmd` 补充带“检验样例”标记的数据；脚本会检查账户内容并备份，遇到未标记记录时拒绝覆盖。详见[演示账户说明](docs/播客兜底与演示账户完成说明.md)。

详见[完整使用说明](docs/使用说明.md)。

</details>

<a id="workspaces"></a>
## 三端入口

启动后请按身份进入对应工作区，三个登录入口独立。

| 工作区 | 本地入口 | 登录条件 |
| --- | --- | --- |
| 学生端 | [进入青盈](http://127.0.0.1:3000/#/) · [登录](http://127.0.0.1:3000/#/login) | 本地模拟模式使用测试邮箱；真实部署使用注册账号 |
| 管理员端 | [管理员登录](http://127.0.0.1:3000/#/admin/login) | 邮箱需配置在 `ADMIN_EMAILS` 中，选择入口不会授予权限 |
| 学校端 | [学校端登录](http://127.0.0.1:3000/#/research/login) · [报告演示](http://127.0.0.1:3000/#/research/demo) | 实际报告需启用研究功能，并由项目负责人授权；演示页可先查看 |

本机地址需先启动服务。GitHub Pages 的静态页面不能替代后端服务。

<details>
<summary><strong>进阶配置：认证、模型、语音、存储与研究</strong></summary>

## 配置说明

完整变量见 [.env.example](.env.example)。只为要启用的能力填写配置，密钥不应出现在前端源码或 Git 提交中。

| 能力 | 主要配置 | 说明 |
| --- | --- | --- |
| 真实认证 | `FIREBASE_ADMIN_SDK_PATH`、`REACT_APP_FIREBASE_*` | 配置 Firebase，关闭模拟登录 |
| AI 教练 | `ZHIPUAI_API_KEY` | 模型与检索设置见 AI 实现文档 |
| 语音识别 | `XFYUN_APP_ID`、`XFYUN_API_KEY`、`XFYUN_API_SECRET` | 需要讯飞服务与浏览器麦克风权限 |
| 业务存储 | `DB_TYPE`、`MYSQL_*` 或 Firestore 配置 | 开发文件存储、MySQL 或 Firestore |
| 资金与推荐账本 | `PODCAST_DB_PATH` | 推荐、快照、储蓄目标与内部资金账目使用持久化 SQLite |
| 推荐排序 | `PODCAST_RANKER_MODE`、`PODCAST_HSTU_MODEL_PATH` | 无有效权重时使用规则回退；演示权重不作为真实效果证据 |
| RSS 采集 | `PODCAST_RSS_ALLOWED_HOSTS` | 仅采集经过核准的来源 |
| 管理权限 | `ADMIN_EMAILS` | 按登录邮箱核验角色 |
| 学校研究 | `RESEARCH_LIVE_ENABLED`、`RESEARCH_DB_PATH` | 默认不启用真实研究；需单独配置、授权与验收 |

</details>

<a id="architecture"></a>
## 系统设计

```mermaid
flowchart LR
    UI[React 前端] --> API[Flask API 与权限校验]
    API --> Finance[确定性财务计算与目标规划]
    API --> Learning[学习记录与情境练习]
    API --> Coach[知识检索与 AI 解释校验]
    API --> Podcast[内容审核与推荐排序]
    Finance --> SQLite[(SQLite 资金与事件账本)]
    Podcast --> SQLite
    Learning --> Store[(开发存储 / MySQL / Firestore)]
    Coach --> Knowledge[知识资料与本地检索模型]
    Coach --> Provider[已配置的外部 AI 服务]
```

- **前端**：React 18、React Router、React Bootstrap，部分视觉交互使用 Three.js。
- **教练检索**：BM25 与语义向量召回，经 RRF 融合和 Cross-Encoder 重排；模型回答检查数值绑定、来源编号与引用片段，校验失败时重试或返回可核对的回退内容。
- **内容推荐**：审核目录、财务快照、学习主题与历史反馈共同参与排序；支持规则排序、本地 HSTU 推理及影子比较模式。
- **数据边界**：财务事实由程序计算，模型负责解释；个人记录引用与研究参与分别授权。

模型准备、训练与验证步骤见 [AI 教练与 HSTU 实现说明](docs/AI教练与HSTU实现说明.md)。合成训练指标不能证明真实校园推荐效果或金融素养提升。

<details>
<summary><strong>开发者指南：目录、测试、部署与项目状态</strong></summary>

### 仓库结构

```text
YouthGain/
├── src/                  # React 页面、组件、认证与 API 客户端
├── public/               # 静态资源与账单导入模板
├── backend/
│   ├── app/routes/       # API 路由与权限入口
│   ├── app/services/     # 财务、学习、教练、推荐与研究服务
│   ├── app/sql/          # SQLite 表结构与迁移
│   ├── content/          # 初始知识资料与导入工具
│   └── tests/            # 后端测试
├── scripts/              # 启动、环境检查与维护脚本
├── docs/                 # 项目文档及已生成的前端站点文件
└── 快速启动.cmd           # Windows 统一启动入口
```

## 开发与测试

在项目根目录执行，先按快速开始准备依赖。后端测试另需安装 `pytest`。

```powershell
# 后端
.\.venv\Scripts\python.exe -m pip install pytest
.\.venv\Scripts\python.exe -m pytest backend/tests -q

# 前端
npm test -- --watchAll=false --runInBand
npm run build
```

测试应使用合成账户与账单，不连接个人真实财务数据。测试数量会随分支变化，以本次运行结果为准；本 README 不使用固定测试数量或未经配置的 CI 徽章作为质量承诺。

## 部署说明

公开部署与本机演示使用不同的安全配置：关闭 `DEV_MODE`，配置真实认证、持久化数据库、随机 `SECRET_KEY`、HTTPS 与允许的跨域来源；不要把开发启动器直接作为公网生产服务。

GitHub Pages 只能托管静态前端，完整功能需要单独部署后端，并在构建时配置 `REACT_APP_API_URL`。存在静态站点文件不代表在线 API 已经可用。详细步骤见[使用说明](docs/使用说明.md)。

<a id="project-status"></a>
## 项目状态与演进

项目处于持续开发阶段，适合本地体验、课程研究与功能验证。知识内容审核、真实服务联调和推荐效果评价仍需持续完善。

**本次增强**：已纳入花销钱币可视化、知识来源增量更新、播客候选兜底及全站交互修复。动态知识来源在新环境默认停用，启用后自动筛选；默认人工发布，逐来源确认使用范围后可启用合格基础内容自动发布；本地已采集文章和用户数据不随源码上传。

本地回退脚本依赖 `tmp/` 中对应的修改前快照，这些快照不随仓库分发；新克隆环境请通过 Git 历史管理代码回退，并单独备份数据库。

后续方向见[长期迭代思路](docs/青盈长期迭代里程思路.md)。

</details>

## 持续改进

每轮聚焦两项可验收的问题：**功能与可靠性**，以及**使用体验与表达**。从实际场景出发，依次完成问题确认、实现、相关验证、自我复核和版本同步。详细记录见[任务台账](docs/持续改进任务台账.md)，验收与回退流程见[工作约定](docs/持续改进工作约定.md)。本地后台调度由维护者配置，运行取决于应用、项目、网络与额度可用。

产品版本从 **v1.0** 起按整数序号递增，`v1.9` 后是 `v1.10`。每批验收交付更新一次，历史改动见[版本记录](CHANGELOG.md)。

v1.2 聚焦首笔记账、保存反馈和资金未知状态。v1.1 的三步前置教学已撤回，历史标签保留；新版本不复用已撤回的编号。

维护 README 时，可在根目录运行 `python scripts/check_readme.py` 检查本地文档与图片路径、显式导航锚点、图片替代文字及折叠结构；远程链接与视觉呈现需另行核验。

<a id="documentation"></a>
## 文档导航

| 文档 | 适合什么时候阅读 |
| --- | --- |
| [完整使用说明](docs/使用说明.md) | 配置、启动、账单导入与排查问题 |
| [功能与技术](docs/目前版本实现的功能及其对应的技术.md) | 了解功能范围与对应实现 |
| [资金与推荐模块定义](docs/财务推荐v2模块定义.md) | 核对资金口径、不可变快照与服务边界 |
| [AI 教练与 HSTU](docs/AI教练与HSTU实现说明.md) | 准备模型、训练推理与验证机制 |
| [每日推荐接口](docs/每日推荐接口与实施说明.md) | 理解推荐流程、反馈与兼容规则 |
| [播客采集与审核](docs/播客三阶段升级与运行说明.md) | 配置内容发现、增量采集与人工审核 |
| [OpenAPI schema](docs/api/finance-podcasts.openapi.json) | 对接资金、推荐、反馈与推理接口 |
| [手动收支接口](docs/api/手动收支接口.md) | 对接账单创建与收支记录 |
| [花销钱币可视化](docs/花销钱币可视化第一版.md) | 查看金额拆分、展示边界与功能开关 |
| [知识库持续更新](docs/知识库持续更新实施方案.md) | 配置可信来源、检查内容变化与审核发布 |
| [自动知识库与自适应辅导](docs/自动知识库与自适应辅导实施记录.md) | 实际容量、自动筛选、动作选择、验收与回退 |
| [AI 论文调研与实施方案](docs/青盈AI论文调研与自动知识库方案-20261107.md) | 研究依据、可实现的创新方向与评估边界 |
| [全站交互检查](docs/全站交互检查与修复记录.md) | 查看问题复现、修复及验证范围 |
| [新用户体验减负方案](docs/新用户体验减负方案-20261108.md) | 浏览器走查、问题证据与分阶段改造范围 |
| [v1.2 首笔记账减负](docs/v1.2首笔记账减负实施记录.md) | 已实施范围、模拟验收与回退方式 |
| [持续改进任务台账](docs/持续改进任务台账.md) | 查看已交付任务、验证与后续候选问题 |
| [持续改进工作约定](docs/持续改进工作约定.md) | 了解选题、验证、视觉要求和同步流程 |

<a id="contributing"></a>
## 参与贡献

欢迎提交 [Issue](https://github.com/fairy-song/YouthGain/issues) 或 [Pull Request](https://github.com/fairy-song/YouthGain/pulls)。

1. 先说明问题场景、复现步骤与预期行为；功能改动说明要解决的实际问题。
2. 从自己的分支提交范围清晰的修改，涉及金额时写清计算口径与边界。
3. 运行受影响的测试，修改前端后检查构建，同步更新文档。
4. 提交前检查差异，不上传密钥、服务账号、原始账单、开发数据库或本地备份。

涉及潜在安全漏洞时，请勿在公开 Issue 中附上可利用细节、凭据或个人信息；先通过仓库维护者明确提供的非公开渠道沟通。当前未声明独立的安全响应邮箱。

## 许可与致谢

项目采用 [MIT License](LICENSE)。本项目由 [XiaoCow666 / 财赋思](https://github.com/XiaoCow666/Caifusi) 演进而来，当前由 [fairy-song](https://github.com/fairy-song) 重构与维护；保留原始作者与维护者的版权声明。

青盈用于财商教育、记录与试算，不提供确定收益承诺，也不替代专业金融决策。


---

<p align="center"><strong>让金融知识回到日常生活，让每一次选择更有意识。</strong><br /><sub>YouthGain · 青盈</sub></p>

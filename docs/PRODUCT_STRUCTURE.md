# 青盈的页面职责

主线：记录消费 → 看懂影响 → 做出选择 → 每周回看。

## 四个主入口

| 页面 | 地址 | 职责 |
| --- | --- | --- |
| 首页 | `/` | 保留原有产品介绍、语音记账与功能入口，登录前后使用同一首页 |
| 账本 | `/dashboard` | 默认仅显示消费图表、记账和最近账单 |
| 成长 | `/learning` | 情境练习、消费选择、每周复盘、成长记录 |
| 我的 | `/profile` | 账户信息、财务资料和个人偏好 |

账本二级页使用 `?tab=goals`（储蓄目标）、`?tab=upcoming`（未来开支）、`?tab=analysis`（详细分析）。成长页使用 `?tab=practice`、`?tab=decision`、`?tab=review`、`?tab=growth`。二级页可直接链接，支持刷新和浏览器前进后退。

消费购买比较统一在成长的消费选择页。账本只提供指向此流程的入口，不再维护第二个独立购买计算器；实际记账后的已有反馈保留。

AI 教练不占主导航，但保留 `/coach`。账本、消费选择、复盘和练习可带问题进入；上下文帮助只预填问题，不自动提交，也不改变现有资料授权规则。

自我探索与知识库保留在成长页辅助入口。旧 `/learning?tab=profile` 链接重定向到 `/profile`。资料、目标和未来开支沿用原接口与存储，不迁移或删除用户数据。

## 组件边界

- `services/navigation.js`：桌面和移动端共用四个主入口。
- `components/SectionNav.js`：统一二级导航。
- `components/CoachHelp.js`：带返回路径的情境帮助。
- `pages/Profile.js`：独立资料加载、编辑和保存。
- `components/UpcomingExpenses.js`：未来开支的创建与处理状态。
- `components/ledger/LedgerGoals.js`：储蓄目标管理呈现。
- `components/ledger/LedgerAnalysis.js`：详细收支与模式分析呈现。

新增功能应先确定所属页面；不要在主导航或其他页面复制一套同用途流程。

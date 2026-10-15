# AI 教练与 HSTU 实现说明

本次把项目书中的 AI 教练与个性化推荐落实为项目内可运行的代码。实现时间为 2026 年 10 月 14—15 日。中文检索模型已在本机下载，HSTU 已完成合成数据训练，本地配置已启用对应模型；尚未采集或使用真实校园数据训练推荐网络。

## 1. AI 教练

流程为：识别本轮任务与连续追问 → 混合知识检索 → 按授权读取所需财务数据并计算 → 大模型解释 → 数值与来源检查 → 展示回答及依据。

| 阶段 | 实现 | 对应功能 |
| --- | --- | --- |
| 任务与连续追问 | `coach_tools.understand` 规则分类，短追问结合最近用户问题；不将助手假设作为用户输入 | 知识解释、方案比较、资金规划 |
| 知识检索 | 中文 BM25 + BGE-small-zh-v1.5 向量 + RRF（k=60）+ BGE-reranker-base Cross-Encoder | 查询对应知识片段；改写问法也能召回 |
| 财务工具 | 复用消费决策、资金快照与目标规划计算；明确标注情境输入、记录范围和未知项 | 已记录开支、结余估算、资金预留、目标缺口与等价结余天数 |
| 数值与解释分工 | 程序保留事实值，模型接收事实占位、正负状态与已计算比较；输出后由程序填数 | 模型无法直接改写最终金额；资金口径与假设随依据展示 |
| 回复检查 | JSON/正文格式、事实编号、金额与单位绑定、来源编号、片段词面关联；失败后重试一次 | 排查编造金额、错误单位、不存在的来源；必要时返回标注的程序事实 |
| 页面展示 | `CoachEvidence` 区分实际引用与仅检索的片段；切换账号或撤回授权使旧请求失效 | 展开依据、复核计算、控制资料引用 |

知识索引只缓存公共文章，文章内容发生变化会更新索引；用户流水不进入公共索引。用户没有明确允许引用记录时，不读取个人财务资料。通用知识问题即使允许学习资料，也不调用财务流水工具。场景数值只从用户明确标注的输入计算，不从助手历史假设取数。

等价结余天数为 `D = 30 × C / S`，其中 C 为明确试算金额，S 为历史估算月结余。仅在 S 为正、记录跨度至少三十天且未发现无效或截断记录时计算。它是按固定历史结余折算的积累时间，不是目标实际延迟。估算收支差、本月可用剩余和规划后的余量分别命名。

当前来源检查核对编号、片段及有限词面关联，未实现完整语义蕴含证明。格式通过、来源匹配、数值绑定均不能证明所有观点正确，也不能证明金融素养已经提升。

## 2. 项目内 HSTU

`hstu_model.py` 实现 PyTorch 网络，`hstu_runtime.py` 统一训练和推理的预处理。网络采用论文中的 HSTU 主体机制：SiLU 点式 U/V/Q/K 投影、带相对位置和相对时间偏置的因果注意力、注意力输出与 U 的乘性门控、归一化及残差。当前是适合校园原型和 CPU 部署的小型适配，不是论文中工业规模生成式推荐系统的完整复现。[HSTU 原论文](https://arxiv.org/pdf/2402.17152v3)

实际输入与任务如下：

- 行为序列：单集 ID、内容与主题、点击/收藏/不感兴趣/有帮助/恢复等动作、行为发生时间。最多读取一百个历史事件，网络使用最近六十四个；所有事件须严格早于快照时点，时间顺序无效则拒绝推理。
- 内容表示：稳定哈希的可训练 ID/文本特征；已知节目可以使用历史内容，新单集也可使用标题、简介与主题。文本主导，避免只有已见 ID 才能推荐；哈希碰撞属于当前轻量实现的限制。
- 当前情境：固定顺序的二十五个财务缩放特征、对应缺失掩码，以及推荐时明确的学习主题。未知不能被当作真实零值。
- 候选精排：因果序列表示结合候选相关的历史聚合、财务状态和主题，分别输出点击与有帮助得分，当前综合权重为 0.35 与 0.65。这是工程初始权重，尚未经过校园数据调优。输出尚未做概率校准，有帮助反馈不等于金融素养提升。

候选进入网络前仍需通过内容审核、质量、语言、难度、有效链接及最近三十日排除规则。网络不会自动生成文章或改动资金账目；理由和金额来自规则与冻结快照。当天推荐固定，切换模型不重排已生成的当天结果。

每日推荐现已保存 `rank_input`，用于核对当时的候选、行为和情境。只记录某个单集没有点击，不能将其余未曝光候选记为负样本；后续训练必须另外取得研究授权并准备脱敏数据。系统没有自动导出或训练真实用户记录。

## 3. 安装、启用与训练

在项目根目录运行。Windows 命令中的 `.venv/Scripts/python.exe` 在 Linux 换成 `.venv/bin/python`。

```powershell
.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
.venv/Scripts/python.exe -m pip install -r backend/requirements-ai.txt
.venv/Scripts/python.exe backend/prepare_coach_models.py
.venv/Scripts/python.exe backend/train_hstu.py --demo --output models/hstu-demo --epochs 6
.venv/Scripts/python.exe backend/configure_local_ai.py
```

本机已经完成上述步骤。重启后端后生效；若当天已经生成推荐，按原有规则继续显示当天结果，新日期才应用新模型。检索模型不会在网页请求期间下载。首次加载两套中文模型有明显开销，部署时应在验收请求前预热并实测内存和响应时间。模型下载脚本记录公开仓库与确切 revision。

本地演示配置如下，已有 API 密钥及数据库配置保持原值：

```dotenv
COACH_RETRIEVAL_MODE=hybrid
COACH_EMBEDDING_PATH=models/coach/embedding
COACH_RERANKER_PATH=models/coach/reranker
PODCAST_RANKER_MODE=local_hstu
PODCAST_HSTU_MODEL_PATH=models/hstu-demo/model.pt
PODCAST_HSTU_ALLOW_DEMO=true
```

模式：`local_hstu` 应用项目权重；`local_shadow` 只记录得分并保留规则结果；`baseline` 为规则排序；`hstu/shadow` 保留外部服务兼容协议。权重缺失、特征不匹配、资金来源不完整或外部请求异常时报告降级原因并回退。生产环境会拒绝 demo 权重，即使允许演示的开关为 true 也无法绕过。

真实训练数据目录须包含 `train.jsonl`、`validation.jsonl` 和 `test.jsonl`。每行字段为：

```json
{
  "participant_id": "anonymous-participant",
  "consent_for_training": true,
  "payload": {
    "feature_version": "finance-context-v2",
    "snapshot_id": "immutable-snapshot-id",
    "as_of": "2026-10-01T12:00:00+08:00",
    "features": {},
    "missing_mask": {},
    "history": [],
    "learning_topic": "预算管理",
    "candidates": []
  },
  "labels": {"exposed-episode-id": [1, null]},
  "feedback_observed_at": "2026-10-01T13:00:00+08:00"
}
```

上面展示字段结构，空的 features/mask/candidates 不能用于训练。实际财务字段须完整对应 `hstu_runtime.FEATURE_NAMES`，候选结构见 [接口协议](api/finance-podcasts.openapi.json)。标签顺序为点击、有帮助；null 表示未观察，不能填成零。输入必须来自当时冻结的快照，历史行为早于 as_of，反馈发生在决策之后。训练集的最后反馈须早于验证集最早决策，验证集同理早于测试集；同一快照不能重复。

```powershell
.venv/Scripts/python.exe backend/train_hstu.py --data path/to/consented-data --output models/hstu --epochs 6
```

训练脚本保存最佳验证损失对应的权重、模型版本、数据摘要、训练步数与评估报告；包含相同候选下的规则对比及历史、资金、时间、动作消融。排名指标只使用已观察标签且同时有正负候选的查询；单个正样本不能提供有意义的排序验证。离线观察性反馈存在选择偏差，正式上线仍须独立评测。demo 指标只验证代码运行与收敛，不能写成真实用户指标。

正式应用将权重路径改为 `models/hstu/model.pt`，关闭允许演示开关。若采用独立服务，设置 `PODCAST_HSTU_API_KEY` 后运行 `backend/hstu_server.py`；它默认只绑定 127.0.0.1:5051，`/rank` 要求 Bearer 服务密钥。无需独立服务时直接使用 local_hstu。

## 4. 验证与结果范围

本次新增验证涵盖：真实网络前向/反向、因果掩码、候选顺序不变性、基线分数不作为神经网络输入、训练时间切分、未知特征掩码、异常与未训练权重、生产环境拒绝 demo、每日 API 应用实际权重、授权和账号隔离、财务事实与单位绑定、源片段检查以及失败回退。

完整回归与后续定向检查合计覆盖后端 316 个测试用例、前端 130 个用例。完整检查中发现的历史时点准备、追问上下文及过期文案断言已修正，相关后端 99 项、数值渲染 24 项和练习页 14 项复查通过。前端生产构建成功，仍有其他页面原有的未使用变量与链接提示；本地启动检查通过。具体运行批次与范围见 `output/ai-upgrade/verification-summary.json`。

最后的 HSTU 服务与财务快照检查 40 项通过，并将每月收入到期测试固定在明确日期，避免午夜跨日改变结果。已重启本地前端与后端，API 代理及当前代码编译均就绪，可访问 http://localhost:3000/#/。

真实模型烟雾验证命令：

```powershell
.venv/Scripts/python.exe backend/verify_ai_upgrade.py
# 以下选项会调用已经配置的 AI 服务，仅使用脚本内合成情境：
.venv/Scripts/python.exe backend/verify_ai_upgrade.py --live-coach
```

实际中文模型在四个合成问题上均召回预期主题，域外测试未返回来源；这只是小规模通路检查，不是检索准确率的正式评估。真实 AI 联调已验证事实占位生成与程序填数，未读取个人财务记录。模型报告位于 `output/ai-upgrade/model-smoke.json`；演示训练报告位于 `models/hstu-demo/evaluation.json`，均须保留其合成数据标签。

工程测试结果只证明所检查的行为。尚未完成真实校园推荐评估、概率校准或金融素养教育效果验证。

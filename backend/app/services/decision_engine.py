"""决策引擎：把消费数据换算成行为后果。

设计约定（重要）：

1. **纯函数模块。** 不连接数据库、不调用 AI、不依赖 Flask 上下文。
   所有函数只依赖传入的参数，同样输入必得同样输出——这是实验可复现的前提。
2. **只做数值计算，不做价值判断。** 引擎算出"推迟 68 天"，由解释层决定怎么说。
   引擎里不出现"建议""应该""推荐"这类字眼。
3. **不涉及任何金融产品。** 所有计算只基于用户自己的收支数据，不引入收益率、
   不比较投资方案——这既是产品定位，也是合规边界。

调用关系::

    前端展示  ←──┐
                  │
    AI 解释层 ←──┼── decision_engine
                  │
    实证数据  ←──┘

典型用法::

    report = build_report(
        transactions=[...],
        goals=[...],
        monthly_income=2000,
    )
    report.monthly_surplus              # 350.0
    report.patterns[0].title            # "发生活费后 3 天消费集中"
"""

from __future__ import annotations

import calendar
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Sequence

__all__ = [
    # 数据类型
    "Transaction",
    "Goal",
    "SpendingBreakdown",
    "OpportunityCost",
    "GoalFeasibility",
    "Pattern",
    "RegretSummary",
    "DecisionReport",
    # 计算函数
    "classify_expenses",
    "calculate_surplus",
    "calculate_opportunity_cost",
    "assess_goal_feasibility",
    "detect_patterns",
    "summarize_regret",
    "build_report",
]


# ============================================================
# 算法参数
# ============================================================

DAYS_PER_MONTH = 30
"""每月按 30 天折算，用于日均结余与月数推算。"""

FIXED_CV_THRESHOLD = 0.20
"""固定支出判定阈值：类别的月度金额变异系数（标准差/均值）低于此值视为固定。"""

FIXED_MIN_MONTH_COVERAGE = 0.60
"""固定支出判定阈值：类别需覆盖统计区间内至少 60% 的月份。"""

FIXED_MAX_TXNS_PER_MONTH = 2.0
"""固定支出判定阈值：每月平均笔数上限。

固定支出通常是「周期性的一次性支出」（房租、话费、会员费），每月也就一两笔。
而每月发生三次以上的类别，无论金额多稳定都属于可变动的消费习惯——
典型如每月点四次外卖，金额一样也仍然是「可以少点几次」的钱。
仅靠金额波动判定会把这类习惯性消费误判成固定支出，使干预范围被错误压缩。
"""

POST_INCOME_WINDOW_DAYS = 3
"""「发薪后消费集中」的观察窗口长度（天）。"""

POST_INCOME_SPIKE_RATIO = 2.0
"""窗口内支出占比达到平均水平的多少倍才算「集中」。"""

WEEKEND_SPIKE_RATIO = 1.5
"""周末日均支出达到工作日的多少倍才算「偏高」。"""

CATEGORY_DRIFT_RATIO = 0.30
"""某类别后半段均值较前半段上升多少比例才算「持续上升」。"""

SMALL_AMOUNT_THRESHOLD = 30.0
"""「高频小额」的单笔金额上限（元）。"""

SMALL_FREQUENT_TOTAL_SHARE = 0.10
"""「高频小额」累计金额需占到总支出多少比例才值得提示。"""

REGRET_CLUSTER_RATE = 0.50
"""某类别的后悔率达到多少才算「后悔集中」。"""


# ============================================================
# 内部工具
# ============================================================

def _jsonable(value):
    """递归地把 date 转成 ISO 字符串，使结果可直接 JSON 序列化。"""
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    return value


def _to_dict(obj) -> dict:
    return _jsonable(asdict(obj))


def _parse_date(value) -> date:
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value)
    raise ValueError(f"无法解析日期: {value!r}")


def _days_in_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def _months_spanned(transactions: Sequence["Transaction"]) -> float:
    """推算记录覆盖的月数，按天数折算（每月 30 天）。至少返回 1.0。

    用天数而非自然月差值，是为了避免"1月15日到2月15日"被算成 2 个月
    而把月均支出腰斩。
    """
    if not transactions:
        return 1.0
    dates = [t.date for t in transactions]
    span_days = (max(dates) - min(dates)).days + 1
    return max(1.0, span_days / DAYS_PER_MONTH)


def _month_key(d: date) -> tuple[int, int]:
    return (d.year, d.month)


def _days_since_income(d: date, income_day: int) -> int:
    """d 距离当月发薪日过了几天。发薪日之前为负数。"""
    anchor = date(d.year, d.month, min(income_day, _days_in_month(d.year, d.month)))
    return (d - anchor).days


# ============================================================
# 数据类型
# ============================================================

@dataclass
class Transaction:
    """一笔消费记录。

    这是整个引擎的输入单元，对应记账动作产生的一条数据。
    """

    amount: float
    """消费金额（元），必须 > 0。"""

    category: str
    """消费类别，如 "外卖" / "交通" / "房租"。用于固定/变动判定与分类统计。"""

    date: date
    """消费发生的日期。用于周期性分析。"""

    merchant: str = ""
    """商户名，可选。用于后续的商户自动分类。"""

    note: str = ""
    """用户备注，可选。"""

    hour: int | None = None
    """消费发生的小时（0-23），可选。

    用于「深夜消费」模式识别。支付宝/微信账单导出含时间戳，
    手动记账通常没有——缺失时该模式会被自动跳过，不影响其他分析。
    """

    regret: bool | None = None
    """事后回访结果：这笔消费现在回头看是否后悔。

    - ``None``  尚未回访（默认）
    - ``True``  用户表示后悔
    - ``False`` 用户表示不后悔
    """

    @classmethod
    def from_dict(cls, data: dict) -> "Transaction":
        """从 API 传入的字典构造。``date`` 接受 ``date`` 对象或 ``"YYYY-MM-DD"`` 字符串。"""
        hour = data.get('hour')
        return cls(
            amount=float(data['amount']),
            category=str(data['category']),
            date=_parse_date(data['date']),
            merchant=str(data.get('merchant') or ''),
            note=str(data.get('note') or ''),
            hour=int(hour) if hour is not None else None,
            regret=data.get('regret'),
        )

    def to_dict(self) -> dict:
        return _to_dict(self)


@dataclass
class Goal:
    """一个储蓄目标。

    「给目标起名」是心理账户机制的产品化——叫"相机基金"比叫"储蓄"更能坚持。
    """

    name: str
    """目标名称，如 "相机" / "演唱会门票"。"""

    target_amount: float
    """目标金额（元），必须 > 0。"""

    saved_amount: float = 0.0
    """已存金额（元），默认 0。"""

    deadline: date | None = None
    """期望达成日期。为 ``None`` 时只计算"需要几个月"，不判断是否按期达成。"""

    @classmethod
    def from_dict(cls, data: dict) -> "Goal":
        """从 API 传入的字典构造。"""
        deadline = data.get('deadline')
        return cls(
            name=str(data['name']),
            target_amount=float(data['target_amount']),
            saved_amount=float(data.get('saved_amount') or 0.0),
            deadline=_parse_date(deadline) if deadline else None,
        )

    def to_dict(self) -> dict:
        return _to_dict(self)


@dataclass
class SpendingBreakdown:
    """支出结构：把消费拆成"改不了的"和"改得了的"。"""

    fixed_total: float
    """固定支出合计（元）。房租、学费、通勤等每月稳定发生的部分。"""

    variable_total: float
    """变动支出合计（元）。外卖、奶茶、网购等可以调整的部分。"""

    total: float
    """总支出（元）= fixed_total + variable_total。"""

    by_category: dict[str, float]
    """各类别支出金额，``{类别: 金额}``。"""

    fixed_categories: list[str]
    """被判定为固定支出的类别列表。

    供解释层使用："你本月支出 3800，其中固定 2400，
    真正可支配的只有 1400"——避免用户把无力感错误归因到自己身上。
    """

    def to_dict(self) -> dict:
        return _to_dict(self)


@dataclass
class OpportunityCost:
    """单笔消费的机会成本。

    这是产品的核心机制——把未来的损失拉到当下可见，对抗现时偏误。
    """

    amount: float
    """该笔消费金额（元）。"""

    delay_days: float
    """这笔消费使目标推迟的天数。

    计算方式：``消费金额 ÷ 日均结余``，其中日均结余 = 月结余 ÷ 30。
    结果随用户自身收支水平变化——月结余 350 的人买 800 元的鞋，
    与月结余 1000 的人买同样的鞋，推迟天数完全不同。
    """

    surplus_ratio: float
    """该笔消费占月结余的比例。1.0 表示刚好花掉一个月结余。"""

    def to_dict(self) -> dict:
        return _to_dict(self)


@dataclass
class GoalFeasibility:
    """单个目标的可达性评估。"""

    goal_name: str
    remaining: float
    """还差多少（元）= target_amount - saved_amount，下限为 0。"""

    months_needed: float | None
    """按当前月结余，还需要几个月才能达成。

    月结余 <= 0 时为 ``None``（无法通过储蓄达成）。
    """

    monthly_required: float | None
    """若要在 deadline 前达成，每月需要存多少（元）。

    未设置 deadline，或月结余 <= 0 时为 ``None``。
    """

    status: str
    """可达性判定，取值为下列之一：

    - ``"已达成"``    remaining <= 0
    - ``"可达"``      按当前结余，在 deadline 前能存够
    - ``"需延期"``    按当前结余存不够（含期限已到仍未存够）
    - ``"无法达成"``  月结余 <= 0，目标无法通过储蓄达成
    - ``"未知"``      未设置 deadline，只给出 months_needed
    """

    shortfall: float
    """每月资金缺口（元）= monthly_required - 月结余，下限为 0。"""

    def to_dict(self) -> dict:
        return _to_dict(self)


@dataclass
class Pattern:
    """从消费记录中发现的一条行为模式。

    这是本模块的算法核心，也是用户自己看不见、只有系统能算出来的东西。
    """

    kind: str
    """模式类型，取值见 ``detect_patterns`` 文档。"""

    title: str
    """给人看的一句话结论，如 "发生活费后 3 天消费集中"。"""

    detail: str
    """带具体数字的展开描述，直接可展示或交给 AI 复述。"""

    severity: str
    """重要程度：``"info"`` 提示 / ``"warning"`` 值得注意。"""

    evidence: dict
    """支撑该模式成立的原始数据，供论文分析使用。"""

    def to_dict(self) -> dict:
        return _to_dict(self)


@dataclass
class RegretSummary:
    """后悔消费汇总。

    「一周后回访这笔值吗」的产出。后悔率是行为改变最强的预测因子之一，
    且这是用户**自己的**后悔数据，比任何通用建议都有说服力。
    """

    reviewed_count: int
    """已完成回访的消费笔数。"""

    regret_count: int
    """其中表示后悔的笔数。"""

    regretted_total: float
    """后悔的消费合计金额（元）。"""

    regret_rate: float
    """后悔率 = regret_count / reviewed_count。未回访时返回 0.0。

    注意：样本少于若干笔时该比值不具参考意义，展示层应自行判断。
    """

    def to_dict(self) -> dict:
        return _to_dict(self)


@dataclass
class DecisionReport:
    """一次完整的决策分析结果。

    这是给上层的唯一出口：前端和 AI 解释层都只调用 ``build_report``
    拿到这一个对象，不需要逐个调用底层函数。
    """

    monthly_income: float
    """月收入（元）。"""

    monthly_surplus: float
    """月结余（元）= 月收入 − 月均支出。可能为负。"""

    spending: SpendingBreakdown
    """支出结构。"""

    goal_feasibility: list[GoalFeasibility]
    """每个目标的可达性。"""

    patterns: list[Pattern]
    """发现的行为模式，按 severity 降序。"""

    regret: RegretSummary
    """后悔消费汇总。"""

    warnings: list[str] = field(default_factory=list)
    """计算过程中值得提示的异常，如"数据不足 2 个月，无法自动识别固定支出"。

    这些是给开发者和解释层看的，不是给用户看的。
    """

    def to_dict(self) -> dict:
        """转为可 JSON 序列化的字典，供 API 直接返回。"""
        return _to_dict(self)


# ============================================================
# 计算函数
# ============================================================

def _validate_transactions(transactions: Sequence[Transaction]) -> None:
    if not transactions:
        raise ValueError("消费记录不能为空")
    for t in transactions:
        if t.amount <= 0:
            raise ValueError(f"消费金额必须大于 0，收到: {t.amount}")


def _detect_fixed_categories(
    transactions: Sequence[Transaction],
) -> list[str]:
    """自动识别固定支出类别。

    判定条件（需同时满足）：

    1. 覆盖统计区间内至少 60% 的月份
    2. 各月金额的变异系数（标准差 / 均值）<= FIXED_CV_THRESHOLD
    3. 每月平均笔数 <= FIXED_MAX_TXNS_PER_MONTH

    条件 3 不能省：仅看金额稳定性会把"每月点四次、每次金额都一样"的外卖
    误判成固定支出，而这类消费恰恰是用户最应该调整的部分。

    识别不出时返回空列表——宁可把类别当变动支出（干预范围大一些），
    也不要把变动支出误判成固定的（会让用户觉得"我根本改不了"）。

    注意：本函数识别的是"稳定"，不完全等于"不可规避"。
    用户显式声明的 ``fixed_categories`` 优先级更高，应允许纠正自动判定。
    """
    months = {_month_key(t.date) for t in transactions}
    if len(months) < 2:
        return []

    by_category: dict[str, dict[tuple[int, int], float]] = {}
    txn_counts: dict[str, int] = {}
    for t in transactions:
        by_category.setdefault(t.category, {})
        key = _month_key(t.date)
        by_category[t.category][key] = by_category[t.category].get(key, 0.0) + t.amount
        txn_counts[t.category] = txn_counts.get(t.category, 0) + 1

    min_coverage = max(2, int(len(months) * FIXED_MIN_MONTH_COVERAGE + 0.5))
    fixed: list[str] = []

    for category, monthly in by_category.items():
        covered_months = len(monthly)
        if covered_months < min_coverage:
            continue

        # 条件 3：每月平均笔数过多，说明是高频消费习惯而非固定账单
        if txn_counts[category] / covered_months > FIXED_MAX_TXNS_PER_MONTH:
            continue

        amounts = list(monthly.values())
        mean = sum(amounts) / len(amounts)
        if mean <= 0:
            continue
        variance = sum((a - mean) ** 2 for a in amounts) / len(amounts)
        cv = (variance ** 0.5) / mean
        if cv <= FIXED_CV_THRESHOLD:
            fixed.append(category)

    return sorted(fixed)


def classify_expenses(
    transactions: Sequence[Transaction],
    *,
    fixed_categories: Sequence[str] | None = None,
) -> SpendingBreakdown:
    """把消费记录拆分成固定支出与变动支出。

    固定支出的判定方式：

    - 若传入 ``fixed_categories``，按其判定（用户或系统预先声明）；
    - 否则自动识别：跨月出现且金额波动小的类别视为固定
      （需要至少跨越 2 个自然月的数据，否则无法判断）。

    Args:
        transactions: 消费记录列表。
        fixed_categories: 预先声明的固定支出类别。为 ``None`` 时自动识别。

    Returns:
        SpendingBreakdown。数据不足时 ``fixed_categories`` 为空列表。

    Raises:
        ValueError: 记录为空，或存在 ``amount <= 0`` 的记录。
    """
    _validate_transactions(transactions)

    if fixed_categories is None:
        fixed_list = _detect_fixed_categories(transactions)
    else:
        fixed_list = sorted({str(c) for c in fixed_categories})

    fixed_set = set(fixed_list)
    by_category: dict[str, float] = {}
    fixed_total = 0.0
    variable_total = 0.0

    for t in transactions:
        by_category[t.category] = by_category.get(t.category, 0.0) + t.amount
        if t.category in fixed_set:
            fixed_total += t.amount
        else:
            variable_total += t.amount

    return SpendingBreakdown(
        fixed_total=round(fixed_total, 2),
        variable_total=round(variable_total, 2),
        total=round(fixed_total + variable_total, 2),
        by_category={k: round(v, 2) for k, v in sorted(by_category.items())},
        fixed_categories=fixed_list,
    )


def calculate_surplus(
    monthly_income: float,
    transactions: Sequence[Transaction],
    *,
    months: float | None = None,
) -> float:
    """计算月结余。

    Args:
        monthly_income: 月收入（元）。
        transactions: 消费记录列表。
        months: 统计区间覆盖的月数。为 ``None`` 时按记录的日期跨度自动推算
            （不足 1 个月按 1 个月计，避免月初数据导致结余被严重高估）。

    Returns:
        月结余（元）= 月收入 − 月均支出。**可能为负**，调用方需自行处理。

    Raises:
        ValueError: months 显式传入且 <= 0。
    """
    if months is not None and months <= 0:
        raise ValueError(f"月数必须大于 0，收到: {months}")
    if not transactions:
        return round(monthly_income, 2)

    span = months if months is not None else _months_spanned(transactions)
    total = sum(t.amount for t in transactions)
    return round(monthly_income - total / span, 2)


def calculate_opportunity_cost(
    amount: float,
    monthly_surplus: float,
    *,
    days_per_month: int = DAYS_PER_MONTH,
) -> OpportunityCost:
    """计算单笔消费的机会成本。

    这是"这笔 800 元 = 目标推迟 68 天"背后的算法。

    Args:
        amount: 消费金额（元），需 >= 0。
        monthly_surplus: 用户月结余（元），需 > 0。
        days_per_month: 每月按多少天折算，默认 30。

    Returns:
        OpportunityCost。

    Raises:
        ValueError: amount < 0，或 monthly_surplus <= 0。

    Note:
        月结余 <= 0 时抛异常而非返回无穷大：没有结余的情况下
        "推迟多少天"没有意义，调用方应先处理"入不敷出"这个更根本的问题。
    """
    if amount < 0:
        raise ValueError(f"消费金额不能为负，收到: {amount}")
    if monthly_surplus <= 0:
        raise ValueError(
            f"月结余必须大于 0 才能计算机会成本，收到: {monthly_surplus}。"
            "用户处于入不敷出状态，应先处理结余为负的问题。"
        )

    daily_surplus = monthly_surplus / days_per_month
    return OpportunityCost(
        amount=round(amount, 2),
        delay_days=round(amount / daily_surplus, 1),
        surplus_ratio=round(amount / monthly_surplus, 3),
    )


def assess_goal_feasibility(
    goal: Goal,
    monthly_surplus: float,
    *,
    today: date | None = None,
) -> GoalFeasibility:
    """评估单个储蓄目标的可达性。

    采用无收益的线性储蓄模型：``每月需存 = 剩余金额 ÷ 剩余月数``。
    刻意不引入收益率——既避免让产品沾上投资建议的边界，
    也符合目标用户"小额储蓄、期限较短"的实际情形。

    Args:
        goal: 目标。
        monthly_surplus: 用户月结余（元）。
        today: 基准日期，默认取当天。传入固定值便于测试与实验复现。

    Returns:
        GoalFeasibility。

    Raises:
        ValueError: goal.target_amount <= 0。
    """
    if goal.target_amount <= 0:
        raise ValueError(f"目标金额必须大于 0，收到: {goal.target_amount}")

    today = today or date.today()
    remaining = round(max(0.0, goal.target_amount - goal.saved_amount), 2)

    if remaining <= 0:
        return GoalFeasibility(
            goal_name=goal.name,
            remaining=0.0,
            months_needed=0.0,
            monthly_required=0.0,
            status="已达成",
            shortfall=0.0,
        )

    if monthly_surplus <= 0:
        return GoalFeasibility(
            goal_name=goal.name,
            remaining=remaining,
            months_needed=None,
            monthly_required=None,
            status="无法达成",
            shortfall=0.0,
        )

    months_needed = round(remaining / monthly_surplus, 1)

    if goal.deadline is None:
        return GoalFeasibility(
            goal_name=goal.name,
            remaining=remaining,
            months_needed=months_needed,
            monthly_required=None,
            status="未知",
            shortfall=0.0,
        )

    months_left = (goal.deadline - today).days / DAYS_PER_MONTH

    if months_left <= 0:
        # 期限已到（或已过）但尚未存够
        return GoalFeasibility(
            goal_name=goal.name,
            remaining=remaining,
            months_needed=months_needed,
            monthly_required=None,
            status="需延期",
            shortfall=remaining,
        )

    monthly_required = round(remaining / months_left, 2)
    shortfall = round(max(0.0, monthly_required - monthly_surplus), 2)
    status = "可达" if shortfall <= 0 else "需延期"

    return GoalFeasibility(
        goal_name=goal.name,
        remaining=remaining,
        months_needed=months_needed,
        monthly_required=monthly_required,
        status=status,
        shortfall=shortfall,
    )


def _detect_post_income_spike(
    transactions: Sequence[Transaction],
    income_day: int | None,
    min_occurrences: int,
) -> list[Pattern]:
    """发生活费后若干天内消费显著集中。"""
    if income_day is None:
        return []

    by_month: dict[tuple[int, int], list[Transaction]] = {}
    for t in transactions:
        by_month.setdefault(_month_key(t.date), []).append(t)

    fair_share = POST_INCOME_WINDOW_DAYS / DAYS_PER_MONTH
    hits = []

    for (year, month), txns in sorted(by_month.items()):
        month_total = sum(t.amount for t in txns)
        if month_total <= 0:
            continue
        window_total = sum(
            t.amount for t in txns
            if 0 <= _days_since_income(t.date, income_day) <= POST_INCOME_WINDOW_DAYS
        )
        share = window_total / month_total
        if share >= fair_share * POST_INCOME_SPIKE_RATIO:
            hits.append({
                "month": f"{year}-{month:02d}",
                "window_amount": round(window_total, 2),
                "month_amount": round(month_total, 2),
                "share": round(share, 3),
            })

    if len(hits) < min_occurrences:
        return []

    avg_share = sum(h["share"] for h in hits) / len(hits)
    return [Pattern(
        kind="post_income_spike",
        title=f"发生活费后 {POST_INCOME_WINDOW_DAYS} 天消费集中",
        detail=(
            f"你最近 {len(hits)} 个月里，生活费到账后 {POST_INCOME_WINDOW_DAYS} 天内的支出"
            f"平均占到当月总额的 {avg_share:.0%}——"
            f"而这段时间只占一个月的 {fair_share:.0%}。"
        ),
        severity="warning",
        evidence={"hit_months": hits, "avg_share": round(avg_share, 3)},
    )]


def _detect_late_night(
    transactions: Sequence[Transaction],
    min_occurrences: int,
) -> list[Pattern]:
    """深夜时段消费占比异常。缺少时间数据时跳过。"""
    timed = [t for t in transactions if t.hour is not None]
    if len(timed) < min_occurrences:
        return []

    late = [t for t in timed if t.hour >= 21 or t.hour < 6]
    if len(late) < min_occurrences:
        return []

    total_amount = sum(t.amount for t in timed)
    late_amount = sum(t.amount for t in late)
    if total_amount <= 0:
        return []

    late_share = late_amount / total_amount
    late_count_share = len(late) / len(timed)

    # 时长占比：21:00-06:00 共 9 小时，占全天 37.5%
    fair_share = 9 / 24
    if late_share < fair_share * 1.3 and late_count_share < fair_share * 1.3:
        return []

    top_category = max(
        {c: sum(t.amount for t in late if t.category == c) for c in {t.category for t in late}}.items(),
        key=lambda kv: kv[1],
    )[0]

    return [Pattern(
        kind="late_night",
        title="深夜消费占比偏高",
        detail=(
            f"你在 21 点后的消费共 {len(late)} 笔、{late_amount:.0f} 元，"
            f"占总消费的 {late_share:.0%}，其中最多的是「{top_category}」。"
        ),
        severity="warning",
        evidence={
            "late_count": len(late),
            "late_amount": round(late_amount, 2),
            "late_share": round(late_share, 3),
            "top_category": top_category,
        },
    )]


def _detect_weekend_spike(
    transactions: Sequence[Transaction],
    min_occurrences: int,
) -> list[Pattern]:
    """周末日均消费显著高于工作日。"""
    weekend = [t for t in transactions if t.date.weekday() >= 5]
    weekday = [t for t in transactions if t.date.weekday() < 5]

    if len(weekend) < min_occurrences or len(weekday) < min_occurrences:
        return []

    weekend_days = len({t.date for t in weekend})
    weekday_days = len({t.date for t in weekday})
    if weekend_days == 0 or weekday_days == 0:
        return []

    weekend_daily = sum(t.amount for t in weekend) / weekend_days
    weekday_daily = sum(t.amount for t in weekday) / weekday_days
    if weekday_daily <= 0:
        return []

    ratio = weekend_daily / weekday_daily
    if ratio < WEEKEND_SPIKE_RATIO:
        return []

    return [Pattern(
        kind="weekend_spike",
        title="周末花费明显高于工作日",
        detail=(
            f"你周末平均每天花 {weekend_daily:.0f} 元，"
            f"工作日平均 {weekday_daily:.0f} 元，是工作日的 {ratio:.1f} 倍。"
        ),
        severity="info",
        evidence={
            "weekend_daily": round(weekend_daily, 2),
            "weekday_daily": round(weekday_daily, 2),
            "ratio": round(ratio, 2),
        },
    )]


def _detect_category_drift(
    transactions: Sequence[Transaction],
    min_occurrences: int,
) -> list[Pattern]:
    """某类别支出逐月上升。"""
    months = sorted({_month_key(t.date) for t in transactions})
    if len(months) < max(min_occurrences, 3):
        return []

    by_category: dict[str, dict[tuple[int, int], float]] = {}
    for t in transactions:
        by_category.setdefault(t.category, {})
        key = _month_key(t.date)
        by_category[t.category][key] = by_category[t.category].get(key, 0.0) + t.amount

    patterns = []
    split = len(months) // 2
    early_months, late_months = months[:split], months[split:]

    for category, monthly in by_category.items():
        early = [monthly[m] for m in early_months if m in monthly]
        late = [monthly[m] for m in late_months if m in monthly]
        if not early or not late:
            continue

        early_avg = sum(early) / len(early)
        late_avg = sum(late) / len(late)
        if early_avg <= 0:
            continue

        growth = (late_avg - early_avg) / early_avg
        if growth < CATEGORY_DRIFT_RATIO:
            continue

        patterns.append(Pattern(
            kind="category_drift",
            title=f"「{category}」支出持续上升",
            detail=(
                f"你的「{category}」从每月约 {early_avg:.0f} 元"
                f"涨到了 {late_avg:.0f} 元，上升了 {growth:.0%}。"
            ),
            severity="warning",
            evidence={
                "category": category,
                "early_avg": round(early_avg, 2),
                "late_avg": round(late_avg, 2),
                "growth": round(growth, 3),
            },
        ))

    return patterns


def _detect_small_frequent(
    transactions: Sequence[Transaction],
    min_occurrences: int,
) -> list[Pattern]:
    """高频小额消费累计金额可观。"""
    total_amount = sum(t.amount for t in transactions)
    if total_amount <= 0:
        return []

    small = [t for t in transactions if t.amount <= SMALL_AMOUNT_THRESHOLD]
    if len(small) < min_occurrences:
        return []

    by_category: dict[str, list[Transaction]] = {}
    for t in small:
        by_category.setdefault(t.category, []).append(t)

    patterns = []
    for category, txns in sorted(by_category.items()):
        if len(txns) < min_occurrences:
            continue
        category_total = sum(t.amount for t in txns)
        share = category_total / total_amount
        if share < SMALL_FREQUENT_TOTAL_SHARE:
            continue

        avg = category_total / len(txns)
        patterns.append(Pattern(
            kind="small_frequent",
            title=f"「{category}」小额高频，累计可观",
            detail=(
                f"你单笔不超过 {SMALL_AMOUNT_THRESHOLD:.0f} 元的「{category}」消费有 "
                f"{len(txns)} 笔，平均每笔 {avg:.0f} 元，"
                f"合计 {category_total:.0f} 元，占总消费的 {share:.0%}。"
            ),
            severity="info",
            evidence={
                "category": category,
                "count": len(txns),
                "total": round(category_total, 2),
                "share": round(share, 3),
            },
        ))

    return patterns


def _detect_regret_cluster(
    transactions: Sequence[Transaction],
    min_occurrences: int,
) -> list[Pattern]:
    """后悔消费集中于特定类别。"""
    reviewed = [t for t in transactions if t.regret is not None]
    if len(reviewed) < min_occurrences:
        return []

    by_category: dict[str, list[Transaction]] = {}
    for t in reviewed:
        by_category.setdefault(t.category, []).append(t)

    patterns = []
    for category, txns in sorted(by_category.items()):
        if len(txns) < min_occurrences:
            continue
        regretted = [t for t in txns if t.regret]
        rate = len(regretted) / len(txns)
        if rate < REGRET_CLUSTER_RATE:
            continue

        regretted_total = sum(t.amount for t in regretted)
        patterns.append(Pattern(
            kind="regret_cluster",
            title=f"「{category}」是后悔高发区",
            detail=(
                f"你回访过的「{category}」消费有 {len(txns)} 笔，"
                f"其中 {len(regretted)} 笔你觉得不值（{rate:.0%}），"
                f"合计 {regretted_total:.0f} 元。"
            ),
            severity="warning",
            evidence={
                "category": category,
                "reviewed": len(txns),
                "regretted": len(regretted),
                "regretted_total": round(regretted_total, 2),
                "rate": round(rate, 3),
            },
        ))

    return patterns


def detect_patterns(
    transactions: Sequence[Transaction],
    *,
    income_day: int | None = None,
    min_occurrences: int = 3,
) -> list[Pattern]:
    """从消费记录中发现用户自己看不见的行为模式。

    这是本模块的算法核心。支持识别的模式类型（``Pattern.kind``）：

    - ``post_income_spike``  发生活费后若干天内消费显著集中
    - ``late_night``         深夜时段消费占比异常（需记录含 hour）
    - ``weekend_spike``      周末消费显著高于工作日
    - ``category_drift``     某类别支出逐月上升
    - ``small_frequent``     高频小额消费累计金额可观
    - ``regret_cluster``     后悔消费集中于特定类别

    每种模式都必须给出 ``evidence`` 原始数据，使结论可被复核——
    这既是产品可信度的要求，也是论文数据分析的基础。

    Args:
        transactions: 消费记录列表。
        income_day: 每月发生活费的日子（1-31）。为 ``None`` 时跳过
            ``post_income_spike`` 的检测。
        min_occurrences: 某模式至少重复出现多少次才认定成立。
            默认 3，用于抑制小样本噪声。

    Returns:
        模式列表，按 ``severity`` 降序（warning 在前）。
        未发现任何模式时返回空列表——**不要为了有输出而编造模式**。

    Raises:
        ValueError: transactions 为空，或存在 amount <= 0 的记录。
    """
    _validate_transactions(transactions)

    if min_occurrences < 1:
        raise ValueError(f"min_occurrences 必须 >= 1，收到: {min_occurrences}")

    patterns: list[Pattern] = []
    patterns += _detect_post_income_spike(transactions, income_day, min_occurrences)
    patterns += _detect_late_night(transactions, min_occurrences)
    patterns += _detect_weekend_spike(transactions, min_occurrences)
    patterns += _detect_category_drift(transactions, min_occurrences)
    patterns += _detect_small_frequent(transactions, min_occurrences)
    patterns += _detect_regret_cluster(transactions, min_occurrences)

    patterns.sort(key=lambda p: 0 if p.severity == "warning" else 1)
    return patterns


def summarize_regret(
    transactions: Sequence[Transaction],
) -> RegretSummary:
    """汇总后悔消费数据。

    只统计 ``regret is not None`` 的记录。回访样本过少时
    ``regret_rate`` 不具参考意义，由展示层负责判断是否呈现。

    Args:
        transactions: 消费记录列表。

    Returns:
        RegretSummary。无任何回访记录时各项为 0。
    """
    reviewed = [t for t in transactions if t.regret is not None]
    if not reviewed:
        return RegretSummary(
            reviewed_count=0,
            regret_count=0,
            regretted_total=0.0,
            regret_rate=0.0,
        )

    regretted = [t for t in reviewed if t.regret]
    return RegretSummary(
        reviewed_count=len(reviewed),
        regret_count=len(regretted),
        regretted_total=round(sum(t.amount for t in regretted), 2),
        regret_rate=round(len(regretted) / len(reviewed), 3),
    )


def build_report(
    transactions: Sequence[Transaction],
    goals: Sequence[Goal],
    monthly_income: float,
    *,
    income_day: int | None = None,
    today: date | None = None,
) -> DecisionReport:
    """一次性完成全部分析，返回给上层的唯一出口。

    前端和 AI 解释层都调用这一个函数，不逐个调用底层函数——
    以保证各处展示的数字来自同一次计算，不会互相矛盾。

    Args:
        transactions: 消费记录列表。
        goals: 储蓄目标列表，可为空。
        monthly_income: 月收入（元）。
        income_day: 每月发生活费的日子，透传给 ``detect_patterns``。
        today: 基准日期，默认取当天。

    Returns:
        DecisionReport。

    Raises:
        ValueError: transactions 为空，或 monthly_income < 0。
    """
    _validate_transactions(transactions)
    if monthly_income < 0:
        raise ValueError(f"月收入不能为负，收到: {monthly_income}")

    warnings: list[str] = []

    months = _months_spanned(transactions)
    spending = classify_expenses(transactions)
    surplus = calculate_surplus(monthly_income, transactions)

    if len({_month_key(t.date) for t in transactions}) < 2:
        warnings.append("数据不足 2 个自然月，无法自动识别固定支出，已全部按变动支出处理")

    if not any(t.regret is not None for t in transactions):
        warnings.append("暂无消费回访数据，后悔率不参与分析")

    if not any(t.hour is not None for t in transactions):
        warnings.append("消费记录不含时间，已跳过深夜消费模式识别")

    if surplus <= 0:
        warnings.append("月结余小于等于 0，目标可达性无法通过储蓄评估")

    feasibility = [
        assess_goal_feasibility(g, surplus, today=today) for g in goals
    ]

    return DecisionReport(
        monthly_income=round(monthly_income, 2),
        monthly_surplus=surplus,
        spending=spending,
        goal_feasibility=feasibility,
        patterns=detect_patterns(transactions, income_day=income_day),
        regret=summarize_regret(transactions),
        warnings=warnings,
    )

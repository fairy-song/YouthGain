"""decision_engine 单元测试。

这些测试同时承担两个作用：

1. 保证数值计算正确——产品信任的基石，算错一次用户就不信了
2. 作为软著与结题材料中的"算法验证"证明

运行方式::

    cd backend && python -m pytest tests/ -v
"""

import json
from datetime import date

import pytest

from app.services.decision_engine import (
    Goal,
    Transaction,
    assess_goal_feasibility,
    build_report,
    calculate_opportunity_cost,
    calculate_surplus,
    classify_expenses,
    detect_patterns,
    summarize_regret,
)


# ============================================================
# 辅助
# ============================================================

def make_transactions(start_month, amounts_by_month, category="餐饮", **kwargs):
    """按月份快速构造消费记录。``amounts_by_month`` 形如 ``{1: [100, 200], 2: [300]}``。"""
    out = []
    for month, amounts in amounts_by_month.items():
        for i, amount in enumerate(amounts):
            out.append(Transaction(
                amount=amount,
                category=category,
                date=date(2026, month, min(1 + i, 28)),
                **kwargs,
            ))
    return out


# ============================================================
# calculate_opportunity_cost —— 产品的核心数字
# ============================================================

class TestOpportunityCost:

    def test_基本换算(self):
        """月结余 350 → 日均 11.67 元 → 800 元的鞋推迟 68.6 天。"""
        result = calculate_opportunity_cost(800, 350)
        assert result.delay_days == 68.6
        assert result.amount == 800
        assert result.surplus_ratio == 2.286

    def test_同样金额_结余越低推迟越久(self):
        """这是产品说服力的来源——数字随用户自身情况变化。"""
        low = calculate_opportunity_cost(800, 200)
        high = calculate_opportunity_cost(800, 1000)
        assert low.delay_days > high.delay_days
        assert low.delay_days == 120.0
        assert high.delay_days == 24.0

    def test_零金额(self):
        result = calculate_opportunity_cost(0, 350)
        assert result.delay_days == 0.0
        assert result.surplus_ratio == 0.0

    def test_负金额报错(self):
        with pytest.raises(ValueError, match="不能为负"):
            calculate_opportunity_cost(-1, 350)

    def test_结余为零报错(self):
        """入不敷出时"推迟多少天"没有意义，应抛错让调用方先处理更根本的问题。"""
        with pytest.raises(ValueError, match="月结余必须大于 0"):
            calculate_opportunity_cost(100, 0)

    def test_结余为负报错(self):
        with pytest.raises(ValueError, match="月结余必须大于 0"):
            calculate_opportunity_cost(100, -50)


# ============================================================
# calculate_surplus
# ============================================================

class TestSurplus:

    def test_单月结余(self):
        txns = [
            Transaction(1000, "餐饮", date(2026, 1, 5)),
            Transaction(500, "外卖", date(2026, 1, 20)),
        ]
        # 跨度 16 天 → 不足一个月按 1 个月计 → 2000 - 1500 = 500
        assert calculate_surplus(2000, txns) == 500.0

    def test_跨月按天数折算(self):
        """1月1日到3月1日共 60 天 = 2 个月，避免月初数据把月均支出腰斩。"""
        txns = [
            Transaction(1200, "餐饮", date(2026, 1, 1)),
            Transaction(1200, "餐饮", date(2026, 3, 1)),
        ]
        # 跨度 (3/1 - 1/1).days + 1 = 60 天 → 2.0 个月 → 2400/2 = 1200
        assert calculate_surplus(2000, txns) == 800.0

    def test_显式指定月数(self):
        txns = [Transaction(3000, "餐饮", date(2026, 1, 1))]
        assert calculate_surplus(2000, txns, months=3) == 1000.0

    def test_入不敷出返回负数(self):
        txns = [Transaction(3000, "餐饮", date(2026, 1, 5))]
        assert calculate_surplus(2000, txns) == -1000.0

    def test_无消费记录(self):
        assert calculate_surplus(2000, []) == 2000.0

    def test_月数非正报错(self):
        with pytest.raises(ValueError, match="月数必须大于 0"):
            calculate_surplus(2000, [], months=0)


# ============================================================
# classify_expenses
# ============================================================

class TestClassifyExpenses:

    def test_显式指定固定类别(self):
        txns = [
            Transaction(1500, "房租", date(2026, 1, 1)),
            Transaction(300, "外卖", date(2026, 1, 5)),
        ]
        bd = classify_expenses(txns, fixed_categories=["房租"])
        assert bd.fixed_total == 1500
        assert bd.variable_total == 300
        assert bd.total == 1800
        assert bd.fixed_categories == ["房租"]

    def test_自动识别稳定类别(self):
        """房租三个月恒定 → 固定；外卖波动大 → 变动。"""
        txns = [
            Transaction(1500, "房租", date(2026, 1, 1)),
            Transaction(1500, "房租", date(2026, 2, 1)),
            Transaction(1500, "房租", date(2026, 3, 1)),
            Transaction(300, "外卖", date(2026, 1, 5)),
            Transaction(900, "外卖", date(2026, 2, 5)),
            Transaction(1200, "外卖", date(2026, 3, 5)),
        ]
        bd = classify_expenses(txns)
        assert "房租" in bd.fixed_categories
        assert "外卖" not in bd.fixed_categories
        assert bd.fixed_total == 4500
        assert bd.variable_total == 2400

    def test_高频稳定消费不算固定支出(self):
        """每月四笔金额完全相同的外卖——金额稳定，但它是可变动的消费习惯。

        这是一个真实踩过的坑：只看金额波动会把外卖误判成"固定支出"，
        用户就会看到"你的外卖是改不了的"，整个干预逻辑随之失效。
        固定支出还需满足"每月笔数少"这一条件。
        """
        txns = []
        for month in (1, 2, 3):
            txns.append(Transaction(1500, "房租", date(2026, month, 1)))
            for day in (2, 5, 8, 11):
                txns.append(Transaction(100, "外卖", date(2026, month, day)))

        bd = classify_expenses(txns)
        assert "房租" in bd.fixed_categories
        assert "外卖" not in bd.fixed_categories
        assert bd.fixed_total == 4500
        assert bd.variable_total == 1200

    def test_单月数据不识别固定支出(self):
        """只有一个月数据时无法判断周期性，全部按变动处理。"""
        txns = [
            Transaction(1500, "房租", date(2026, 1, 1)),
            Transaction(300, "外卖", date(2026, 1, 5)),
        ]
        bd = classify_expenses(txns)
        assert bd.fixed_categories == []
        assert bd.fixed_total == 0
        assert bd.variable_total == 1800

    def test_分类汇总(self):
        txns = [
            Transaction(100, "餐饮", date(2026, 1, 1)),
            Transaction(200, "餐饮", date(2026, 1, 2)),
            Transaction(50, "交通", date(2026, 1, 3)),
        ]
        bd = classify_expenses(txns, fixed_categories=[])
        assert bd.by_category == {"交通": 50.0, "餐饮": 300.0}

    def test_空记录报错(self):
        with pytest.raises(ValueError, match="不能为空"):
            classify_expenses([])

    def test_金额非正报错(self):
        txns = [Transaction(0, "餐饮", date(2026, 1, 1))]
        with pytest.raises(ValueError, match="必须大于 0"):
            classify_expenses(txns)


# ============================================================
# assess_goal_feasibility
# ============================================================

class TestGoalFeasibility:

    TODAY = date(2026, 9, 19)

    def test_已达成(self):
        goal = Goal("相机", target_amount=5000, saved_amount=5000)
        r = assess_goal_feasibility(goal, 350, today=self.TODAY)
        assert r.status == "已达成"
        assert r.remaining == 0
        assert r.months_needed == 0

    def test_超额存入也算已达成(self):
        goal = Goal("相机", target_amount=5000, saved_amount=6000)
        r = assess_goal_feasibility(goal, 350, today=self.TODAY)
        assert r.status == "已达成"
        assert r.remaining == 0

    def test_无期限时状态为未知(self):
        goal = Goal("相机", target_amount=5000, saved_amount=1200)
        r = assess_goal_feasibility(goal, 350, today=self.TODAY)
        assert r.status == "未知"
        assert r.monthly_required is None
        assert r.months_needed == pytest.approx(10.9, abs=0.1)  # 3800 / 350

    def test_期限内可达(self):
        """还差 3800，一年期限需每月 312 元，结余 350 够用。"""
        goal = Goal("相机", target_amount=5000, saved_amount=1200,
                    deadline=date(2027, 9, 19))
        r = assess_goal_feasibility(goal, 350, today=self.TODAY)
        assert r.status == "可达"
        assert r.shortfall == 0
        assert r.monthly_required == pytest.approx(312, abs=1)

    def test_期限太短需延期(self):
        """同样 3800，半年期限需每月 630 元，结余 350 不够。"""
        goal = Goal("相机", target_amount=5000, saved_amount=1200,
                    deadline=date(2027, 3, 19))
        r = assess_goal_feasibility(goal, 350, today=self.TODAY)
        assert r.status == "需延期"
        assert r.shortfall > 0
        assert r.monthly_required > 350

    def test_结余为零无法达成(self):
        goal = Goal("相机", target_amount=5000)
        r = assess_goal_feasibility(goal, 0, today=self.TODAY)
        assert r.status == "无法达成"
        assert r.months_needed is None
        assert r.monthly_required is None

    def test_期限已过仍未存够(self):
        goal = Goal("相机", target_amount=5000, saved_amount=1000,
                    deadline=date(2026, 1, 1))
        r = assess_goal_feasibility(goal, 350, today=self.TODAY)
        assert r.status == "需延期"
        assert r.monthly_required is None

    def test_目标金额非正报错(self):
        with pytest.raises(ValueError, match="目标金额必须大于 0"):
            assess_goal_feasibility(Goal("相机", target_amount=0), 350)


# ============================================================
# detect_patterns —— 算法核心
# ============================================================

class TestDetectPatterns:

    def test_无模式时返回空列表(self):
        """不为凑输出而编造模式——这是产品的可信度底线。"""
        txns = [Transaction(100, "餐饮", date(2026, 1, 5))]
        assert detect_patterns(txns) == []

    def test_空记录报错(self):
        with pytest.raises(ValueError, match="不能为空"):
            detect_patterns([])

    def test_发生活费后消费集中(self):
        txns = []
        for month in (1, 2, 3):
            txns.append(Transaction(900, "购物", date(2026, month, 2)))
            txns.append(Transaction(100, "餐饮", date(2026, month, 20)))
        patterns = detect_patterns(txns, income_day=1)
        kinds = [p.kind for p in patterns]
        assert "post_income_spike" in kinds

        p = next(p for p in patterns if p.kind == "post_income_spike")
        assert p.severity == "warning"
        assert p.evidence["avg_share"] == pytest.approx(0.9, abs=0.01)
        assert len(p.evidence["hit_months"]) == 3

    def test_未提供发薪日则跳过该模式(self):
        txns = []
        for month in (1, 2, 3):
            txns.append(Transaction(900, "购物", date(2026, month, 2)))
        patterns = detect_patterns(txns, income_day=None)
        assert "post_income_spike" not in [p.kind for p in patterns]

    def test_夜间消费(self):
        txns = [Transaction(50, "外卖", date(2026, 1, i + 1), hour=22) for i in range(5)]
        txns += [Transaction(50, "餐饮", date(2026, 1, i + 10), hour=12) for i in range(3)]
        patterns = detect_patterns(txns)
        assert "late_night" in [p.kind for p in patterns]

    def test_无时间数据跳过夜间模式(self):
        txns = [Transaction(50, "外卖", date(2026, 1, i + 1)) for i in range(6)]
        patterns = detect_patterns(txns)
        assert "late_night" not in [p.kind for p in patterns]

    def test_周末消费偏高(self):
        # 2026-01-03 是周六，01-05 是周一
        assert date(2026, 1, 3).weekday() == 5
        assert date(2026, 1, 5).weekday() == 0
        txns = [
            Transaction(600, "娱乐", date(2026, 1, 3)),
            Transaction(600, "娱乐", date(2026, 1, 4)),
            Transaction(600, "娱乐", date(2026, 1, 10)),
            Transaction(100, "餐饮", date(2026, 1, 5)),
            Transaction(100, "餐饮", date(2026, 1, 6)),
            Transaction(100, "餐饮", date(2026, 1, 7)),
        ]
        patterns = detect_patterns(txns)
        p = next((p for p in patterns if p.kind == "weekend_spike"), None)
        assert p is not None
        assert p.evidence["ratio"] == pytest.approx(6.0, abs=0.1)

    def test_类别支出持续上升(self):
        txns = []
        for month in (1, 2, 3):
            txns.append(Transaction(100, "外卖", date(2026, month, 10)))
        for month in (4, 5, 6):
            txns.append(Transaction(300, "外卖", date(2026, month, 10)))
        patterns = detect_patterns(txns)
        p = next((p for p in patterns if p.kind == "category_drift"), None)
        assert p is not None
        assert p.evidence["growth"] == pytest.approx(2.0, abs=0.01)

    def test_高频小额累计可观(self):
        txns = [Transaction(20, "奶茶", date(2026, 1, i + 1)) for i in range(10)]
        txns.append(Transaction(500, "购物", date(2026, 1, 15)))
        patterns = detect_patterns(txns)
        assert "small_frequent" in [p.kind for p in patterns]

    def test_后悔消费集中(self):
        txns = [Transaction(80, "外卖", date(2026, 1, i + 1), regret=True) for i in range(4)]
        txns += [Transaction(80, "交通", date(2026, 1, i + 10), regret=False) for i in range(4)]
        patterns = detect_patterns(txns)
        p = next((p for p in patterns if p.kind == "regret_cluster"), None)
        assert p is not None
        assert p.evidence["category"] == "外卖"
        assert p.evidence["rate"] == 1.0

    def test_warning排在info前面(self):
        txns = [Transaction(20, "奶茶", date(2026, 1, i + 1)) for i in range(10)]
        txns.append(Transaction(500, "购物", date(2026, 1, 15)))
        patterns = detect_patterns(txns)
        if len(patterns) > 1:
            severities = [p.severity for p in patterns]
            assert severities == sorted(severities, key=lambda s: 0 if s == "warning" else 1)

    def test_证据数据完整(self):
        """每个模式都必须带 evidence，否则结论无法复核。"""
        txns = [Transaction(20, "奶茶", date(2026, 1, i + 1)) for i in range(10)]
        txns.append(Transaction(500, "购物", date(2026, 1, 15)))
        for p in detect_patterns(txns):
            assert p.evidence, f"{p.kind} 缺少 evidence"
            assert p.title and p.detail


# ============================================================
# summarize_regret
# ============================================================

class TestSummarizeRegret:

    def test_无回访数据(self):
        txns = [Transaction(100, "餐饮", date(2026, 1, 1))]
        s = summarize_regret(txns)
        assert s.reviewed_count == 0
        assert s.regret_rate == 0.0
        assert s.regretted_total == 0.0

    def test_部分后悔(self):
        txns = [
            Transaction(300, "购物", date(2026, 1, 1), regret=True),
            Transaction(200, "购物", date(2026, 1, 2), regret=True),
            Transaction(100, "餐饮", date(2026, 1, 3), regret=False),
            Transaction(100, "餐饮", date(2026, 1, 4), regret=None),
        ]
        s = summarize_regret(txns)
        assert s.reviewed_count == 3          # None 不计入
        assert s.regret_count == 2
        assert s.regretted_total == 500
        assert s.regret_rate == pytest.approx(0.667, abs=0.001)


# ============================================================
# build_report —— 集成
# ============================================================

class TestBuildReport:

    TODAY = date(2026, 9, 19)

    def _sample(self):
        txns = []
        for month in (1, 2, 3):
            txns.append(Transaction(1500, "房租", date(2026, month, 1)))
            txns.append(Transaction(900, "外卖", date(2026, month, 2), hour=22))
            txns.append(Transaction(200, "交通", date(2026, month, 15), hour=8))
        return txns

    def test_完整报告(self):
        goals = [Goal("相机", target_amount=5000, saved_amount=1200)]
        report = build_report(self._sample(), goals, 2500,
                              income_day=1, today=self.TODAY)

        assert report.monthly_income == 2500
        assert report.spending.total == pytest.approx(7800, abs=1)
        assert len(report.goal_feasibility) == 1
        assert report.goal_feasibility[0].goal_name == "相机"

    def test_自动识别固定支出(self):
        report = build_report(self._sample(), [], 2500, today=self.TODAY)
        assert "房租" in report.spending.fixed_categories

    def test_无目标时列表为空(self):
        report = build_report(self._sample(), [], 2500, today=self.TODAY)
        assert report.goal_feasibility == []

    def test_数据不足给出警告(self):
        txns = [Transaction(100, "餐饮", date(2026, 1, 5))]
        report = build_report(txns, [], 2000, today=self.TODAY)
        assert any("不足 2 个自然月" in w for w in report.warnings)

    def test_无回访数据给出警告(self):
        report = build_report(self._sample(), [], 2500, today=self.TODAY)
        assert any("暂无消费回访数据" in w for w in report.warnings)

    def test_入不敷出给出警告(self):
        txns = [Transaction(5000, "餐饮", date(2026, 1, 5))]
        report = build_report(txns, [], 2000, today=self.TODAY)
        assert report.monthly_surplus < 0
        assert any("月结余小于等于 0" in w for w in report.warnings)

    def test_to_dict可JSON序列化(self):
        """API 会直接返回 to_dict()，日期必须已转成字符串。"""
        goals = [Goal("相机", target_amount=5000, deadline=date(2027, 9, 19))]
        report = build_report(self._sample(), goals, 2500, today=self.TODAY)
        payload = json.dumps(report.to_dict(), ensure_ascii=False)
        assert "相机" in payload

    def test_空记录报错(self):
        with pytest.raises(ValueError, match="不能为空"):
            build_report([], [], 2000)

    def test_负收入报错(self):
        with pytest.raises(ValueError, match="月收入不能为负"):
            build_report(self._sample(), [], -1)


# ============================================================
# 序列化
# ============================================================

class TestSerialization:

    def test_Transaction从字典构造(self):
        t = Transaction.from_dict({
            "amount": 800,
            "category": "购物",
            "date": "2026-01-15",
            "hour": 22,
            "merchant": "某店",
        })
        assert t.date == date(2026, 1, 15)
        assert t.hour == 22
        assert t.merchant == "某店"

    def test_Goal从字典构造(self):
        g = Goal.from_dict({
            "name": "相机",
            "target_amount": 5000,
            "deadline": "2027-09-19",
        })
        assert g.deadline == date(2027, 9, 19)
        assert g.saved_amount == 0.0

    def test_Goal无期限(self):
        g = Goal.from_dict({"name": "相机", "target_amount": 5000})
        assert g.deadline is None

    def test_Transaction往返序列化(self):
        original = Transaction(800, "购物", date(2026, 1, 15), hour=22)
        restored = Transaction.from_dict(original.to_dict())
        assert restored == original

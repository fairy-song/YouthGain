"""Fixed-domain, add/remove-student DP aggregates. No identifiers in outputs.

Three nonnegative vectors each have per-student L1 norm 1. Their concatenation
has L1 sensitivity 3. Independent Laplace(3/epsilon) coordinate noise implements
one vector release. Category missingness is a fixed extra bucket, not a private
denominator. Counts/percentages/suppression use only the noisy vectors.
"""
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from math import log

VERSION = 'student-month-dp-v1'
CATEGORIES = ['餐饮', '交通', '购物', '娱乐', '学习', '其他', '无有效记录']
SPENDING = ['无有效记录', '0–500元', '500–1000元', '1000–2000元', '2000–3000元', '3000元及以上']
BUDGET = ['资料缺失或预算为零', '无有效记录', '低于预算的50%', '预算的50%–100%', '超过预算']
NOTICE = ('仅描述自愿参与者的已记录消费，不代表全校或全部实际支出。'
          '结果经过差分隐私处理，负值截为零、比例归一化；小差异可能来自噪声，不能据此评价个人。')


def valid_amount(value):
    try:
        result = Decimal(str(value))
        return result if result.is_finite() and 0 < result <= 100000000 else None
    except (ValueError, TypeError, InvalidOperation):
        return None


def contribution(rows, budget, month):
    """Return bounded vectors even with missing/invalid records; no sample dropped."""
    amounts = [Decimal(0) for _ in CATEGORIES]
    for row in rows:
        value = row.get('date') or row.get('spent_at')
        try:
            day = value.date() if isinstance(value, datetime) else value if isinstance(value, date) else date.fromisoformat(str(value)[:10])
        except (ValueError, TypeError):
            continue
        amount = valid_amount(row.get('amount'))
        if day.isoformat()[:7] == month and amount is not None:
            category = row.get('category')
            index = CATEGORIES.index(category) if category in CATEGORIES[:-2] else 5
            amounts[index] += amount
    total = sum(amounts)
    spending = [0.0] * len(SPENDING)
    spending[0 if not total else 1 + sum(total >= bound for bound in (500, 1000, 2000, 3000))] = 1.0
    # Decimal normalization avoids amount magnitude affecting sensitivity.
    shares = [float(a / total) for a in amounts] if total else [0.0] * 6 + [1.0]
    # Bound floating point rounding conservatively as well.
    norm = max(1.0, sum(shares))
    shares = [v / norm for v in shares]
    budget_vector = [0.0] * len(BUDGET)
    income = valid_amount(budget)
    bucket = 0 if income is None else 1 if not total else 2 if total < income / 2 else 3 if total <= income else 4
    budget_vector[bucket] = 1.0
    return [spending, shares, budget_vector]


def release(vectors, epsilon):
    try:
        from diffprivlib.mechanisms import Laplace
    except ImportError as error:
        raise RuntimeError('差分隐私依赖未安装') from error
    # None selects diffprivlib's secure SystemRandom, never a fixed test seed.
    mechanism = Laplace(epsilon=epsilon, delta=0, sensitivity=3.0)
    domains = [SPENDING, CATEGORIES, BUDGET]
    titles = ['月度已记录支出区间', '学生平均类别支出占比（含缺失状态）', '已记录支出与预算比较']
    noisy = []
    for dimension, domain in enumerate(domains):
        totals = [sum(v[dimension][i] for v in vectors) for i in range(len(domain))]
        noisy.append([max(0.0, mechanism.randomise(float(total))) for total in totals])
    # No exact count or data-dependent suppression flag escapes the mechanism.
    enough = sum(noisy[0]) >= 30
    charts = []
    if enough:
        for title, domain, values in zip(titles, domains, noisy):
            denominator = sum(values)
            charts.append({'title': title, 'bins': [
                {'label': label, 'estimate': round(value, 2),
                 'percent': round(value / denominator * 100, 2) if denominator else 0}
                for label, value in zip(domain, values)]})
    return {'version': VERSION, 'epsilon': epsilon, 'delta': 0,
            'privacy_unit': '项目研究范围内一名学生的全部月度贡献；跨发布累计计入预算',
            'adjacency': 'add/remove student', 'sensitivity_l1': 3,
            'status': 'published' if enough else 'insufficient_signal', 'charts': charts,
            'message': '统计已发布' if enough else '受保护统计信号不足，暂不展示分布；本次已消耗预算，不能重复生成。',
            'noise_scale': round(3 / epsilon, 4),
            'coordinate_noise_95': round(3 / epsilon * log(20), 2),
            'noise_note': '单个坐标加噪前后差值的理论95%范围，不是百分比置信区间；截零和归一化可能产生偏差。',
            'notice': NOTICE}

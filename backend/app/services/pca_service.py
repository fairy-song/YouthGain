"""Per-account, exploratory PCA of recorded weekly spending; no predictions."""
from collections import defaultdict
from datetime import date, timedelta
from math import isfinite

MIN_WEEKS = 12
MAX_WEEKS = 26
VERSION = 'weekly-pca-v1'
LIMITATION = ('仅比较本账号已记录的完整自然周，空白周不当作零消费；漏记会影响结果。'
              '共同变化不代表因果、冲动程度或财商水平，也不预测未来消费。')


def analyze_spending(transactions, *, today=None, limited=False):
    """Standardize nonconstant features, then SVD; retain <=3 PCs toward 80%.

    A complete calendar week does not guarantee complete recording. Category
    vocabulary is fitted locally, never on other accounts. PCA signs are fixed
    by the largest absolute loading for reproducible explanations.
    """
    today = today or date.today()
    result = {'version': VERSION, 'status': 'insufficient_data', 'min_weeks': MIN_WEEKS,
              'sample_weeks': 0, 'components': [], 'limitation': LIMITATION}
    if limited:
        return dict(result, status='incomplete_data', message='记录读取不完整，暂不生成消费模式探索。')
    valid = [t for t in transactions if t.date <= today and isfinite(t.amount) and t.amount > 0]
    groups = defaultdict(list)
    current_monday = today - timedelta(days=today.weekday())
    first = min((t.date for t in valid), default=today)
    for t in valid:
        monday = t.date - timedelta(days=t.date.weekday())
        # Exclude the first partial week and the unfinished current week.
        if monday >= first and monday < current_monday:
            groups[monday].append(t)
    weeks = sorted(groups)[-MAX_WEEKS:]
    result['sample_weeks'] = len(weeks)
    if len(weeks) < MIN_WEEKS:
        return dict(result, message=f'已有 {len(weeks)} 个有记录的完整周，至少需要 {MIN_WEEKS} 周；请持续记录日常消费。')

    import numpy as np

    totals = defaultdict(float)
    for week in weeks:
        for t in groups[week]:
            totals[t.category] += t.amount
    categories = sorted(totals, key=lambda c: (-totals[c], c))[:3]
    features = [('frequency', '每周消费笔数'), ('mean_amount', '平均单笔金额'),
                ('small_share', '小额支出占比（单笔≤30元）'), ('weekend_share', '周末支出占比')]
    features += [(f'category_{i}', f'{c}支出占比') for i, c in enumerate(categories)]
    if len(totals) > len(categories):
        features.append(('other_share', '其他类别支出占比'))
    rows = []
    for week in weeks:
        txns = groups[week]
        total = sum(t.amount for t in txns)
        row = [len(txns), total / len(txns), sum(t.amount for t in txns if t.amount <= 30) / total,
               sum(t.amount for t in txns if t.date.weekday() >= 5) / total]
        row += [sum(t.amount for t in txns if t.category == c) / total for c in categories]
        if len(totals) > len(categories):
            row.append(sum(t.amount for t in txns if t.category not in categories) / total)
        rows.append(row)
    matrix = np.asarray(rows, dtype=float)
    scales = matrix.std(axis=0)
    active = scales > 1e-10
    result['excluded_features'] = [label for (_, label), keep in zip(features, active) if not keep]
    if int(active.sum()) < 2:
        return dict(result, status='insufficient_variation', message='可比较指标的变化不足，暂不生成共同变化结论。')
    features = [f for f, keep in zip(features, active) if keep]
    z = (matrix[:, active] - matrix[:, active].mean(axis=0)) / scales[active]
    try:
        _, singular, axes = np.linalg.svd(z, full_matrices=False)
    except np.linalg.LinAlgError:
        return dict(result, status='unavailable', message='本次模式分析未完成，请稍后重试。')
    ratios = singular ** 2 / float(np.sum(singular ** 2))
    count = min(3, int(np.searchsorted(np.cumsum(ratios), .8)) + 1,
                int(np.sum(singular > singular[0] * 1e-10)))
    for i in range(count):
        axis = axes[i].copy()
        if axis[int(np.argmax(np.abs(axis)))] < 0:
            axis *= -1
        contributions = [dict(feature=key, label=label, loading=round(float(weight), 6),
                              contribution=round(float(weight ** 2), 6))
                         for (key, label), weight in zip(features, axis)]
        contributions.sort(key=lambda f: -f['contribution'])
        leading = contributions[:3]
        detail = '、'.join(f"{f['label']}（{'同向' if f['loading'] >= 0 else '反向'}）" for f in leading)
        result['components'].append({'id': f'PC{i+1}', 'title': f'共同变化方向 {i+1}',
                                     'explained_variance_ratio': round(float(ratios[i]), 6),
                                     'contributions': contributions,
                                     'detail': f'贡献较大的指标：{detail}。方向仅表示这些指标在记录中的共同变化。',
                                     'scores': [{'week_start': w.isoformat(), 'value': round(float(v), 6)}
                                                for w, v in zip(weeks, z @ axis)]})
    return dict(result, status='ready', start=weeks[0].isoformat(),
                end=(weeks[-1] + timedelta(days=6)).isoformat(),
                retained_variance_ratio=round(float(sum(ratios[:count])), 6),
                message=f'比较最近 {len(weeks)} 个有记录的完整周，展示最多 3 个共同变化方向。')

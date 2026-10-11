import json
from datetime import date, timedelta

import numpy as np
import pytest

from app.services.decision_engine import Transaction, build_report
from app.services.pca_service import analyze_spending


START = date(2026, 1, 5)  # Monday
TODAY = START + timedelta(weeks=16)


def sample():
    return [Transaction(amount=10 + i * 2 + j * 20,
                        category='餐饮' if j % 2 else '交通',
                        date=START + timedelta(weeks=i, days=j))
            for i in range(16) for j in range(1 + i % 7)]


def test_sparse_and_blank_weeks_are_not_zero_spending():
    rows = [Transaction(20, '餐饮', START), Transaction(40, '餐饮', START + timedelta(weeks=15))]
    result = analyze_spending(rows, today=TODAY)
    assert result['sample_weeks'] == 2
    assert result['status'] == 'insufficient_data'
    assert result['components'] == []


def test_current_future_and_first_partial_weeks_are_excluded():
    rows = [Transaction(20, '餐饮', START + timedelta(days=1)),
            Transaction(30, '餐饮', START + timedelta(weeks=1)),
            Transaction(40, '餐饮', TODAY), Transaction(50, '餐饮', TODAY + timedelta(days=1))]
    assert analyze_spending(rows, today=TODAY)['sample_weeks'] == 1


def test_constant_features_and_incomplete_data_abstain():
    rows = [Transaction(20, '餐饮', START + timedelta(weeks=i)) for i in range(16)]
    assert analyze_spending(rows, today=TODAY)['status'] == 'insufficient_variation'
    assert analyze_spending(sample(), today=TODAY, limited=True)['status'] == 'incomplete_data'


def test_components_match_independent_covariance_eigenvalues_and_scores():
    result = analyze_spending(sample(), today=TODAY)
    assert result['status'] == 'ready'
    # Reconstruct standardized features independently from the fixture.
    columns = []
    for i in range(16):
        rows = [t for t in sample() if (t.date - START).days // 7 == i]
        total = sum(t.amount for t in rows)
        columns.append([len(rows), total / len(rows), sum(t.amount for t in rows if t.amount <= 30) / total,
                        sum(t.amount for t in rows if t.date.weekday() >= 5) / total,
                        sum(t.amount for t in rows if t.category == '交通') / total,
                        sum(t.amount for t in rows if t.category == '餐饮') / total])
    x = np.array(columns)
    x = x[:, x.std(axis=0) > 1e-10]
    z = (x - x.mean(axis=0)) / x.std(axis=0)
    eigenvalues = np.linalg.eigvalsh(np.cov(z, rowvar=False))[::-1]
    expected = eigenvalues / eigenvalues.sum()
    for i, c in enumerate(result['components']):
        assert c['explained_variance_ratio'] == pytest.approx(expected[i], abs=1e-6)
        assert sum(f['contribution'] for f in c['contributions']) == pytest.approx(1, abs=1e-5)
        scores = np.array([s['value'] for s in c['scores']])
        assert scores.mean() == pytest.approx(0, abs=1e-6)
        assert scores.var(ddof=1) == pytest.approx(eigenvalues[i], abs=1e-5)
    assert result == analyze_spending(list(reversed(sample())), today=TODAY)
    json.dumps(result, allow_nan=False)


def test_pca_does_not_change_budget_or_goal_results():
    enabled = build_report(sample(), [], 2000, today=TODAY).to_dict()
    disabled = build_report(sample(), [], 2000, today=TODAY, pca_limited=True).to_dict()
    assert enabled.pop('pca')['status'] == 'ready'
    assert disabled.pop('pca')['status'] == 'incomplete_data'
    assert enabled == disabled


def test_recent_window_is_capped_and_rank_one_is_valid():
    rows = [Transaction(10 + i, '餐饮', START + timedelta(weeks=i, days=j))
            for i in range(30) for j in range(1 + i % 2)]
    result = analyze_spending(rows, today=START + timedelta(weeks=30))
    assert result['sample_weeks'] == 26
    assert result['start'] == (START + timedelta(weeks=4)).isoformat()
    # Separate fixture with exactly two varying, perfectly correlated features.
    rank_one = [Transaction(40 + i % 5, '餐饮', START + timedelta(weeks=i, days=j))
                for i in range(16) for j in range(1 + i % 5)]
    result = analyze_spending(rank_one, today=TODAY)
    assert result['status'] == 'ready'
    assert len(result['components']) == 1
    assert result['retained_variance_ratio'] == 1
    assert '餐饮支出占比' in result['excluded_features']


def test_authorized_coach_summary_has_evidence_without_weekly_scores():
    from app.services.coach_evidence import compute_facts, render_evidence
    facts = compute_facts(sample(), 2000, today=TODAY)
    assert facts['pca']['status'] == 'ready'
    assert all('scores' not in c for c in facts['pca']['components'])
    assert '消费模式探索（PCA）' in render_evidence({'calculation': facts})
    assert compute_facts(sample(), 2000, today=TODAY, skipped=1)['pca']['components'] == []

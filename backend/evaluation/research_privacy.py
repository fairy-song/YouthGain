"""Synthetic utility experiment, never queries student records or consumes budgets.

Run from the repository: python backend/evaluation/research_privacy.py
Each trial simulates an independent one-shot release, not repeated real queries.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.research_privacy import contribution, release  # noqa: E402


def evaluate(trials=50):
    results = []
    for count in (30, 100, 300):
        vectors = [contribution([{'date': '2026-02-10', 'amount': 100 + (i * 137) % 3500,
                                   'category': ['餐饮', '交通', '购物', '学习', '娱乐'][i % 5]}],
                                 2000 if i % 7 else None, '2026-02') for i in range(count)]
        truth = [[sum(v[dimension][i] for v in vectors) / count * 100
                  for i in range(len(vectors[0][dimension]))] for dimension in range(3)]
        errors, suppressed = [], 0
        for _ in range(trials):
            snapshot = release(vectors, 1)
            if snapshot['status'] != 'published':
                suppressed += 1
                continue
            errors += [abs(bin_value['percent'] - target)
                       for chart, expected in zip(snapshot['charts'], truth)
                       for bin_value, target in zip(chart['bins'], expected)]
        results.append({'synthetic_students': count, 'independent_trials': trials,
                        'epsilon_per_trial': 1, 'suppressed_trials': suppressed,
                        'mean_absolute_percentage_point_error_when_published':
                            round(sum(errors) / len(errors), 3) if errors else None})
    return {'data': 'synthetic only', 'version': 'student-month-dp-v1',
            'limitation': 'Independent one-shot experiments; no real participant data. Not a proof of privacy or a representative population study.',
            'results': results}


if __name__ == '__main__':
    print(json.dumps(evaluate(), ensure_ascii=False, indent=2))

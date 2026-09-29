"""Offline development benchmark. No API calls, credentials or personal data.
Run from repository root: .venv/Scripts/python.exe backend/evaluation/run_offline.py
"""
import hashlib
import json
import sys
from datetime import date
from pathlib import Path
from time import perf_counter

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from app.services.coach_evidence import retrieve, compute_facts, VERSION
from app.services.adaptive_learning import grade, recommend
from app.services.decision_engine import Transaction


def run():
    corpus_path = ROOT / 'backend/content/knowledge_starter.json'
    cases_path = Path(__file__).with_name('retrieval_cases.json')
    corpus = json.loads(corpus_path.read_text(encoding='utf-8-sig'))
    corpus = [dict(a, id=f'article-{index}') for index, a in enumerate(corpus)]
    cases = json.loads(cases_path.read_text(encoding='utf-8-sig'))
    rows = []
    start = perf_counter()
    for case in cases:
        sources = retrieve(case['query'], corpus)
        titles = [source['title'] for source in sources]
        rows.append({**case, 'retrieved': titles,
                     'pass': case['expected'] in titles if case['expected'] else not titles})
    fixtures = [Transaction(500, '生活', date(2026, 8, 29)), Transaction(500, '生活', date(2026, 9, 28))]
    facts = compute_facts(fixtures, 2000, 100, date(2026, 9, 28))
    checks = {
        'purchase_remaining': facts['after_purchase_estimate'] == 1400,
        'missing_records_abstain': 'remaining_estimate' not in compute_facts([], 2000, 100),
        'missing_income_abstain': 'remaining_estimate' not in compute_facts(fixtures, None, 100),
        'truncated_records_abstain': 'delay_days' not in compute_facts(fixtures, 2000, 100, limited=True),
        'wrong_answer_remediation': recommend([grade('budget-basic', 0)])['next_item']['id'] == 'budget-basic',
        'correct_answer_progression': recommend([grade('budget-basic', 1)])['next_item']['id'] == 'budget-transfer',
    }
    report = {'version': VERSION, 'kind': 'development_smoke_benchmark',
              'corpus_sha256': hashlib.sha256(corpus_path.read_bytes()).hexdigest(),
              'cases_sha256': hashlib.sha256(cases_path.read_bytes()).hexdigest(),
              'retrieval_hit_at_3': sum(r['pass'] for r in rows if r['expected']) / sum(bool(r['expected']) for r in rows),
              'abstention_pass': all(r['pass'] for r in rows if not r['expected']),
              'deterministic_checks': checks, 'elapsed_ms': round((perf_counter()-start)*1000, 2), 'cases': rows,
              'limitations': ['人工编写开发集，题意接近文章标题；不是独立盲测。', '未调用真实大模型，未测模型回答质量或教学效果。', '未使用真实用户数据。']}
    output = ROOT / 'docs/AIC_OFFLINE_RESULTS.json'
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ('cases',)}, ensure_ascii=False, indent=2))
    return 0 if all(r['pass'] for r in rows) and all(checks.values()) else 1

if __name__ == '__main__':
    raise SystemExit(run())

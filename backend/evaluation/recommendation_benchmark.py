"""Offline recommendation policy checks on explicitly synthetic cases.

The benchmark compares selection and coverage, never claims a learning gain.
It makes no provider calls and does not read any account or transaction store.
"""
import argparse
import hashlib
import json
import sys
from datetime import date, timedelta
from pathlib import Path
from time import perf_counter

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))

from app.services.adaptive_learning import ITEMS, VERSION, grade, is_publishable, recommend

ARMS = ('rules', 'topic_only', 'without_spending', 'without_answers')
FIXTURE = Path(__file__).with_name('recommendation_cases.json')


def partition_holdout(observations, cutoff, split_key):
    """Keep users and scenario families apart across a predeclared time boundary.

    This partitions consented, pseudonymous observations for a future study;
    it does not estimate outcomes for questions a learner never saw.
    """
    cutoff = date.fromisoformat(str(cutoff))
    if not split_key or len(split_key) < 12:
        raise ValueError('请预先固定足够长的分组密钥')
    development, holdout, excluded = [], [], []
    for row in observations:
        if set(row) != {'study_id', 'observed_on', 'scenario_family'}:
            raise ValueError('离线分割只接受匿名编号、日期和情境族')
        uid = row['study_id']
        if not isinstance(uid, str) or not uid or '@' in uid:
            raise ValueError('匿名编号无效')
        observed = date.fromisoformat(row['observed_on'])
        bucket = int.from_bytes(hashlib.sha256((split_key + ':' + uid).encode()).digest()[:4], 'big') % 5
        if bucket == 0 and observed >= cutoff:
            holdout.append(row)
        elif bucket != 0 and observed < cutoff:
            development.append(row)
        else:
            excluded.append(row)
    if {row['study_id'] for row in development} & {row['study_id'] for row in holdout}:
        raise ValueError('用户在开发集与验证集中重叠')
    shared = {row['scenario_family'] for row in development} & {row['scenario_family'] for row in holdout}
    if shared:
        raise ValueError('同一情境族不能同时出现在开发集和验证集')
    return {'development': development, 'holdout': holdout, 'excluded': excluded}


def _entries(case, today):
    answers = list(case.get('answers', []))
    if 'completed_except' in case:
        excluded = set(case['completed_except'])
        if excluded - {item['id'] for item in ITEMS}:
            raise ValueError('案例含未知题目编号')
        answers.extend({'item_id': item['id'], 'choice': item['answer'], 'days_ago': 0}
                       for item in ITEMS if is_publishable(item) and item['id'] not in excluded)
    entries = []
    for index, answer in enumerate(answers):
        if type(answer.get('days_ago', 0)) is not int or answer.get('days_ago', 0) < 0:
            raise ValueError('案例答案时间不能晚于观察日期')
        entry = grade(answer['item_id'], answer['choice'])
        entry.update(id=f'synthetic-{index}', updated_at=(today - timedelta(days=answer.get('days_ago', 0))).isoformat())
        entries.append(entry)
    return entries


def _static_item(preferred):
    return next((item for item in ITEMS if is_publishable(item) and item['topic'] == preferred
                 and item.get('step', 1) == 1), None)


def evaluate(cases):
    if not isinstance(cases, list) or not cases:
        raise ValueError('至少需要一个合成对照案例')
    known_topics = {item['topic'] for item in ITEMS}
    case_ids = set()
    results = {arm: {'hits': 0, 'covered': 0, 'latency_ms': [], 'selections': []} for arm in ARMS}
    for case in cases:
        if set(case) - {'id', 'today', 'preferred', 'answers', 'completed_except', 'transactions', 'expected_topics'}:
            raise ValueError('案例含不允许的字段；不要放入个人账单或身份信息')
        if not case.get('id') or not case.get('expected_topics'):
            raise ValueError('案例缺少编号或事先写定的期望主题')
        if case['id'] in case_ids or case.get('preferred') not in known_topics or not set(case['expected_topics']) <= known_topics:
            raise ValueError('案例编号或主题无效')
        case_ids.add(case['id'])
        today = date.fromisoformat(case['today'])
        preferred = case['preferred']
        entries = _entries(case, today)
        transactions = case.get('transactions')
        if transactions is not None and any(set(row) - {'date', 'category', 'regret', 'transaction_type'} for row in transactions):
            raise ValueError('案例只允许无金额、无商户的合成消费线索')
        if transactions is not None and any(date.fromisoformat(row['date']) > today for row in transactions):
            raise ValueError('不能使用观察日期之后的消费线索')
        for arm in ARMS:
            started = perf_counter()
            if arm == 'topic_only':
                selected = _static_item(preferred)
            else:
                response = recommend(entries if arm != 'without_answers' else [], preferred,
                                     transactions if arm != 'without_spending' else None, today=today)
                selected = response['next_item']
            elapsed = (perf_counter() - started) * 1000
            value = results[arm]
            value['latency_ms'].append(elapsed)
            value['covered'] += selected is not None
            value['hits'] += selected is not None and selected['topic'] in case['expected_topics']
            value['selections'].append({'case_id': case['id'], 'item_id': selected['id'] if selected else None,
                                        'topic': selected['topic'] if selected else None})
    return {'kind': 'synthetic_recommendation_development_check', 'policy_version': VERSION,
            'case_count': len(cases), 'arms': {name: {
                'topic_hit_rate': round(value['hits'] / len(cases), 4),
                'coverage': round(value['covered'] / len(cases), 4),
                'mean_latency_ms': round(sum(value['latency_ms']) / len(cases), 3),
                'selections': value['selections'],
            } for name, value in results.items()},
            'limitations': [
                '案例与期望主题由开发者预先编写；这只是策略行为和消融检查。',
                '没有真实用户、随机分配、未见题作答或延迟复测，不能推断教学效果。',
                '离线日志只记录已展示题目的结果，不能用未展示题目的缺失结果比较新策略。',
            ]}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cases', type=Path, default=FIXTURE)
    parser.add_argument('--output', type=Path, help='Optional JSON report path')
    args = parser.parse_args(argv)
    raw = args.cases.read_bytes()
    fixture = json.loads(raw)
    if fixture.get('kind') != 'synthetic_recommendation_cases_v1':
        parser.error('只接受明确标记为合成案例的开发集')
    report = evaluate(fixture['cases'])
    report['cases_sha256'] = hashlib.sha256(raw).hexdigest()
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding='utf-8')
    print(rendered)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

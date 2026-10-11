"""Validate and summarize a consented personal-learning pilot CSV.

Only aggregate metrics leave this process. Scores and form equivalence require
independent human review; this script does not establish educational efficacy.
"""
import argparse
import csv
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path
from statistics import mean

FIELDS = ('study_id', 'consent_version', 'consented_at', 'group', 'pretest_form',
          'pretest_score', 'posttest_form', 'posttest_score', 'delayed_form',
          'delayed_score', 'rater_a', 'rater_b', 'burden_rating', 'withdrawn',
          'missing_reason')
GROUPS = ('baseline', 'personalized')
MISSING_REASONS = ('', 'pending', 'missed', 'withdrew', 'other')


def _score(raw, field, line):
    if raw == '':
        return None
    try:
        value = float(raw)
    except ValueError as error:
        raise ValueError(f'第 {line} 行 {field} 不是有效分数') from error
    if not 0 <= value <= 100 or value != value:
        raise ValueError(f'第 {line} 行 {field} 应在 0—100 之间')
    return value


def read_pilot(path):
    with Path(path).open(encoding='utf-8-sig', newline='') as source:
        reader = csv.DictReader(source)
        if tuple(reader.fieldnames or ()) != FIELDS:
            raise ValueError('评估表头不匹配；请使用 pilot_template.csv，勿加入姓名或账单列')
        rows, ids = [], set()
        for line, raw in enumerate(reader, start=2):
            if not any(raw.values()):
                continue
            if None in raw or any(not isinstance(value, str) for value in raw.values()):
                raise ValueError(f'第 {line} 行列数不完整')
            row = {key: value.strip() for key, value in raw.items()}
            study_id = row['study_id']
            if not re.fullmatch(r'[A-Za-z0-9_-]{6,64}', study_id) or study_id in ids:
                raise ValueError(f'第 {line} 行匿名编号无效或重复')
            ids.add(study_id)
            if not row['consent_version'] or not row['consented_at']:
                raise ValueError(f'第 {line} 行缺少参与同意记录')
            try:
                consented = datetime.fromisoformat(row['consented_at'])
            except ValueError as error:
                raise ValueError(f'第 {line} 行同意时间无效') from error
            if consented.tzinfo is None:
                raise ValueError(f'第 {line} 行同意时间须带时区')
            if row['group'] not in GROUPS:
                raise ValueError(f'第 {line} 行分组应为 baseline 或 personalized')
            if row['withdrawn'].lower() not in ('true', 'false'):
                raise ValueError(f'第 {line} 行 withdrawn 应为 true 或 false')
            if row['missing_reason'] not in MISSING_REASONS:
                raise ValueError(f'第 {line} 行缺失原因无效')
            for field in ('pretest_score', 'posttest_score', 'delayed_score', 'rater_a', 'rater_b'):
                row[field] = _score(row[field], field, line)
            if row['pretest_score'] is None or not row['pretest_form']:
                raise ValueError(f'第 {line} 行缺少前测表单或分数')
            if row['posttest_score'] is not None and not row['posttest_form']:
                raise ValueError(f'第 {line} 行缺少后测表单')
            if row['delayed_score'] is not None and (row['posttest_score'] is None or not row['delayed_form']):
                raise ValueError(f'第 {line} 行延迟测缺少后测或表单')
            forms = [row[key] for key in ('pretest_form', 'posttest_form', 'delayed_form') if row[key]]
            if len(forms) != len(set(forms)):
                raise ValueError(f'第 {line} 行重复使用同一测验表单')
            if (row['posttest_score'] is None or row['delayed_score'] is None) and not row['missing_reason']:
                raise ValueError(f'第 {line} 行未完成测验须说明 pending、missed 或 withdrew')
            if row['posttest_score'] is not None and row['delayed_score'] is not None and row['missing_reason'] and not row['withdrawn']:
                raise ValueError(f'第 {line} 行测验已完成，不应标记缺失原因')
            if (row['rater_a'] is None) != (row['rater_b'] is None):
                raise ValueError(f'第 {line} 行评分者结果须成对填写')
            if row['burden_rating']:
                if row['burden_rating'] not in ('1', '2', '3', '4', '5'):
                    raise ValueError(f'第 {line} 行阅读负担评分应为 1—5')
                row['burden_rating'] = int(row['burden_rating'])
            else:
                row['burden_rating'] = None
            row['withdrawn'] = row['withdrawn'].lower() == 'true'
            rows.append(row)
    return rows


def _group_summary(rows):
    included = [row for row in rows if not row['withdrawn']]
    paired_post = [row for row in included if row['posttest_score'] is not None]
    paired_delayed = [row for row in paired_post if row['delayed_score'] is not None]
    burden = [row['burden_rating'] for row in included if row['burden_rating'] is not None]
    rater_gaps = [abs(row['rater_a'] - row['rater_b']) for row in included if row['rater_a'] is not None]
    return {
        'consented': len(rows), 'withdrawn': sum(row['withdrawn'] for row in rows),
        'paired_post': len(paired_post), 'paired_delayed': len(paired_delayed),
        'post_pending': sum(row['posttest_score'] is None and row['missing_reason'] == 'pending' for row in included),
        'post_missing': sum(row['posttest_score'] is None and row['missing_reason'] != 'pending' for row in included),
        'delayed_pending': sum(row['posttest_score'] is not None and row['delayed_score'] is None
                               and row['missing_reason'] == 'pending' for row in included),
        'delayed_missing': sum(row['posttest_score'] is not None and row['delayed_score'] is None
                               and row['missing_reason'] != 'pending' for row in included),
        'mean_pretest_paired_post': round(mean(row['pretest_score'] for row in paired_post), 2) if paired_post else None,
        'mean_post_gain': round(mean(row['posttest_score'] - row['pretest_score'] for row in paired_post), 2) if paired_post else None,
        'mean_delayed_gain': round(mean(row['delayed_score'] - row['pretest_score'] for row in paired_delayed), 2) if paired_delayed else None,
        'mean_burden': round(mean(burden), 2) if burden else None,
        'paired_raters': len(rater_gaps),
        'mean_rater_absolute_difference': round(mean(rater_gaps), 2) if rater_gaps else None,
    }


def analyze(rows):
    groups = {group: _group_summary([row for row in rows if row['group'] == group]) for group in GROUPS}
    ready = all(groups[group]['paired_post'] >= 10 for group in GROUPS)
    difference = (round(groups['personalized']['mean_post_gain'] - groups['baseline']['mean_post_gain'], 2)
                  if ready else None)
    return {
        'kind': 'personal_learning_pilot_descriptive_report',
        'status': 'descriptive_comparison_ready' if ready else 'insufficient_data',
        'total_consented': len(rows), 'groups': groups,
        'missing_reasons': dict(Counter(row['missing_reason'] for row in rows if row['missing_reason'])),
        'between_group_post_gain_difference': difference,
        'limitations': [
            '仅汇总同意参与者的匿名分数；此报告不包含个人答案、账单或匿名编号。',
            '未验证平行表单等值、分组可比性或评分者一致性；差值只是描述，不能直接归因于推荐策略。',
            '前后测与延迟测必须使用未出现在日常练习中的不同审核题；未完成和退出比例须同时报告。',
            '样本不足时不计算组间差值；即使达到门槛也须先完成预设分析与独立复核。',
        ],
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=Path(__file__).with_name('pilot_template.csv'))
    parser.add_argument('--output', type=Path, help='Optional aggregate JSON report path')
    args = parser.parse_args(argv)
    try:
        report = analyze(read_pilot(args.input))
    except (OSError, ValueError) as error:
        parser.error(str(error))
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding='utf-8')
    print(rendered)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

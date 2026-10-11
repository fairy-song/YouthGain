"""B/C/D tooling must be reproducible and decline unsupported claims."""
import csv
import json
from pathlib import Path

import pytest

from evaluation.content_audit import FIELDS as AUDIT_FIELDS, export_csv, worksheet_rows
from evaluation.learning_outcomes import FIELDS as PILOT_FIELDS, analyze, read_pilot
from evaluation.recommendation_benchmark import FIXTURE, evaluate, partition_holdout
from app.services.adaptive_learning import ITEMS


def _pilot_row(study_id, group, pre=40, post=60, delayed=55, **changes):
    row = dict.fromkeys(PILOT_FIELDS, '')
    row.update(study_id=study_id, consent_version='pilot-v1',
               consented_at='2026-10-01T10:00:00+08:00', group=group,
               pretest_form='form-a', pretest_score=str(pre),
               posttest_form='form-b' if post is not None else '',
               posttest_score='' if post is None else str(post),
               delayed_form='form-c' if delayed is not None else '',
               delayed_score='' if delayed is None else str(delayed),
               withdrawn='false', missing_reason='pending' if post is None or delayed is None else '')
    row.update(changes)
    return row


def _write_pilot(path, rows):
    with path.open('w', encoding='utf-8', newline='') as output:
        writer = csv.DictWriter(output, fieldnames=PILOT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def test_content_audit_exports_all_pilot_items_without_approving_them(tmp_path):
    before = [(item['id'], item['review_status']) for item in ITEMS]
    rows = worksheet_rows()
    assert len(rows) == 32
    assert all(row['needs_human_review'] for row in rows)
    output = tmp_path / 'audit.csv'
    assert export_csv(output)['needs_human_review'] == 32
    with output.open(encoding='utf-8-sig', newline='') as source:
        parsed = list(csv.DictReader(source))
    assert tuple(parsed[0]) == AUDIT_FIELDS
    assert len(parsed) == 32
    assert before == [(item['id'], item['review_status']) for item in ITEMS]
    with pytest.raises(FileExistsError):
        export_csv(output)
    assert export_csv(output, overwrite=True)['total'] == 32


def test_recommendation_arms_use_only_synthetic_cases_and_report_limitations():
    fixture = json.loads(FIXTURE.read_text(encoding='utf-8'))
    report = evaluate(fixture['cases'])
    assert report['case_count'] == 4
    assert report['arms']['rules']['topic_hit_rate'] == 1
    assert report['arms']['without_spending']['topic_hit_rate'] < 1
    assert report['arms']['without_answers']['topic_hit_rate'] < 1
    assert '不能推断教学效果' in ''.join(report['limitations'])
    with pytest.raises(ValueError, match='不允许的字段'):
        evaluate([{**fixture['cases'][0], 'user_id': 'student-1'}])
    with pytest.raises(ValueError, match='无金额'):
        evaluate([{**fixture['cases'][0], 'transactions': [{'date': '2026-10-11', 'amount': 500}]}])
    with pytest.raises(ValueError, match='之后'):
        evaluate([{**fixture['cases'][0], 'transactions': [{'date': '2026-10-12', 'category': '购物'}]}])


def test_user_time_holdout_excludes_boundary_leaks_and_same_scenario_family():
    key = 'fixed-before-study-2026'
    from hashlib import sha256

    def held_out(uid):
        return int.from_bytes(sha256((key + ':' + uid).encode()).digest()[:4], 'big') % 5 == 0

    test_uid = next(f'p-test-{i:03}' for i in range(100) if held_out(f'p-test-{i:03}'))
    train_uid = next(f'p-train-{i:03}' for i in range(100) if not held_out(f'p-train-{i:03}'))
    rows = [{'study_id': train_uid, 'observed_on': '2026-09-01', 'scenario_family': 'budget-a'},
            {'study_id': train_uid, 'observed_on': '2026-10-12', 'scenario_family': 'budget-a'},
            {'study_id': test_uid, 'observed_on': '2026-09-01', 'scenario_family': 'choice-b'},
            {'study_id': test_uid, 'observed_on': '2026-10-12', 'scenario_family': 'choice-b'}]
    result = partition_holdout(rows, '2026-10-01', key)
    assert [len(result[part]) for part in ('development', 'holdout', 'excluded')] == [1, 1, 2]
    assert result['development'][0]['study_id'] != result['holdout'][0]['study_id']
    with pytest.raises(ValueError, match='情境族'):
        partition_holdout([{**row, 'scenario_family': 'same'} for row in rows], '2026-10-01', key)


def test_empty_pilot_is_not_reported_as_an_effect():
    template = Path(__file__).resolve().parents[1] / 'evaluation' / 'pilot_template.csv'
    report = analyze(read_pilot(template))
    assert report['status'] == 'insufficient_data'
    assert report['between_group_post_gain_difference'] is None
    assert report['total_consented'] == 0


def test_paired_gains_attrition_and_rater_difference_are_aggregate_only(tmp_path):
    rows = [_pilot_row(f'p-base-{index:03}', 'baseline', post=50, delayed=45)
            for index in range(10)]
    rows += [_pilot_row(f'p-person-{index:03}', 'personalized', post=60, delayed=55,
                        rater_a='70', rater_b='75', burden_rating='2')
             for index in range(10)]
    rows.append(_pilot_row('p-pending-001', 'personalized', post=None, delayed=None))
    rows.append(_pilot_row('p-withdrew-01', 'baseline', post=None, delayed=None,
                           withdrawn='true', missing_reason='withdrew'))
    path = tmp_path / 'pilot.csv'
    _write_pilot(path, rows)
    report = analyze(read_pilot(path))
    assert report['status'] == 'descriptive_comparison_ready'
    assert report['groups']['baseline']['paired_post'] == 10
    assert report['groups']['baseline']['withdrawn'] == 1
    assert report['groups']['personalized']['post_pending'] == 1
    assert report['groups']['personalized']['mean_delayed_gain'] == 15
    assert report['groups']['personalized']['mean_rater_absolute_difference'] == 5
    assert report['between_group_post_gain_difference'] == 10
    assert 'p-person-' not in json.dumps(report)


@pytest.mark.parametrize('change,expected', [
    ({'study_id': 'name@example.com'}, '匿名编号'),
    ({'posttest_form': 'form-a'}, '重复使用'),
    ({'delayed_score': '101'}, '0—100'),
    ({'rater_a': '80'}, '成对填写'),
    ({'consented_at': '2026-10-01T10:00:00'}, '时区'),
    ({'delayed_score': '', 'delayed_form': '', 'missing_reason': ''}, '未完成测验'),
])
def test_invalid_pilot_input_fails_closed(tmp_path, change, expected):
    path = tmp_path / 'invalid.csv'
    row = _pilot_row('p-person-001', 'personalized')
    row.update(change)
    _write_pilot(path, [row])
    with pytest.raises(ValueError, match=expected):
        read_pilot(path)

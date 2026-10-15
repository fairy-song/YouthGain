"""Train/evaluate YouthGain HSTU on explicit consented point-in-time JSONL data.

--demo creates synthetic data ONLY. No live account data is read or exported.
Real datasets: train.jsonl, validation.jsonl, test.jsonl, ordered by decision time;
each row contains payload, labels (program_id -> [click|null, helpful|null]),
feedback_observed_at, consent_for_training=true and anonymous participant_id.
Only exposed/explicitly assessed candidates may have labels; unknown != negative.
"""
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
from pathlib import Path
import random

import torch
from torch.nn import functional as F
from app.services.hstu_model import YouthGainHSTU
from app.services.hstu_runtime import FEATURE_NAMES, FEATURE_VERSION, prepare, _stamp


def demo_data(seed=42):
    randomizer = random.Random(seed)
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    topics = ['预算管理', '储蓄规划', '风险识别', '机会成本', '贷款期限', '订阅支出', '分期付款', '应急资金']
    rows = []
    for i in range(192):
        topic = topics[i % len(topics)]
        stamp = base + timedelta(days=i)
        candidates = [{'program_id': f'demo-item-{i}-{j}', 'title': name+'学习案例',
                       'summary': name+'：结合真实情境理解概念并练习。', 'topics': [name],
                       'baseline_score': randomizer.random()} for j, name in enumerate(topics)]
        randomizer.shuffle(candidates)
        feature_values = {key: 0.0 for key in FEATURE_NAMES}
        feature_values['record_count'] = math.log1p(20)
        feature_values['available_remaining_month'] = math.log1p(randomizer.randint(100, 2000))
        history = [{'program_id': f'demo-history-{i}-{j}', 'title': topic+'学习案例',
                    'topics': [topic], 'action': 'helpful_yes' if j % 2 else 'click',
                    'occurred_at': (stamp-timedelta(hours=8-j)).isoformat()} for j in range(4)]
        rows.append({'participant_id': f'synthetic-{i}', 'consent_for_training': True,
                     'payload': {'feature_version': FEATURE_VERSION, 'snapshot_id': f'synthetic-{i}',
                                 'as_of': stamp.isoformat(), 'features': feature_values,
                                 'missing_mask': {k: 0 for k in FEATURE_NAMES}, 'learning_topic': topic,
                                 'history': history, 'candidates': candidates},
                     'labels': {c['program_id']: [int(topic in c['topics'])]*2 for c in candidates},
                     'feedback_observed_at': (stamp+timedelta(hours=1)).isoformat()})
    return rows[:128], rows[128:160], rows[160:]


def validated(rows):
    if not isinstance(rows, list) or not rows:
        raise ValueError('empty_training_partition')
    for row in rows:
        if row.get('consent_for_training') is not True or not isinstance(row.get('participant_id'), str) or not row['participant_id']:
            raise ValueError('training_requires_consent_and_anonymous_participant')
        payload = row['payload']
        prepare(payload)
        if not payload.get('snapshot_id') or _stamp(row['feedback_observed_at']) < _stamp(payload['as_of']):
            raise ValueError('invalid_snapshot_or_feedback_time')
        labels = row['labels']
        candidates = {c['program_id'] for c in payload['candidates']}
        if not isinstance(labels, dict) or set(labels) - candidates or not labels:
            raise ValueError('labels_must_reference_exposed_candidates')
        seen = False
        for value in labels.values():
            if not isinstance(value, list) or len(value) != 2 or any(v is not None and (type(v) not in (int, float) or v not in (0, 1)) for v in value):
                raise ValueError('invalid_click_helpful_labels')
            seen |= any(v is not None for v in value)
        if not seen:
            raise ValueError('no_observed_feedback_in_row')
    return rows


def validate_splits(parts):
    for rows in parts:
        validated(rows)
    for before, after in zip(parts, parts[1:]):
        if max(_stamp(r['feedback_observed_at']) for r in before) >= min(_stamp(r['payload']['as_of']) for r in after):
            raise ValueError('temporal_split_leaks_future_feedback')
    snapshots = [r['payload']['snapshot_id'] for rows in parts for r in rows]
    if len(snapshots) != len(set(snapshots)):
        raise ValueError('duplicate_snapshot_across_dataset')


def targets(row):
    values = [row['labels'].get(c['program_id'], [None, None]) for c in row['payload']['candidates']]
    return (torch.tensor([[[v or 0 for v in pair] for pair in values]], dtype=torch.float32),
            torch.tensor([[[v is not None for v in pair] for pair in values]], dtype=torch.float32))


def metrics(model, rows, ablation=None, baseline=False):
    ndcg, recall, losses = [], [], []
    model.eval()
    with torch.inference_mode():
        for row in rows:
            data = prepare(row['payload'], ablation=ablation)
            logits = model(data)
            y, mask = targets(row)
            losses.append(float((F.binary_cross_entropy_with_logits(logits, y, reduction='none')*mask).sum()/mask.sum().clamp_min(1)))
            scores = [.35*float(p[0])+.65*float(p[1]) for p in logits.sigmoid()[0]]
            if baseline:
                scores = [float(c.get('baseline_score', 0)) for c in row['payload']['candidates']]
            # Fair candidate pool: do not rank unknown labels as negatives.
            observed = [(i, pair[1] if pair[1] is not None else pair[0]) for i, pair in enumerate(
                row['labels'].get(c['program_id'], [None, None]) for c in row['payload']['candidates'])
                if any(v is not None for v in pair)]
            positives = sum(label for _, label in observed)
            if not positives or positives == len(observed):
                continue
            k = min(5, len(observed))
            order = sorted(observed, key=lambda item: -scores[item[0]])[:k]
            dcg = sum(label/math.log2(rank+2) for rank, (_, label) in enumerate(order))
            ideal = sum(1/math.log2(rank+2) for rank in range(min(k, int(positives))))
            ndcg.append(dcg/ideal)
            recall.append(sum(label for _, label in order)/positives)
    return {'loss': sum(losses)/len(losses), 'ndcg_at_5': sum(ndcg)/len(ndcg) if ndcg else None,
            'recall_at_5': sum(recall)/len(recall) if recall else None, 'eligible_queries': len(ndcg),
            'rows': len(rows), 'note': '只评价观察到反馈的候选；不足以估计无偏线上收益。'}


def train(parts, output, *, epochs=6, demo=False):
    validate_splits(parts)
    torch.set_num_threads(2)
    torch.manual_seed(42)
    rng = random.Random(42)
    model = YouthGainHSTU(len(FEATURE_NAMES))
    optimizer = torch.optim.AdamW(model.parameters(), lr=.001, weight_decay=.01)
    before = metrics(model, parts[0])
    history, steps, best, best_state = [], 0, math.inf, None
    cached = [(prepare(r['payload']), *targets(r)) for r in parts[0]]
    for epoch in range(epochs):
        model.train()
        rng.shuffle(cached)
        losses = []
        for batch, y, mask in cached:
            optimizer.zero_grad(set_to_none=True)
            loss = (F.binary_cross_entropy_with_logits(model(batch), y, reduction='none')*mask).sum()/mask.sum().clamp_min(1)
            if not torch.isfinite(loss):
                raise ValueError('training_loss_not_finite')
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1)
            optimizer.step()
            losses.append(float(loss.detach())); steps += 1
        valid = metrics(model, parts[1])
        history.append({'epoch': epoch+1, 'training_loss': sum(losses)/len(losses), 'validation': valid})
        if valid['loss'] < best:
            best = valid['loss']
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
        print(json.dumps(history[-1], ensure_ascii=False), flush=True)
    model.load_state_dict(best_state)
    evaluation = {'training_kind': 'demo' if demo else 'real', 'initial_training': before,
                  'final_training': metrics(model, parts[0]), 'validation': metrics(model, parts[1]),
                  'test': metrics(model, parts[2]), 'baseline_test': metrics(model, parts[2], baseline=True),
                  'ablations': {name: metrics(model, parts[2], ablation=name) for name in ('history', 'finance', 'time', 'actions')},
                  'epochs': history, 'warning': '合成数据仅验证训练和推理流程，不证明真实推荐质量或金融素养提升。' if demo else '离线观察性反馈存在选择偏差，需另行在线与教育评估。'}
    digest = hashlib.sha256(json.dumps(parts, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    version = f'youthgain-hstu-{"demo" if demo else "real"}-{digest[:12]}'
    checkpoint = {'schema_version': 1, 'model_version': version, 'feature_version': FEATURE_VERSION,
                  'feature_names': list(FEATURE_NAMES), 'config': model.config, 'state_dict': best_state,
                  'training_kind': 'demo' if demo else 'real', 'trained_steps': steps,
                  'dataset_sha256': digest, 'created_at': datetime.now(timezone.utc).isoformat(),
                  'evaluation': evaluation}
    output.mkdir(parents=True, exist_ok=True)
    temporary = output / 'model.pt.tmp'
    torch.save(checkpoint, temporary)
    temporary.replace(output / 'model.pt')
    (output / 'evaluation.json').write_text(json.dumps(evaluation, ensure_ascii=False, indent=2), encoding='utf-8')
    (output / 'manifest.json').write_text(json.dumps({k: v for k, v in checkpoint.items() if k not in ('state_dict', 'evaluation')}, ensure_ascii=False, indent=2), encoding='utf-8')
    return evaluation


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--demo', action='store_true')
    group.add_argument('--data', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--epochs', type=int, default=6)
    args = parser.parse_args()
    if not 1 <= args.epochs <= 100:
        parser.error('epochs must be between 1 and 100')
    if args.demo:
        partitions = demo_data()
    else:
        partitions = tuple([json.loads(line) for line in (args.data / f'{name}.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
                           for name in ('train', 'validation', 'test'))
    train(partitions, args.output, epochs=args.epochs, demo=args.demo)

"""Strict shared preprocessing and checkpoint loading for training and serving."""
from datetime import datetime
from functools import lru_cache
import hashlib
import json
import math
from pathlib import Path
import re
import threading

import torch
from .hstu_model import YouthGainHSTU

FEATURE_VERSION = 'finance-context-v2'
FEATURE_NAMES = tuple(sorted((
    'actual_income_month', 'net_expense_month', 'actual_income_30d', 'net_expense_30d', 'net_expense_7d',
    'record_count', 'recorded_surplus_month', 'expected_monthly_income', 'confirmed_balance',
    'essential_monthly', 'emergency_buffer', 'expected_income_30d', 'upcoming_30d', 'upcoming_7d',
    'upcoming_count', 'nearest_upcoming_days', 'active_goal_count', 'goal_remaining', 'nearest_goal_days',
    'savings_locked_total', 'carryover_month', 'available_remaining_month', 'savings_net_transfer_month',
    'goal_plan_shortfall', 'planned_free_now')))
ACTIONS = {name: index + 1 for index, name in enumerate(
    ('click', 'follow', 'unfollow', 'dislike', 'helpful_yes', 'helpful_no', 'undo', 'impression', 'served', 'undislike'))}
_lock = threading.RLock()


def _stamp(value):
    stamp = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    if stamp.tzinfo is None:
        raise ValueError('timestamp_requires_timezone')
    return stamp.timestamp()


def _hash(value, buckets):
    return int.from_bytes(hashlib.blake2b(str(value).encode(), digest_size=8).digest(), 'little') % (buckets - 1) + 1


def _text(item, buckets):
    text = ' '.join([str(item.get('title', ''))[:200], str(item.get('summary', ''))[:1200],
                     ' '.join(str(t) for t in item.get('topics', [])[:12])])
    words = re.findall(r'[a-z0-9]+|[\u4e00-\u9fff]', text.lower())
    words += [text[i:i+2] for i in range(max(0, len(text)-1)) if re.fullmatch(r'[\u4e00-\u9fff]{2}', text[i:i+2])]
    return [_hash(w, buckets) for w in words[:96]] or [0]


def prepare(payload, buckets=4096, *, ablation=None):
    if not isinstance(payload, dict) or payload.get('feature_version') != FEATURE_VERSION:
        raise ValueError('feature_version_mismatch')
    as_of = _stamp(payload['as_of'])
    features, mask = payload['features'], payload['missing_mask']
    if set(features) != set(FEATURE_NAMES) or set(mask) != set(FEATURE_NAMES):
        raise ValueError('feature_schema_mismatch')
    numeric, missing = [], []
    for key in FEATURE_NAMES:
        value, absent = features[key], mask[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or abs(value) > 32:
            raise ValueError('invalid_scaled_feature')
        if type(absent) is not int or absent not in (0, 1) or absent == 1 and value != 0:
            raise ValueError('invalid_missing_mask')
        numeric.append(value if ablation != 'finance' else 0)
        missing.append(absent if ablation != 'finance' else 1)
    candidates = payload.get('candidates')
    history = payload.get('history', [])
    if not isinstance(candidates, list) or not 1 <= len(candidates) <= 100 or not isinstance(history, list) or len(history) > 100:
        raise ValueError('invalid_sequence_size')
    ids = [c.get('program_id') for c in candidates if isinstance(c, dict)]
    if len(ids) != len(candidates) or any(not isinstance(i, str) or not 1 <= len(i) <= 200 for i in ids) or len(set(ids)) != len(ids):
        raise ValueError('invalid_candidate_identifiers')
    previous = -math.inf
    for event in history:
        if not isinstance(event, dict) or not isinstance(event.get('program_id'), str) or event.get('action') not in ACTIONS:
            raise ValueError('invalid_history_event')
        observed = _stamp(event['occurred_at'])
        if not previous <= observed < as_of:
            raise ValueError('history_not_before_snapshot_or_not_sorted')
        previous = observed
    history = history[-64:] if ablation != 'history' else []
    # One masked slot for empty history keeps padded tensors rectangular.
    selected = history or [{'program_id': '', 'action': 'impression', 'occurred_at': payload['as_of']}]
    ids_h = [_hash(e['program_id'], buckets) if history else 0 for e in selected]
    def padded_text(items):
        values = [_text(item, buckets) for item in items]
        return torch.tensor([[v + [0] * (96-len(v)) for v in values]], dtype=torch.long)
    data = {
        'history_ids': torch.tensor([ids_h]), 'history_text': padded_text(selected),
        'actions': torch.tensor([[ACTIONS[e['action']] if history and ablation != 'actions' else 0 for e in selected]]),
        'timestamps': torch.tensor([[_stamp(e['occurred_at'])-as_of if ablation != 'time' else 0 for e in selected]], dtype=torch.float32),
        'valid': torch.tensor([[bool(history)] * len(selected)]),
        'candidate_ids': torch.tensor([[_hash(i, buckets) for i in ids]]),
        'candidate_text': padded_text(candidates),
        'features': torch.tensor([numeric], dtype=torch.float32), 'missing_mask': torch.tensor([missing], dtype=torch.float32),
        'learning_topic': padded_text([{'title': str(payload.get('learning_topic', ''))[:200]}])[:, 0],
    }
    return data


@lru_cache(maxsize=2)
def _load(path, modified, size):
    # weights_only prevents arbitrary pickle execution. Local model path is administrator controlled.
    data = torch.load(path, map_location='cpu', weights_only=True)
    if (data.get('schema_version') != 1 or data.get('feature_version') != FEATURE_VERSION
            or tuple(data.get('feature_names', [])) != FEATURE_NAMES or data.get('trained_steps', 0) < 1
            or data.get('training_kind') not in ('demo', 'real')):
        raise ValueError('invalid_or_untrained_checkpoint')
    config = data['config']
    if config.get('feature_count') != len(FEATURE_NAMES) or config.get('dimension') not in (32, 48, 64) or not 1 <= config.get('layers', 0) <= 4 or config.get('buckets') != 4096 or config.get('heads') != 4:
        raise ValueError('unsupported_model_config')
    model = YouthGainHSTU(**config)
    model.load_state_dict(data['state_dict'], strict=True)
    if not all(torch.isfinite(p).all() for p in model.parameters()):
        raise ValueError('nonfinite_checkpoint')
    model.eval()
    return model, data


def predict(payload, path, *, allow_demo=False, production=False):
    path = Path(path or '').resolve()
    if not path.is_file() or path.stat().st_size > 100 * 1024 * 1024:
        raise ValueError('hstu_checkpoint_unavailable')
    with _lock:
        model, metadata = _load(str(path), path.stat().st_mtime_ns, path.stat().st_size)
        if metadata['training_kind'] == 'demo' and (production or not allow_demo):
            raise ValueError('demo_checkpoint_not_allowed')
        data = prepare(payload, model.config['buckets'])
        with torch.inference_mode():
            probabilities = model(data).sigmoid()[0]
        if not torch.isfinite(probabilities).all():
            raise ValueError('nonfinite_predictions')
        scores = .35 * probabilities[:, 0] + .65 * probabilities[:, 1]
        return {'model_version': metadata['model_version'], 'training_kind': metadata['training_kind'],
                'scores': [{'program_id': c['program_id'], 'score': float(scores[i]),
                            'click_probability': float(probabilities[i, 0]),
                            'helpful_probability': float(probabilities[i, 1])} for i, c in enumerate(payload['candidates'])],
                'cold_start': not bool(payload.get('history')),
                'probability_note': '模型输出尚未做概率校准；有帮助反馈不等于金融素养提升。'}

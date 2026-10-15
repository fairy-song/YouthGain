"""Local/external HSTU inference with independent baseline and shadow modes."""
import json
import math
import time
from urllib.parse import urlsplit

import requests
from flask import current_app


def rank(candidates, snapshot, history, learning_topic=None):
    mode = current_app.config.get('PODCAST_RANKER_MODE', 'baseline')
    baseline = {c['program']['id']: c['score'] for c in candidates}
    result = {'scores': baseline, 'mode': mode, 'used': 'baseline', 'model_version': 'finance-baseline-v2',
              'fallback': False, 'fallback_reason': None}
    coverage = snapshot.get('coverage', {})
    if coverage.get('invalid_transactions') or any(coverage.get(k) is False for k in ('transactions_complete', 'goals_complete', 'entries_complete')):
        return dict(result, fallback=True, fallback_reason='finance_source_unavailable')
    if not snapshot.get('features', {}).get('record_count'):
        return dict(result, fallback=True, fallback_reason='insufficient_finance_data')
    if mode == 'baseline' or not candidates:
        return result
    if mode not in ('shadow', 'hstu', 'local_hstu', 'local_shadow'):
        return dict(result, fallback=True, fallback_reason='invalid_mode')
    try:
        payload = make_payload(candidates, snapshot, history, learning_topic)
        if mode in ('local_hstu', 'local_shadow'):
            from .hstu_runtime import predict
            started = time.monotonic()
            data = predict(payload, current_app.config.get('PODCAST_HSTU_MODEL_PATH'),
                           allow_demo=current_app.config.get('PODCAST_HSTU_ALLOW_DEMO') is True,
                           production=str(current_app.config.get('APP_ENV', '')).strip().lower() == 'production')
            result['inference_ms'] = round((time.monotonic()-started)*1000, 2)
            result['training_kind'] = data['training_kind']
            result['cold_start'] = data['cold_start']
            if mode == 'local_shadow':
                result['shadow'] = data
            else:
                result.update(scores={s['program_id']: s['score'] for s in data['scores']},
                              used='hstu', model_version=data['model_version'])
            return result
        url = current_app.config.get('PODCAST_HSTU_URL') or ''
        parts = urlsplit(url)
        if parts.scheme not in ('https', 'http') or not parts.hostname or parts.username or parts.password or parts.fragment:
            raise ValueError('invalid_endpoint')
        timeout = float(current_app.config.get('PODCAST_HSTU_TIMEOUT_SECONDS', 2))
        if not math.isfinite(timeout) or not 0 < timeout <= 30:
            raise ValueError('invalid_timeout')
        # Only derived features and content metadata cross this internal boundary.
        headers = {}
        key = current_app.config.get('PODCAST_HSTU_API_KEY')
        if key:
            headers['Authorization'] = f'Bearer {key}'
        started = time.monotonic()
        with requests.post(url, json=payload, headers=headers, timeout=(min(timeout, 1), timeout),
                           allow_redirects=False, stream=True) as response:
            if response.status_code != 200:
                raise ValueError('http_error')
            chunks, size = [], 0
            for chunk in response.iter_content(8192):
                size += len(chunk)
                if size > 65536 or time.monotonic() - started > timeout:
                    raise ValueError('response_limit')
                chunks.append(chunk)
            data = json.loads(b''.join(chunks))
        if data.get('training_kind') == 'demo':
            if (str(current_app.config.get('APP_ENV', '')).strip().lower() == 'production'
                    or current_app.config.get('PODCAST_HSTU_ALLOW_DEMO') is not True):
                raise ValueError('demo_checkpoint_not_allowed')
            result['training_kind'] = 'demo'
        version = data.get('model_version')
        if not isinstance(version, str) or not version.strip() or len(version) > 100:
            raise ValueError('invalid_model_version')
        scores = {}
        for item in data.get('scores', []):
            identifier, score = item['program_id'], item['score']
            if identifier not in baseline or identifier in scores or isinstance(score, bool) or not isinstance(score, (int, float)) or not math.isfinite(score):
                raise ValueError('invalid_scores')
            scores[identifier] = score
        if set(scores) != set(baseline):
            raise ValueError('incomplete_scores')
        if mode == 'shadow':
            result['shadow'] = {'model_version': version, 'scores': scores}
        else:
            result.update(scores=scores, used='hstu', model_version=version)
        return result
    except requests.Timeout:
        reason = 'timeout'
    except requests.RequestException:
        reason = 'connection_error'
    except (ValueError, TypeError, KeyError, AttributeError, OverflowError, OSError, ImportError, RuntimeError):
        reason = 'invalid_response_or_config'
    return dict(result, fallback=True, fallback_reason=reason)


def make_payload(candidates, snapshot, history, learning_topic=None):
    """Shared immutable model input; baseline score is diagnostic, never a neural feature."""
    return {'feature_version': snapshot['feature_version'], 'snapshot_id': snapshot['snapshot_id'],
            'as_of': snapshot['as_of'], 'features': snapshot['scaled_features'],
            'missing_mask': snapshot['missing_mask'], 'history': history,
            'learning_topic': snapshot.get('learning_topic', '') if learning_topic is None else learning_topic,
            'candidates': [{'program_id': c['program']['id'], 'topics': c['program']['topics'],
                            'title': c['program']['episode_title'], 'summary': c['program']['episode_summary'],
                            'difficulty': c['program'].get('difficulty'),
                            'baseline_score': c['score']} for c in candidates]}

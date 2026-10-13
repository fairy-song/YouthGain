"""External HSTU client; baseline and shadow never depend on model availability."""
import json
import math
import time
from urllib.parse import urlsplit

import requests
from flask import current_app


def rank(candidates, snapshot, history):
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
    if mode not in ('shadow', 'hstu'):
        return dict(result, fallback=True, fallback_reason='invalid_mode')
    try:
        url = current_app.config.get('PODCAST_HSTU_URL') or ''
        parts = urlsplit(url)
        if parts.scheme not in ('https', 'http') or not parts.hostname or parts.username or parts.password or parts.fragment:
            raise ValueError('invalid_endpoint')
        timeout = float(current_app.config.get('PODCAST_HSTU_TIMEOUT_SECONDS', 2))
        if not math.isfinite(timeout) or not 0 < timeout <= 30:
            raise ValueError('invalid_timeout')
        # Only derived features and content metadata cross this internal boundary.
        payload = {'feature_version': snapshot['feature_version'], 'snapshot_id': snapshot['snapshot_id'],
                   'as_of': snapshot['as_of'], 'features': snapshot['scaled_features'],
                   'missing_mask': snapshot['missing_mask'], 'history': history,
                   'candidates': [{'program_id': c['program']['id'], 'topics': c['program']['topics'],
                                   'title': c['program']['episode_title'],
                                   'summary': c['program']['episode_summary'],
                                   'baseline_score': c['score']} for c in candidates]}
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
    except (ValueError, TypeError, KeyError, AttributeError, OverflowError):
        reason = 'invalid_response_or_config'
    return dict(result, fallback=True, fallback_reason=reason)

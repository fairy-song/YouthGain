"""Populate/refresh a dedicated local demo account through the running app API.

All sample records are labelled. Existing personal accounts are never changed.
Run with the project's Python while the local backend is running.
"""
import argparse
from datetime import datetime, timedelta
import json
from pathlib import Path
import shutil
import sqlite3
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

import requests


ROOT = Path(__file__).resolve().parents[1]
EMAIL = 'demo@youthgain.local'
MARKER = '【检验样例】'


def sample_transactions(today):
    rows = []
    start = today - timedelta(days=27)
    for offset in range(28):
        day = start + timedelta(days=offset)
        rows.append({'date': day.isoformat(), 'amount': 24 + offset % 4 * 3,
                     'category': '餐饮', 'merchant': MARKER + '校园食堂', 'hour': 12,
                     'transaction_type': 'expense', 'planned': 'necessary',
                     'note': f'{MARKER}demo-v1:{day}:meal', 'purpose': '合成校园日常消费，仅用于功能检验'})
        if offset % 4 == 0:
            rows.append({'date': day.isoformat(), 'amount': 8, 'category': '交通',
                         'merchant': MARKER + '公交', 'transaction_type': 'expense',
                         'note': f'{MARKER}demo-v1:{day}:transport', 'planned': 'necessary'})
        if offset % 7 == 0:
            rows.append({'date': day.isoformat(), 'amount': 68, 'category': '购物',
                         'merchant': MARKER + '校园商店', 'transaction_type': 'expense',
                         'note': f'{MARKER}demo-v1:{day}:shopping', 'planned': 'spontaneous'})
    rows.append({'date': today.replace(day=1).isoformat(), 'amount': 3200,
                 'category': '生活费', 'merchant': MARKER + '模拟到账', 'transaction_type': 'income',
                 'receipt_kind': 'other_income', 'note': f'{MARKER}demo-v1:{today:%Y-%m}:income'})
    return rows


def refresh(base_url):
    parts = urlsplit(base_url)
    if parts.scheme != 'http' or parts.hostname not in ('127.0.0.1', 'localhost') or parts.username or parts.password or parts.path not in ('', '/'):
        raise ValueError('Demo data can only be sent to the local development server.')
    session = requests.Session()
    session.trust_env = False
    session.headers.update({'X-Dev-Email': EMAIL})

    def api(method, path, data=None):
        response = session.request(method, base_url.rstrip('/') + '/api' + path, json=data, timeout=30)
        response.raise_for_status()
        return response.json()

    identity = api('POST', '/auth/verify_token', {})
    if identity.get('message') != 'Token verified successfully (DEV MODE)' or identity.get('user', {}).get('email') != EMAIL:
        raise ValueError('Refusing to seed outside explicitly enabled local development authentication.')
    previous = api('GET', '/learning/profile')['profile']
    existing = api('GET', '/decision/transactions?limit=10000')['data']['transactions']
    if (previous and not previous.get('personal_rule', '').startswith(MARKER)) or any(not row.get('note', '').startswith(MARKER) for row in existing):
        raise ValueError('This demo address already contains unlabelled records; refusing to overwrite it.')

    today = datetime.now(ZoneInfo('Asia/Shanghai')).date()
    backup = ROOT / 'tmp' / ('demo-account-before-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
    backup.mkdir(parents=True)
    data_file = ROOT / 'backend/dev_data.json'
    if data_file.exists():
        shutil.copy2(data_file, backup / 'dev_data.json')
    # SQLite's backup API includes committed WAL records while the server runs.
    db_file = ROOT / 'backend/podcasts.db'
    if db_file.exists():
        with sqlite3.connect(db_file) as source, sqlite3.connect(backup / 'podcasts.db') as destination:
            source.backup(destination)

    profile = {'monthly_income': 3200, 'income_day': 1, 'topic': 'budget',
               'essential_monthly': 1500, 'emergency_buffer': 600,
               'income_sources': ['allowance'], 'onboarding_complete': True,
               'timezone': 'Asia/Shanghai',
               'personal_rule': MARKER + '所有收支与目标均为合成数据；每周复盘一次，不要求每天登录。'}
    api('PUT', '/learning/profile', profile)
    known = {row.get('note') for row in existing}
    added = 0
    for row in sample_transactions(today):
        if row['note'] not in known:
            api('POST', '/decision/transactions', row)
            known.add(row['note'])
            added += 1
    goals = api('GET', '/dashboard/goals')['data']['goals']
    if not any(goal.get('title', '').startswith(MARKER) for goal in goals):
        api('POST', '/dashboard/goals', {'title': MARKER + '学习设备储蓄',
            'description': '合成目标，用于检验资金锁定与规划', 'target_amount': 2400,
            'current_amount': 600, 'deadline': (today + timedelta(days=60)).isoformat(), 'status': 'active'})
    api('POST', '/decision/funds/carryover', {'month': today.strftime('%Y-%m'), 'amount': 1500,
        'event_id': f'demo-v1-carryover-{today:%Y-%m}'})
    entries = api('GET', '/learning')['entries']
    for title, amount, days in [('资料费', 180, 3), ('回家交通费', 260, 10)]:
        if not any(entry.get('kind') == 'upcoming' and entry.get('title') == MARKER + title
                   and not entry.get('handled') and entry.get('due_date', '') >= today.isoformat() for entry in entries):
            api('POST', '/learning/entries/upcoming', {'title': MARKER + title, 'amount': amount,
                'due_date': (today + timedelta(days=days)).isoformat()})
    funds = api('GET', '/decision/funds')['data']
    if not funds.get('available_complete') or funds.get('available_remaining_month') is None:
        raise ValueError('Sample account written but funds are incomplete; see backup and check server errors.')
    api('PUT', '/learning/profile', {'current_balance': funds['available_remaining_month'] + (funds.get('savings_locked_total') or 0)})
    result = {'email': EMAIL, 'date': today.isoformat(), 'added_transactions': added,
              'available_remaining_month': funds['available_remaining_month'],
              'savings_locked_total': funds['savings_locked_total'], 'backup': str(backup)}
    (backup / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:5001')
    args = parser.parse_args()
    try:
        print(json.dumps(refresh(args.base_url), ensure_ascii=False, indent=2))
    except (ValueError, requests.RequestException, OSError) as error:
        raise SystemExit(str(error)) from error

"""Project-scoped research workflow. Raw records stay in the trusted backend."""
import json
import re
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta

from flask import current_app
from .checkin_service import BEIJING
from .research_store import transaction as store_transaction
from .research_privacy import contribution, release

CONSENT_VERSION = 'research-consent-v1'
EPSILON_MILLI = 1000


class ResearchError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def now():
    return datetime.now(BEIJING)


@contextmanager
def transaction():
    with store_transaction() as state:
        # No extracted features are persisted. Expire consent identifiers after
        # the agreed window, while retaining DP snapshots and spent budgets.
        for pid, project in state['projects'].items():
            expiry = next_month(month_date(project['end_month'])) + timedelta(days=90)
            if now().date() >= expiry:
                state['consents'].pop(pid, None)
        yield state


def month_date(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}', value):
        raise ResearchError('月份格式应为 YYYY-MM')
    try:
        parsed = date.fromisoformat(value + '-01')
        if not 2000 <= parsed.year <= 2100:
            raise ValueError
        return parsed
    except ValueError:
        raise ResearchError('月份无效')


def next_month(day):
    return (day.replace(day=1) + timedelta(days=32)).replace(day=1)


def text(payload, key, limit):
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
        label = {'title': '项目名称', 'school': '学校名称', 'purpose': '研究目的', 'email': '研究者邮箱'}.get(key, key)
        raise ResearchError(f'{label}必须填写且不超过 {limit} 字')
    return value.strip()


def get_project(state, project_id):
    project = state['projects'].get(project_id)
    if not project:
        raise ResearchError('研究项目不存在', 404)
    return project


def allowed(project, user):
    if user.get('role') == 'admin':
        return True
    from .auth_service import is_dev_bypass_enabled
    if not user.get('email_verified') and not is_dev_bypass_enabled():
        return False
    member = project['researchers'].get(str(user.get('email', '')).lower())
    return bool(member and member >= now().date().isoformat())


def require_project(project, user):
    if not allowed(project, user):
        raise ResearchError('没有此学校研究项目的访问权限', 403)


def public_project(project):
    return {k: project[k] for k in ('id', 'title', 'school', 'purpose', 'start_month', 'end_month', 'mode', 'consent_version')}


def audit(state, user, action, project_id):
    state['audit'].append({'at': now().isoformat(), 'actor': user['uid'], 'action': action, 'project_id': project_id})


def access(user):
    with transaction() as state:
        projects = []
        for p in state['projects'].values():
            if allowed(p, user):
                projects.append({**public_project(p), 'epsilon_total': p['budget_milli'] / 1000,
                                 'epsilon_spent': p['spent_milli'] / 1000,
                                 'researchers': p['researchers'] if user.get('role') == 'admin' else None})
        admin = user.get('role') == 'admin'
        from .auth_service import is_dev_bypass_enabled
        return {'role': 'admin' if admin else 'research' if projects else 'student',
                'projects': projects, 'can_manage': admin,
                'requires_email_verification': not admin and not user.get('email_verified') and not is_dev_bypass_enabled(),
                'global_budget': state['budget'] if admin else None,
                'live_enabled': current_app.config.get('RESEARCH_LIVE_ENABLED', False)}


def create_project(user, payload):
    start, end = month_date(payload.get('start_month')), month_date(payload.get('end_month'))
    length = (end.year - start.year) * 12 + end.month - start.month + 1
    if not 1 <= length <= 6:
        raise ResearchError('每个项目研究期为 1 至 6 个月')
    mode = payload.get('mode', 'demo')
    if mode not in ('demo', 'live'):
        raise ResearchError('研究模式无效')
    if mode == 'live':
        if not current_app.config.get('RESEARCH_LIVE_ENABLED', False):
            raise ResearchError('真实研究尚未启用，请先完成研究配置与验收', 409)
        if start < now().date().replace(day=1):
            raise ResearchError('真实项目不能追溯创建历史研究期')
    project = {'id': uuid.uuid4().hex, 'title': text(payload, 'title', 100),
               'school': text(payload, 'school', 100), 'purpose': text(payload, 'purpose', 1000),
               'start_month': start.strftime('%Y-%m'), 'end_month': end.strftime('%Y-%m'),
               'mode': mode, 'consent_version': CONSENT_VERSION, 'researchers': {},
               'budget_milli': length * EPSILON_MILLI, 'spent_milli': 0}
    with transaction() as state:
        state['projects'][project['id']] = project
        audit(state, user, 'create_project', project['id'])
    return public_project(project)


def membership(user, project_id, payload):
    email = text(payload, 'email', 254).lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        raise ResearchError('请输入有效研究者邮箱')
    revoke = payload.get('revoke') is True
    expires = payload.get('expires')
    if not revoke:
        try:
            expiry_day = date.fromisoformat(expires)
            if expiry_day < now().date():
                raise ValueError
            expires = expiry_day.isoformat()
        except (TypeError, ValueError):
            raise ResearchError('授权截止日期无效')
    with transaction() as state:
        project = get_project(state, project_id)
        if revoke:
            project['researchers'].pop(email, None)
        else:
            project['researchers'][email] = expires
        audit(state, user, 'revoke_member' if revoke else 'grant_member', project_id)
    return {'message': '研究权限已更新'}


def student_projects(user):
    with transaction() as state:
        result = []
        for p in state['projects'].values():
            if p['mode'] != 'live':
                continue
            consent = state['consents'].get(p['id'], {}).get(user['uid'])
            result.append({**public_project(p), 'consent': consent,
                           'can_join': bool(current_app.config.get('RESEARCH_LIVE_ENABLED', False)) and next_month(now().date()).strftime('%Y-%m') <= p['end_month']})
        return result


def consent(user, project_id, payload):
    if type(payload.get('participate')) is not bool:
        raise ResearchError('请选择参与或退出')
    active = payload['participate']
    with transaction() as state:
        project = get_project(state, project_id)
        if project['mode'] != 'live':
            raise ResearchError('模拟项目不收集学生数据')
        previous = state['consents'].setdefault(project_id, {}).get(user['uid'])
        if active:
            if payload.get('version') != CONSENT_VERSION:
                raise ResearchError('请阅读最新研究说明后再参与', 409)
            if not current_app.config.get('RESEARCH_LIVE_ENABLED', False):
                raise ResearchError('真实研究当前未启用', 409)
            effective = max(next_month(now().date()).strftime('%Y-%m'), project['start_month'])
            if effective > project['end_month']:
                raise ResearchError('项目已停止接收新的研究参与')
            if previous and previous['active']:
                return previous
            record = {'active': True, 'version': CONSENT_VERSION, 'joined_at': now().isoformat(),
                      'effective_month': effective}
        else:
            # No raw research features persist: only eligibility is retained.
            record = {**(previous or {}), 'active': False, 'withdrawn_at': now().isoformat()}
        state['consents'][project_id][user['uid']] = record
        # Consent audit stays account-scoped; no participant list is published.
        return record


def _vectors(state, project, month):
    if project['mode'] == 'demo':
        # Deterministic synthetic source, completely independent of student data.
        return [contribution([{'date': month + '-10', 'amount': 100 + (i * 137) % 3500,
                               'category': ['餐饮', '交通', '购物', '学习', '娱乐'][i % 5]}],
                             2000 if i % 7 else None, month) for i in range(200)]
    from .user_data_service import user_data_service
    from . import learning_store
    vectors = []
    for uid, record in state['consents'].get(project['id'], {}).items():
        if not record.get('active') or record['effective_month'] > month:
            continue
        # Private truncation/invalid rows never cause a public sample-count error.
        # Fetch a fixed bounded number; the feature is defined on these records.
        rows, error = user_data_service.get_user_data(uid, 'transactions', limit=2000)
        if error:
            raise RuntimeError('研究数据源暂时不可用')
        profile = learning_store.read_entry(uid, 'profile') or {}
        # This is explicitly the budget present at publication, not a historical claim.
        vectors.append(contribution(rows, profile.get('monthly_income'), month))
    return vectors


def publish(user, project_id, month):
    start = month_date(month)
    if start >= now().date().replace(day=1):
        raise ResearchError('仅能发布已结束自然月的统计')
    key = project_id + ':' + month
    with transaction() as state:
        project = get_project(state, project_id)
        if not project['start_month'] <= month <= project['end_month']:
            raise ResearchError('月份不在项目研究期内')
        if key in state['releases']:
            return state['releases'][key]
        if project['mode'] == 'live' and now().date() >= next_month(month_date(project['end_month'])) + timedelta(days=90):
            raise ResearchError('项目研究数据保存期已结束，不能生成新的发布', 409)
        if project['mode'] == 'live' and not current_app.config.get('RESEARCH_LIVE_ENABLED', False):
            raise ResearchError('真实研究当前未启用', 409)
        if project['spent_milli'] + EPSILON_MILLI > project['budget_milli']:
            raise ResearchError('项目隐私预算已耗尽', 409)
        budget = state['budget']
        charge = EPSILON_MILLI if project['mode'] == 'live' else 0
        if budget['spent_milli'] + charge > budget['total_milli']:
            raise ResearchError('平台累计隐私预算不足', 409)
        result = release(_vectors(state, project, month), EPSILON_MILLI / 1000)
        result.update(project_id=project_id, school=project['school'], title=project['title'],
                      month=month, mode=project['mode'], published_at=now().isoformat(),
                      record_scope='每名参与者在发布时可读取的最近最多2000笔记录中，属于本月的有效记录；预算为发布时资料值。',
                      trust_boundary='青盈可信后端处理明细；学校研究者仅获取受保护快照。')
        state['releases'][key] = result
        project['spent_milli'] += EPSILON_MILLI
        budget['spent_milli'] += charge
        budget['entries'].append({'release': key, 'epsilon_milli': charge, 'at': result['published_at'], 'mode': project['mode']})
        audit(state, user, 'publish', project_id)
        return result


def releases(user, project_id):
    with transaction() as state:
        require_project(get_project(state, project_id), user)
        return sorted([r for r in state['releases'].values() if r['project_id'] == project_id], key=lambda r: r['month'])


def export_release(user, project_id, month):
    month_date(month)
    with transaction() as state:
        require_project(get_project(state, project_id), user)
        result = state['releases'].get(project_id + ':' + month)
        if not result:
            raise ResearchError('该月尚未发布', 404)
        audit(state, user, 'export', project_id)
        return json.dumps(result, ensure_ascii=False, indent=2)

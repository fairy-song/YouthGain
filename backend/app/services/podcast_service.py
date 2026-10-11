"""Reviewed episode discovery. Only publisher metadata is ingested, never audio."""
import hashlib
import html
import ipaddress
import json
import math
import re
import socket
from datetime import date, datetime, timedelta
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from xml.etree import ElementTree

import requests
from flask import current_app

from .checkin_service import BEIJING
from . import learning_store, podcast_store
from .podcast_starter_catalog import EPISODES as STARTER_EPISODES
from .user_data_service import user_data_service
from .adaptive_learning import ITEMS, VERSION as LEARNING_VERSION

MODEL_VERSION = 'topic-charhash-v1'
RANK_VERSION = 'reviewed-topic-v1'
VECTOR_SIZE = 256
MIN_QUALITY = 0.75
COOLDOWN_DAYS = 30
ACTIVE_DAYS = 180
SOURCE_MAX_AGE_DAYS = 30
TOPIC_TEXT = {
    'budget': '预算 收支 生活费 固定开支 房租 账单 现金流 必要支出 规划',
    'choice': '消费选择 取舍 购物 冲动消费 比较方案 需求 目标',
    'buffer': '应急储蓄 预留 备用金 不定期开支 意外 风险缓冲',
    'risk': '金融风险 债务 分期 利息 诈骗 合同 不确定性',
}
DIFFICULTY = {'beginner': 1, 'basic': 2, 'intermediate': 2, 'advanced': 3}
TOPIC_NAMES = {'budget': '安排收支', 'choice': '理解取舍', 'buffer': '留有余地', 'risk': '理解风险'}


class PodcastError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def now():
    return datetime.now(BEIJING)


def _text(value, field, limit, required=False):
    if not isinstance(value, str) or len(value) > limit:
        raise PodcastError(f'{field}格式无效或过长')
    cleaned = value.strip()
    if required and not cleaned:
        raise PodcastError(f'请填写{field}')
    return cleaned


def _url(value, field, required=False):
    value = _text(value or '', field, 600, required)
    if not value:
        return ''
    try:
        parts = urlsplit(value)
        host = parts.hostname or ''
        port = parts.port
    except ValueError:
        raise PodcastError(f'{field}必须是公开的 HTTPS 链接')
    if parts.scheme != 'https' or not host or parts.username or parts.password or port not in (None, 443):
        raise PodcastError(f'{field}必须是公开的 HTTPS 链接')
    if host == 'localhost' or host.endswith('.local'):
        raise PodcastError(f'{field}不能指向内部地址')
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise PodcastError(f'{field}不能使用 IP 地址')
    return value


def _date(value, field):
    try:
        return date.fromisoformat(value).isoformat()
    except (TypeError, ValueError):
        raise PodcastError(f'{field}必须是 YYYY-MM-DD 日期')


def _vector(text):
    """Local topic-enriched character vector; no personal text leaves this server."""
    text = re.sub(r'\s+', ' ', text.lower())[:12000]
    counts = [0.0] * VECTOR_SIZE
    for width in (2, 3):
        for index in range(max(0, len(text) - width + 1)):
            gram = text[index:index + width]
            if gram.strip():
                digest = hashlib.blake2b(gram.encode('utf-8'), digest_size=4).digest()
                counts[int.from_bytes(digest, 'big') % VECTOR_SIZE] += 1
    norm = math.sqrt(sum(value * value for value in counts)) or 1
    return [round(value / norm, 6) for value in counts]


def _cosine(left, right):
    return sum(a * b for a, b in zip(left, right))


def _profile_text(program):
    topics = ' '.join(TOPIC_TEXT[topic] for topic in program['topics'])
    return f"{program['name']} {program['episode_title']} {program['episode_summary']} {topics}"


def _public(program):
    return {key: program[key] for key in ('id', 'name', 'publisher', 'description', 'canonical_url',
            'platform_links', 'topics', 'difficulty', 'last_episode_at', 'episode_title',
            'episode_url', 'episode_summary', 'episode_published_at')}


def _validate_program(data, previous=None):
    if not isinstance(data, dict):
        raise PodcastError('节目资料格式无效')
    record = dict(previous or {})
    record['id'] = previous['id'] if previous else str(uuid4())
    for field, limit in (('name', 120), ('publisher', 120), ('description', 3000)):
        record[field] = _text(data.get(field, record.get(field, '')), field, limit, True)
    record['canonical_url'] = _url(data.get('canonical_url', record.get('canonical_url', '')), '节目主页', True)
    record['episode_title'] = _text(data.get('episode_title', record.get('episode_title', '')), '单集标题', 180, True)
    record['episode_url'] = _url(data.get('episode_url', record.get('episode_url', '')), '单集直达链接', True)
    record['episode_summary'] = _text(data.get('episode_summary', record.get('episode_summary', '')), '单集简介', 2000, True)
    record['episode_published_at'] = _date(
        data.get('episode_published_at', record.get('episode_published_at')), '单集发布日期')
    raw_links = data.get('platform_links', record.get('platform_links', []))
    if not isinstance(raw_links, list) or len(raw_links) > 5:
        raise PodcastError('平台链接最多五条')
    links = []
    for item in raw_links:
        if not isinstance(item, dict) or item.get('platform') not in ('xiaoyuzhou', 'ximalaya', 'website', 'other'):
            raise PodcastError('平台名称无效')
        links.append({'platform': item['platform'], 'url': _url(item.get('url'), '平台链接', True)})
    if len({link['url'] for link in links}) != len(links):
        raise PodcastError('平台链接重复')
    record['platform_links'] = links
    topics = data.get('topics', record.get('topics', []))
    if not isinstance(topics, list) or not topics or len(topics) > 4 or any(topic not in TOPIC_TEXT for topic in topics):
        raise PodcastError('请选择至少一个有效主题')
    record['topics'] = sorted(set(topics))
    difficulty = data.get('difficulty', record.get('difficulty', 1))
    if type(difficulty) is not int or difficulty not in (1, 2, 3):
        raise PodcastError('难度必须是 1 至 3')
    record['difficulty'] = difficulty
    quality = data.get('quality_score', record.get('quality_score', 0))
    if isinstance(quality, bool) or not isinstance(quality, (int, float)) or not math.isfinite(quality) or not 0 <= quality <= 1:
        raise PodcastError('质量评分必须在 0 至 1 之间')
    record['quality_score'] = round(float(quality), 2)
    for flag in ('promotion_flag', 'product_pitch'):
        value = data.get(flag, record.get(flag, False))
        if type(value) is not bool:
            raise PodcastError(f'{flag}必须是布尔值')
        record[flag] = value
    record['language'] = _text(data.get('language', record.get('language', 'zh')), '语言', 12, True)
    record['region'] = _text(data.get('region', record.get('region', 'CN')), '地区', 12, True)
    record['last_episode_at'] = _date(data.get('last_episode_at', record.get('last_episode_at')), '最近更新时间')
    permission = data.get('source_permission', record.get('source_permission', 'manual'))
    if permission not in ('manual', 'public_rss', 'licensed'):
        raise PodcastError('来源许可无效')
    record['source_permission'] = permission
    record['rss_url'] = _url(data.get('rss_url', record.get('rss_url', '')), 'RSS 地址')
    if record['rss_url'] and permission == 'manual':
        raise PodcastError('同步 RSS 前需确认公开源或授权来源')
    record['recent_episode_text'] = previous.get('recent_episode_text', '') if previous else ''
    record['vector'] = _vector(_profile_text(record))
    record['vector_model'] = MODEL_VERSION
    record['status'] = 'draft'  # Every editorial edit needs a fresh review.
    record['reviewed_by'] = None
    record['reviewed_at'] = None
    record['updated_at'] = now().isoformat()
    record.setdefault('source_synced_at', None)
    record.setdefault('source_error', None)
    return record


def _check_duplicate(connection, record):
    urls = {record['episode_url'], *(link['url'] for link in record['platform_links'])}
    for other in podcast_store.program_rows(connection):
        if other['id'] == record['id']:
            continue
        other_urls = {other.get('episode_url'), *(link['url'] for link in other['platform_links'])}
        if urls & other_urls or (record['rss_url'] and record['rss_url'] == other.get('rss_url')):
            raise PodcastError('该单集或 RSS 已存在，请在同一条单集下维护多个平台链接', 409)


def list_programs():
    with podcast_store.transaction() as connection:
        return sorted(podcast_store.program_rows(connection), key=lambda p: p['updated_at'], reverse=True)


def save_program(data, program_id=None):
    with podcast_store.transaction() as connection:
        previous = podcast_store.program(connection, program_id) if program_id else None
        if program_id and not previous:
            raise PodcastError('节目不存在', 404)
        record = _validate_program(data, previous)
        _check_duplicate(connection, record)
        podcast_store.save_program(connection, record)
        return record


def review(program_id, admin_uid, approved):
    if type(approved) is not bool:
        raise PodcastError('审核状态无效')
    with podcast_store.transaction() as connection:
        record = podcast_store.program(connection, program_id)
        if not record:
            raise PodcastError('节目不存在', 404)
        if approved and (record['quality_score'] < MIN_QUALITY or record['promotion_flag'] or
                         record['product_pitch'] or not record.get('episode_url')):
            raise PodcastError('单集未达到质量门槛、缺少直达链接或包含商业推广')
        record.update(status='approved' if approved else 'withdrawn', reviewed_by=admin_uid,
                      reviewed_at=now().isoformat(), updated_at=now().isoformat())
        podcast_store.save_program(connection, record)
        return record


def _seed_starter_catalog(connection):
    """Add checked episodes once, migrating the three earlier show-only picks in place."""
    if not current_app.config.get('PODCAST_STARTER_CATALOG_ENABLED', True):
        return
    rows = podcast_store.program_rows(connection)
    if any(row.get('reviewed_by') == 'starter-episodes-2026-10-11' for row in rows):
        return
    old_starters = {row['canonical_url']: row for row in rows
                    if row.get('reviewed_by') == 'starter-catalog-2026-10-11'}
    if rows and not old_starters:
        return
    migrated = set()
    for item in STARTER_EPISODES:
        previous = old_starters.get(item['canonical_url'])
        if previous and previous['id'] in migrated:
            previous = None
        record = _validate_program({
            **item, 'platform_links': [{'platform': 'xiaoyuzhou', 'url': item['episode_url']}],
            'source_permission': 'manual', 'rss_url': '', 'promotion_flag': False,
            'product_pitch': False, 'language': 'zh', 'region': 'CN',
        }, previous)
        record.update(status='approved', reviewed_by='starter-episodes-2026-10-11',
                      reviewed_at=now().isoformat())
        podcast_store.save_program(connection, record)
        if previous:
            migrated.add(previous['id'])


def _rss_allowed(url):
    host = urlsplit(url).hostname or ''
    allowed = {item.strip().lower() for item in current_app.config.get('PODCAST_RSS_ALLOWED_HOSTS', '').split(',') if item.strip()}
    if host.lower() not in allowed:
        raise PodcastError('该 RSS 主机尚未加入服务端允许列表', 403)
    # Admin-controlled allowlist and public-IP check guard metadata fetches from SSRF.
    try:
        addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except OSError:
        raise PodcastError('RSS 主机暂时无法解析', 502)
    if not addresses or any(not ipaddress.ip_address(address[4][0]).is_global for address in addresses):
        raise PodcastError('RSS 主机不能解析到内部地址', 403)


def _rss_text(node, name):
    child = node.find(name)
    return ''.join(child.itertext()).strip() if child is not None else ''


def _plain(value):
    value = html.unescape(re.sub(r'<[^>]*>', ' ', value or ''))
    return re.sub(r'\s+', ' ', value).strip()


def _published(value):
    if not value:
        return None
    try:
        return parsedate_to_datetime(value).date()
    except (TypeError, ValueError, IndexError):
        try:
            return datetime.fromisoformat(value.replace('Z', '+00:00')).date()
        except ValueError:
            return None


def parse_rss(body):
    if len(body) > 1024 * 1024 or b'<!DOCTYPE' in body.upper() or b'<!ENTITY' in body.upper():
        raise PodcastError('RSS 内容过大或包含不允许的声明')
    try:
        root = ElementTree.fromstring(body)
    except ElementTree.ParseError:
        raise PodcastError('RSS 格式无效')
    channel = root.find('channel')
    if channel is not None:
        description = _plain(_rss_text(channel, 'description'))
        entries = channel.findall('item')[:20]
        rows = [(_published(_rss_text(item, 'pubDate')),
                 _plain(_rss_text(item, 'title') + ' ' + _rss_text(item, 'description')))
                for item in entries]
    elif root.tag.endswith('feed'):
        ns = '{http://www.w3.org/2005/Atom}'
        description = _plain(_rss_text(root, ns + 'subtitle'))
        entries = root.findall(ns + 'entry')[:20]
        rows = [(_published(_rss_text(item, ns + 'published') or _rss_text(item, ns + 'updated')),
                 _plain(_rss_text(item, ns + 'title') + ' ' +
                        (_rss_text(item, ns + 'summary') or _rss_text(item, ns + 'content'))))
                for item in entries]
    else:
        raise PodcastError('只支持 RSS 或 Atom 节目源')
    rows = [(day, text[:500]) for day, text in rows if day and text]
    rows.sort(key=lambda row: row[0], reverse=True)
    if not rows:
        raise PodcastError('来源缺少带日期的单集简介，不能更新活跃度')
    return {'description': description[:3000], 'recent_episode_text': ' '.join(text for _, text in rows[:5])[:2500],
            'last_episode_at': rows[0][0].isoformat()}


def sync_source(program_id):
    with podcast_store.transaction() as connection:
        record = podcast_store.program(connection, program_id)
    if not record:
        raise PodcastError('节目不存在', 404)
    if not record['rss_url'] or record['source_permission'] not in ('public_rss', 'licensed'):
        raise PodcastError('该节目没有已确认可同步的 RSS 来源')
    try:
        _rss_allowed(record['rss_url'])
        response = requests.get(record['rss_url'], stream=True, timeout=(3, 10), allow_redirects=False,
                                headers={'User-Agent': 'YouthGainPodcastMetadata/1.0'})
        if response.status_code != 200:
            raise PodcastError('RSS 来源暂时无法读取', 502)
        body = bytearray()
        for chunk in response.iter_content(65536):
            body.extend(chunk)
            if len(body) > 1024 * 1024:
                raise PodcastError('RSS 内容超过 1 MB')
        parsed = parse_rss(bytes(body))
    except (requests.RequestException, PodcastError) as error:
        with podcast_store.transaction() as connection:
            latest = podcast_store.program(connection, program_id)
            if latest and latest['rss_url'] == record['rss_url']:
                latest['source_error'] = str(error)[:200]
                latest['updated_at'] = now().isoformat()
                podcast_store.save_program(connection, latest)
        if isinstance(error, PodcastError):
            raise
        raise PodcastError('RSS 来源暂时无法读取', 502)
    finally:
        if 'response' in locals():
            response.close()
    with podcast_store.transaction() as connection:
        latest = podcast_store.program(connection, program_id)
        if not latest or latest['rss_url'] != record['rss_url']:
            raise PodcastError('同步期间节目来源已改变，请重试', 409)
        # Publisher description is used only as metadata. Editorial tags remain authoritative.
        if parsed['description'] and parsed['description'] != latest['description']:
            latest['description'] = parsed['description']
            latest['status'] = 'draft'
            latest['reviewed_by'] = None
            latest['reviewed_at'] = None
        latest.update(recent_episode_text=parsed['recent_episode_text'],
                      last_episode_at=parsed['last_episode_at'], source_synced_at=now().isoformat(),
                      source_error=None, updated_at=now().isoformat())
        latest['vector'] = _vector(_profile_text(latest))
        latest['vector_model'] = MODEL_VERSION
        podcast_store.save_program(connection, latest)
        return latest


def sync_due_sources():
    cutoff = now() - timedelta(hours=24)
    due = [program['id'] for program in list_programs() if program['status'] == 'approved' and
           program['rss_url'] and (not program.get('source_synced_at') or
                                   datetime.fromisoformat(program['source_synced_at']) < cutoff)]
    results = {'synced': [], 'failed': []}
    for program_id in due:
        try:
            sync_source(program_id)
            results['synced'].append(program_id)
        except PodcastError:
            results['failed'].append(program_id)
    return results


def _interest(user_id):
    entries = learning_store.read_entries(user_id)
    profile = next((item for item in entries if item.get('id') == 'profile'), {})
    questionnaire = next((item for item in entries if item.get('kind') == 'onboarding_questionnaire'), {})
    weights = {topic: 0.0 for topic in TOPIC_TEXT}
    reasons = {}
    preferred = profile.get('topic')
    if preferred in weights:
        weights[preferred] += 1.0
        reasons[preferred] = '你在“我的”选择的学习主题'
    question_topic = questionnaire.get('summary', {}).get('topic')
    if question_topic in weights:
        weights[question_topic] += 0.7
        reasons.setdefault(question_topic, '你在问卷中提到的学习方向')
    seen = set()
    for entry in entries:
        if entry.get('kind') != 'diagnostic' or entry.get('version') != LEARNING_VERSION:
            continue
        topic = entry.get('topic')
        if topic in weights and entry.get('item_id') not in seen:
            weights[topic] += 0.12
            reasons.setdefault(topic, '你最近练习过的主题')
            seen.add(entry.get('item_id'))
        if len(seen) >= 8:
            break
    # Transaction categories are a weak relevance hint, never an ability estimate.
    try:
        rows, error = user_data_service.get_user_data(user_id, 'transactions', limit=2000)
    except Exception:
        rows, error = [], 'unavailable'
    if not error and len(rows) < 2000:
        category_topics = {'购物': 'choice', '娱乐': 'choice', '房租': 'budget',
                           '话费': 'budget', '医疗': 'buffer', '学习': 'budget'}
        counted = set()
        for row in rows[:100]:
            topic = category_topics.get(row.get('category'))
            if topic and row.get('transaction_type', 'expense') == 'expense':
                counted.add(topic)
        for topic in counted:
            weights[topic] += 0.15
            reasons.setdefault(topic, '你已记录的部分消费场景')
    if not any(weights.values()):
        weights['budget'] = 0.5
        reasons['budget'] = '适合从收支安排开始了解'
    try:
        zone = ZoneInfo(profile.get('timezone') or 'Asia/Shanghai')
    except (ZoneInfoNotFoundError, TypeError):
        zone = ZoneInfo('Asia/Shanghai')
    q1 = questionnaire.get('answers', {}).get('q1')
    return {'weights': weights, 'reasons': reasons, 'max_difficulty': min(3, DIFFICULTY.get(q1, 2) + 1),
            'timezone': str(zone)}


def _eligible(program, today, max_difficulty):
    if program['status'] != 'approved' or program['quality_score'] < MIN_QUALITY:
        return False
    if not program.get('episode_url') or not program.get('episode_title') or not program.get('episode_summary'):
        return False
    if program['promotion_flag'] or program['product_pitch'] or program['difficulty'] > max_difficulty:
        return False
    if program['language'] != 'zh' or program['region'] not in ('CN', 'global'):
        return False
    try:
        reviewed = date.fromisoformat(program['reviewed_at'][:10]) if program.get('reviewed_at') else None
        if not reviewed or not 0 <= (today - reviewed).days <= 90:
            return False
        episode_age = (today - date.fromisoformat(program['last_episode_at'])).days
        if not 0 <= episode_age <= ACTIVE_DAYS:
            return False
        selected_episode_age = (today - date.fromisoformat(program['episode_published_at'])).days
        if not 0 <= selected_episode_age <= ACTIVE_DAYS:
            return False
        if program['rss_url']:
            synced = date.fromisoformat(program['source_synced_at'][:10]) if program.get('source_synced_at') else None
            if not synced or not 0 <= (today - synced).days <= SOURCE_MAX_AGE_DAYS:
                return False
    except (TypeError, ValueError):
        return False
    return True


def _pick(connection, user_id, today, interest):
    history = podcast_store.recent_picks(connection, user_id, (today - timedelta(days=COOLDOWN_DAYS)).isoformat())
    recent_ids = {entry['program_id'] for entry in history if entry.get('program_id')}
    recent_topics = [topic for entry in history[:3] for topic in entry.get('program_topics', [])]
    feedback = podcast_store.feedback_rows(connection, user_id)
    disliked = {row['program_id'] for row in feedback if row['kind'] == 'dislike'}
    programmes = podcast_store.program_rows(connection)
    followed = {row['program_id'] for row in feedback if row['kind'] == 'follow'}
    weights = dict(interest['weights'])
    for program in programmes:
        if program['id'] in followed:
            for topic in program['topics']:
                weights[topic] += 0.2
                interest['reasons'].setdefault(topic, '你关注过相近主题的节目')
    user_text = ' '.join((TOPIC_TEXT[topic] + ' ') * max(1, round(weight * 3))
                         for topic, weight in weights.items() if weight > 0)
    user_vector = _vector(user_text)
    candidates = []
    for program in programmes:
        if program['id'] in disliked or not _eligible(program, today, interest['max_difficulty']):
            continue
        matching = [topic for topic in program['topics'] if weights[topic] > 0]
        if not matching:
            continue
        baseline = max(weights[topic] for topic in matching) / max(weights.values())
        similarity = max(0.0, _cosine(user_vector, program['vector']))
        age = (today - date.fromisoformat(program['episode_published_at'])).days
        freshness = max(0.0, 1 - age / ACTIVE_DAYS)
        repetition = 0.08 * sum(topic in recent_topics for topic in matching)
        if program['id'] in recent_ids:
            repetition += 0.4  # Prefer something new, but do not leave the card empty solely for cooldown.
        score = 0.4 * baseline + 0.25 * similarity + 0.25 * program['quality_score'] + 0.1 * freshness - repetition
        top_topic = max(matching, key=lambda topic: (weights[topic], topic))
        candidates.append((score, program['id'], top_topic, baseline, similarity, program))
    if not candidates:
        return {'program_id': None, 'program_topics': [], 'status': 'none',
                'message': '今天没有合适的新单集。', 'reason': None}
    score, _, topic, baseline, similarity, program = max(candidates, key=lambda item: (item[0], item[1]))
    return {'program_id': program['id'], 'program_topics': program['topics'], 'status': 'ready',
            'reason': f"{interest['reasons'].get(topic, '当前学习方向')}与“{TOPIC_NAMES[topic]}”有关；这一期聚焦相关的具体问题。",
            'topic': topic, 'score': round(score, 4), 'baseline_score': round(baseline, 4),
            'similarity': round(similarity, 4), 'message': None}


def _response(connection, record, today, user_id):
    program = podcast_store.program(connection, record['program_id']) if record.get('program_id') else None
    user_feedback = {row['kind'] for row in podcast_store.feedback_rows(connection, user_id)
                     if row['program_id'] == record.get('program_id')}
    if 'dislike' in user_feedback:
        return {'date': record['date'], 'status': 'dismissed', 'program': None,
                'reason': None, 'message': '今天的节目已收起。'}
    if program and not _eligible(program, today, 3):
        return {'date': record['date'], 'status': 'unavailable', 'program': None,
                'reason': None, 'message': '今天的节目暂时不可查看。'}
    return {'date': record['date'], 'status': record['status'], 'followed': 'follow' in user_feedback,
            'program': _public(program) if program else None,
            'reason': record.get('reason'), 'message': record.get('message')}


def today_for(user_id):
    interest = _interest(user_id)
    local_now = now().astimezone(ZoneInfo(interest['timezone']))
    today = local_now.date()
    date_string = today.isoformat()
    with podcast_store.transaction() as connection:
        _seed_starter_catalog(connection)
        existing = podcast_store.daily_pick(connection, user_id, date_string)
        if existing and existing.get('program_id'):
            return _response(connection, existing, today, user_id)
        # Empty results are reconsidered; new approved content or interests may make today viable.
        chosen = _pick(connection, user_id, today, interest)
        if existing and not chosen['program_id']:
            return _response(connection, existing, today, user_id)
        record = {**chosen, 'date': date_string, 'rank_version': RANK_VERSION,
                  'vector_model': MODEL_VERSION, 'topic_signals': {key: round(value, 2)
                      for key, value in interest['weights'].items() if value > 0},
                  'created_at': local_now.isoformat()}
        podcast_store.save_pick(connection, user_id, date_string, record, replace_empty=bool(existing))
        if chosen['program_id']:
            connection.execute('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?)',
                               (user_id, date_string, chosen['program_id'], 'exposure', local_now.isoformat()))
        return _response(connection, record, today, user_id)


def save_feedback(user_id, program_id, kind):
    if kind not in ('view', 'follow', 'dislike'):
        raise PodcastError('反馈类型无效')
    with podcast_store.transaction() as connection:
        known = connection.execute('SELECT 1 FROM daily_picks WHERE user_id=? AND program_id=? LIMIT 1',
                                   (user_id, program_id)).fetchone()
        if not known:
            raise PodcastError('只能反馈自己看到过的节目', 404)
        stamp = now().isoformat()
        if kind == 'view':
            connection.execute('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?)',
                               (user_id, now().date().isoformat(), program_id, kind, stamp))
        else:
            opposite = 'dislike' if kind == 'follow' else 'follow'
            connection.execute('DELETE FROM feedback WHERE user_id=? AND program_id=? AND kind=?',
                               (user_id, program_id, opposite))
            connection.execute('''INSERT INTO feedback(user_id,program_id,kind,updated_at) VALUES(?,?,?,?)
                ON CONFLICT(user_id,program_id,kind) DO UPDATE SET updated_at=excluded.updated_at''',
                (user_id, program_id, kind, stamp))
        return {'program_id': program_id, 'kind': kind, 'saved': True}

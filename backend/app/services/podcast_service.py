"""Reviewed episode discovery. Only publisher metadata is ingested, never audio."""
import hashlib
import html
import ipaddress
import json
import math
import re
import socket
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from xml.etree import ElementTree

import requests
from flask import current_app

from .checkin_service import BEIJING
from . import learning_store, podcast_store
from . import finance_context_service, podcast_ranker
from .podcast_starter_catalog import EPISODES as STARTER_EPISODES
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
    link_status = data.get('link_status', record.get('link_status', 'unknown'))
    if link_status not in ('valid', 'invalid', 'unknown'):
        raise PodcastError('链接状态无效')
    record['link_status'] = link_status
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
        if urls & other_urls:
            raise PodcastError('该单集已存在，请在同一条单集下维护多个平台链接', 409)


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
        if previous and previous.get('source_id'):
            # Saving the editorial form explicitly confirms corrected fields. Retain AI trace as provenance.
            record.update(review_blockers=[], editor_verified=True, updated_at=now().isoformat())
            record['content_hash'] = hashlib.sha256(json.dumps({k: record[k] for k in (
                'episode_title', 'episode_summary', 'episode_url', 'topics', 'difficulty', 'quality_score')},
                sort_keys=True, ensure_ascii=False).encode()).hexdigest()
            if record.get('processing'):
                record['processing'] = dict(record['processing'], superseded_by_editor=True)
        from . import podcast_pipeline as pipeline
        pipeline.audit(connection, record['id'], 'editorial_saved')
        podcast_store.save_program(connection, record)
        return record


def review(program_id, admin_uid, approved):
    if type(approved) is not bool:
        raise PodcastError('审核状态无效')
    with podcast_store.transaction() as connection:
        record = podcast_store.program(connection, program_id)
        if not record:
            raise PodcastError('节目不存在', 404)
        if approved and record.get('review_blockers'):
            raise PodcastError('请先核对并编辑补充资料：' + '；'.join(record['review_blockers']))
        if approved and (record['quality_score'] < MIN_QUALITY or record['promotion_flag'] or
                         record['product_pitch'] or not record.get('episode_url')):
            raise PodcastError('单集未达到质量门槛、缺少直达链接或包含商业推广')
        record.update(status='approved' if approved else 'withdrawn', reviewed_by=admin_uid,
                      reviewed_at=now().isoformat(), updated_at=now().isoformat())
        podcast_store.save_program(connection, record)
        from . import podcast_pipeline as pipeline
        pipeline.audit(connection, record['id'], 'episode_reviewed', actor=admin_uid,
                       status=record['status'], content_hash=record.get('content_hash'))
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
        root = ElementTree.fromstring(body.decode('utf-8-sig'))
    except (ElementTree.ParseError, UnicodeError):
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
        from .podcast_ingestion import public_request
        status, _, body = public_request(record['rss_url'])
        if status != 200:
            raise PodcastError('RSS 来源暂时无法读取', 502)
        parsed = parse_rss(bytes(body))
        # Legacy explicit sync also discovers every new episode; normal student requests never fetch RSS.
        from . import podcast_pipeline as pipeline
        from .podcast_ingestion import parse_feed, ingest
        with podcast_store.transaction() as connection:
            source_record = pipeline.register_source({'url': record['rss_url'], 'name': record['name'],
                'permission': record['source_permission']}, conn=connection)
            ingest(connection, source_record, parse_feed(bytes(body), record['rss_url']))
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
    from .podcast_pipeline import schedule_due
    return schedule_due()


def _interest(user_id, entries=None):
    if entries is None:
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
    if not any(weights.values()):
        weights['budget'] = 0.5
        reasons['budget'] = '适合从收支安排开始了解'
    try:
        zone = ZoneInfo(profile.get('timezone') or 'Asia/Shanghai')
    except (ZoneInfoNotFoundError, TypeError):
        zone = ZoneInfo('Asia/Shanghai')
    q1 = questionnaire.get('answers', {}).get('q1')
    return {'weights': weights, 'reasons': reasons, 'max_difficulty': min(3, DIFFICULTY.get(q1, 2) + 1),
            'timezone': str(zone), 'learning_topic': TOPIC_TEXT.get(preferred, TOPIC_TEXT.get(question_topic, ''))}


def _eligible(program, today, max_difficulty):
    if program.get('source_enabled') is False:
        return False
    if program.get('link_status') == 'invalid':
        return False
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


def _candidates(programmes, history, feedback, today, interest, snapshot):
    recent_ids = {entry['program_id'] for entry in history if entry.get('program_id')}
    recent_topics = [topic for entry in history[:3] for topic in entry.get('program_topics', [])]
    disliked = {row['program_id'] for row in feedback if row['kind'] == 'dislike'}
    followed = {row['program_id'] for row in feedback if row['kind'] == 'follow'}
    weights = dict(interest['weights'])
    facts = snapshot['features']
    # Use the same filtered, point-in-time snapshot as the ranker and evidence.
    category_topics = {'购物': 'choice', '娱乐': 'choice', '房租': 'budget',
                       '话费': 'budget', '医疗': 'buffer', '学习': 'budget'}
    for topic in {category_topics[c] for c, amount in snapshot['category_net_30d'].items()
                  if c in category_topics and amount > 0}:
        weights[topic] += 0.15
        interest['reasons'].setdefault(topic, '你已记录的部分消费场景')
    if (facts.get('upcoming_30d') or 0) > 0:
        weights['buffer'] += 0.8
        interest['reasons']['buffer'] = '你记录了近期需要预留的开支'
    if (facts.get('goal_remaining') or 0) > 0:
        weights['budget'] += 0.7
        interest['reasons']['budget'] = '你有尚未完成的储蓄目标'
    if facts.get('recorded_surplus_month') is not None and facts['recorded_surplus_month'] < 0:
        weights['budget'] += 0.6
        interest['reasons']['budget'] = '本月已记录支出超过已记录收入'
    if facts.get('available_remaining_month') is not None and facts['available_remaining_month'] < 0:
        weights['budget'] += 0.4
        interest['reasons']['budget'] = '按已确认结转与内部储蓄划拨计算，本月可用剩余为负'
    for program in programmes:
        if program['id'] in followed:
            for topic in program['topics']:
                weights[topic] += 0.2
                interest['reasons'].setdefault(topic, '你关注过相近主题的节目')
    interest['weights'] = weights
    user_text = ' '.join((TOPIC_TEXT[topic] + ' ') * max(1, round(weight * 3))
                         for topic, weight in weights.items() if weight > 0)
    user_vector = _vector(user_text)
    candidates = []
    for program in programmes:
        if program['id'] in disliked or program['id'] in recent_ids or not _eligible(program, today, interest['max_difficulty']):
            continue
        matching = [topic for topic in program['topics'] if weights[topic] > 0]
        if not matching:
            continue
        baseline = max(weights[topic] for topic in matching) / max(weights.values())
        similarity = max(0.0, _cosine(user_vector, program['vector']))
        age = (today - date.fromisoformat(program['episode_published_at'])).days
        freshness = max(0.0, 1 - age / ACTIVE_DAYS)
        repetition = 0.08 * sum(topic in recent_topics for topic in matching)
        score = 0.4 * baseline + 0.25 * similarity + 0.25 * program['quality_score'] + 0.1 * freshness - repetition
        top_topic = max(matching, key=lambda topic: (weights[topic], topic))
        candidates.append({'score': score, 'program': program, 'topic': top_topic,
                           'baseline_score': round(baseline, 4), 'similarity': round(similarity, 4)})
    return sorted(candidates, key=lambda c: (-c['score'], c['program']['id']))[:100]


def _evidence(snapshot, program):
    facts, evidence = snapshot['features'], []
    for key, label, topic in [('upcoming_30d', '未来30日已记录待处理开支', 'buffer'),
                              ('goal_remaining', '活跃储蓄目标尚需金额', 'budget'),
                              ('available_remaining_month', '本月可用剩余', 'budget'),
                              ('savings_locked_total', '储蓄锁定总资金', 'budget'),
                              ('recorded_surplus_month', '本月已记录收支结余', 'budget')]:
        value = facts.get(key)
        if topic in program['topics'] and value is not None and (value > 0 or key in ('recorded_surplus_month', 'available_remaining_month') and value < 0):
            evidence.append({'feature': key, 'label': label, 'value': value, 'unit': '元',
                             'snapshot_id': snapshot['snapshot_id'], 'as_of': snapshot['as_of']})
    return evidence[:2]


def _response(connection, record, today, user_id):
    extra = {'recommendation_id': record.get('recommendation_id'),
             'as_of': record.get('as_of') or record.get('created_at'), 'evidence': record.get('evidence', []),
             'timezone': record.get('timezone', 'Asia/Shanghai')}
    extra.update(fallback=record.get('ranking', {}).get('fallback', False),
                 fallback_reason=record.get('ranking', {}).get('fallback_reason'),
                 ranker_used=record.get('ranking', {}).get('used', 'baseline'),
                 model_version=record.get('model_version'),
                 demo_model=record.get('ranking', {}).get('training_kind') == 'demo')
    program = podcast_store.program(connection, record['program_id']) if record.get('program_id') else None
    user_feedback = {row['kind'] for row in podcast_store.feedback_rows(connection, user_id)
                     if row['program_id'] == record.get('program_id')}
    helpful_event = connection.execute('''SELECT event_type FROM recommendation_events
        WHERE user_id=? AND recommendation_id=? AND event_type IN ('helpful_yes','helpful_no')
        ORDER BY occurred_at DESC, rowid DESC LIMIT 1''', (user_id, record.get('recommendation_id'))).fetchone()
    if 'dislike' in user_feedback:
        return {**extra, 'evidence': [], 'date': record['date'], 'status': 'dismissed', 'program': None,
                'program_id': record.get('program_id'),
                'reason': None, 'message': '今天的节目已收起。点下方按钮可恢复。'}
    if program and not _eligible(program, today, 3):
        return {**extra, 'evidence': [], 'date': record['date'], 'status': 'unavailable', 'program': None,
                'reason': None, 'message': '今天的节目暂时不可查看。'}
    return {**extra, 'date': record['date'], 'status': record['status'], 'followed': 'follow' in user_feedback,
            'helpful': bool(helpful_event and helpful_event['event_type'] == 'helpful_yes'),
            'program': _public(program) if program else None,
            'reason': record.get('reason'), 'message': record.get('message')}


def _reason(interest, topic, evidence, *, enhancer=None):
    """Verified template. Optional LLM-enhancement contract is reserved, disabled."""
    if enhancer is not None:
        raise ValueError('首版不启用大模型理由增强')
    reason = f"{interest['reasons'].get(topic, '当前学习方向')}与“{TOPIC_NAMES[topic]}”有关；这一期聚焦相关的具体问题。"
    if evidence:
        item = evidence[0]
        reason += f" 推荐时已记录的{item['label']}为 {item['value']:.2f} 元。"
    return reason


def today_for(user_id):
    try:
        entries, entries_complete = learning_store.read_entries(user_id), True
    except Exception:
        entries, entries_complete = [], False
    interest = _interest(user_id, entries)
    local_now = now().astimezone(ZoneInfo(interest['timezone']))
    today = local_now.date()
    date_string = today.isoformat()
    with podcast_store.transaction() as connection:
        _seed_starter_catalog(connection)
        existing = podcast_store.daily_pick(connection, user_id, date_string)
        if existing and not existing.get('recommendation_id'):
            existing.update(recommendation_id=str(uuid4()), as_of=existing.get('created_at'), evidence=[],
                            model_version='legacy', timezone=interest['timezone'])
            podcast_store.update_pick(connection, user_id, existing)
        if existing:
            return _response(connection, existing, today, user_id)
        programmes = podcast_store.program_rows(connection)
        history = podcast_store.recent_picks(connection, user_id, (today - timedelta(days=COOLDOWN_DAYS)).isoformat())
        feedback = podcast_store.feedback_rows(connection, user_id)
        events = podcast_store.event_history(connection, user_id, local_now.astimezone(timezone.utc).isoformat())
    # Finance queries and HTTP inference must not hold the SQLite write lock.
    snapshot = finance_context_service.build_snapshot(user_id, entries=entries, entries_complete=entries_complete)
    if datetime.fromisoformat(snapshot['as_of']).astimezone(ZoneInfo(interest['timezone'])).date() != today:
        return today_for(user_id)  # Source collection crossed the user's midnight; select the new local day.
    candidates = _candidates(programmes, history, feedback, today, interest, snapshot)
    catalog = {p['id']: p for p in programmes}
    events = [dict(e, title=catalog.get(e['program_id'], {}).get('episode_title', ''),
                   summary=catalog.get(e['program_id'], {}).get('episode_summary', ''),
                   topics=catalog.get(e['program_id'], {}).get('topics', [])) for e in events]
    learning_topic = interest['learning_topic']
    snapshot['learning_topic'] = learning_topic
    ranking = podcast_ranker.rank(candidates, snapshot, events)
    with podcast_store.transaction() as connection:
        existing = podcast_store.daily_pick(connection, user_id, date_string)
        if existing:
            return _response(connection, existing, today, user_id)
        rejected = {r['program_id'] for r in podcast_store.feedback_rows(connection, user_id) if r['kind'] == 'dislike'}
        fresh = []
        for candidate in candidates:
            program = podcast_store.program(connection, candidate['program']['id'])
            if (program and program == candidate['program'] and program['id'] not in rejected
                    and _eligible(program, today, interest['max_difficulty'])):
                fresh.append(dict(candidate, program=program))
        chosen = {'program_id': None, 'program_topics': [], 'status': 'none',
                  'message': '今天没有合适的新单集。', 'reason': None, 'evidence': []}
        if fresh:
            best = max(fresh, key=lambda c: (ranking['scores'][c['program']['id']], c['program']['id']))
            program, topic = best['program'], best['topic']
            chosen = {'program_id': program['id'], 'program_topics': program['topics'], 'status': 'ready',
                      'reason': _reason(interest, topic, _evidence(snapshot, program)),
                      'topic': topic, 'score': ranking['scores'][program['id']],
                      'baseline_score': best['baseline_score'], 'similarity': best['similarity'],
                      'evidence': _evidence(snapshot, program), 'message': None}
        record = {**chosen, 'date': date_string, 'rank_version': 'finance-context-v2',
                  'recommendation_id': str(uuid4()), 'snapshot_id': snapshot['snapshot_id'],
                  'as_of': snapshot['as_of'], 'timezone': interest['timezone'],
                  'model_version': ranking['model_version'], 'ranking': ranking,
                  'rank_input': podcast_ranker.make_payload(candidates, snapshot, events, learning_topic),
                  'vector_model': MODEL_VERSION, 'topic_signals': {key: round(value, 2)
                      for key, value in interest['weights'].items() if value > 0},
                  'created_at': local_now.isoformat()}
        podcast_store.save_snapshot(connection, user_id, snapshot)
        podcast_store.save_pick(connection, user_id, date_string, record)
        if chosen['program_id']:
            podcast_store.append_event(connection, user_id, record, str(uuid4()), 'served',
                                       local_now.astimezone(timezone.utc).isoformat())
            connection.execute('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?)',
                               (user_id, date_string, chosen['program_id'], 'exposure', local_now.isoformat()))
        return _response(connection, record, today, user_id)


def save_feedback(user_id, program_id, kind, recommendation_id=None, event_id=None, value=True):
    if kind not in ('view', 'follow', 'dislike', 'impression', 'helpful', 'undislike'):
        raise PodcastError('反馈类型无效')
    program_id = _text(program_id, '单集ID', 100, True)
    if kind == 'helpful' and not isinstance(value, bool):
        raise PodcastError('helpful 的 value 必须是布尔值')
    if kind == 'helpful' and recommendation_id is None:
        raise PodcastError('有帮助反馈需要绑定推荐ID')
    if recommendation_id is not None:
        recommendation_id = _text(recommendation_id, '推荐ID', 100, True)
    event_id = _text(event_id, '事件ID', 100, True) if event_id is not None else str(uuid4())
    event_type = {'view': 'click', 'helpful': 'helpful_yes' if value else 'helpful_no'}.get(kind, kind)
    with podcast_store.transaction() as connection:
        known = connection.execute('''SELECT payload FROM daily_picks WHERE user_id=? AND program_id=?
            AND (? IS NULL OR recommendation_id=?) ORDER BY local_date DESC LIMIT 1''',
            (user_id, program_id, recommendation_id, recommendation_id)).fetchone()
        if not known:
            raise PodcastError('只能反馈自己看到过的节目', 404)
        record = json.loads(known['payload'])
        if not record.get('recommendation_id'):
            record.update(recommendation_id=str(uuid4()), model_version='legacy')
            podcast_store.update_pick(connection, user_id, record)
        if kind == 'impression':
            program = podcast_store.program(connection, program_id)
            today = now().astimezone(ZoneInfo(record.get('timezone', 'Asia/Shanghai'))).date()
            if not program or not _eligible(program, today, 3):
                raise PodcastError('节目暂时不可查看', 404)
        previous = podcast_store.event_by_id(connection, user_id, event_id)
        if previous:
            if previous['recommendation_id'] != record['recommendation_id'] or previous['event_type'] != event_type:
                raise PodcastError('事件ID已用于其他反馈', 409)
            return {'program_id': program_id, 'kind': kind, 'saved': True,
                    'recommendation_id': record['recommendation_id'], 'event_id': event_id}
        stamp = now().astimezone(timezone.utc).isoformat()
        event_id = podcast_store.append_event(connection, user_id, record, event_id, event_type, stamp)
        if kind == 'view':
            connection.execute('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?)',
                               (user_id, now().date().isoformat(), program_id, kind, stamp))
        elif kind == 'undislike':
            connection.execute('DELETE FROM feedback WHERE user_id=? AND program_id=? AND kind=?',
                               (user_id, program_id, 'dislike'))
        elif kind in ('follow', 'dislike', 'helpful'):
            opposite = 'dislike' if kind == 'follow' else 'follow' if kind == 'dislike' else 'helpful_no'
            if kind == 'helpful' and not value:
                opposite = 'helpful'
            state_kind = 'helpful_no' if kind == 'helpful' and not value else kind
            connection.execute('DELETE FROM feedback WHERE user_id=? AND program_id=? AND kind=?',
                               (user_id, program_id, opposite))
            connection.execute('''INSERT INTO feedback(user_id,program_id,kind,updated_at) VALUES(?,?,?,?)
                ON CONFLICT(user_id,program_id,kind) DO UPDATE SET updated_at=excluded.updated_at''',
                (user_id, program_id, state_kind, stamp))
        return {'program_id': program_id, 'kind': kind, 'saved': True,
                'recommendation_id': record['recommendation_id'], 'event_id': event_id}

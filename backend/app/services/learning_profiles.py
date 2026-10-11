"""Small, explainable learning and spending-context profiles for one account."""
from datetime import date, timedelta


TOPIC_TITLES = {'budget': '安排收支', 'choice': '理解取舍',
                'buffer': '留有余地', 'risk': '理解风险'}
CONTEXT_RULES_VERSION = 'context-rules-v1'
EVIDENCE_RULES_VERSION = 'answer-evidence-v1'
CATEGORY_TOPICS = {
    '餐饮': 'budget', '交通': 'budget', '学习': 'budget', '教材': 'budget',
    '购物': 'choice', '娱乐': 'choice', '网购': 'choice',
    '房租': 'buffer', '医疗': 'buffer', '订阅': 'buffer',
}


def day(value):
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def context_profile(entries, transactions, today):
    """Never use amounts, merchant names or notes to infer ability or motivation."""
    signals = []
    for entry in entries:
        if entry.get('kind') == 'upcoming' and entry.get('handled') is False:
            due = day(entry.get('due_date'))
            if due and today <= due <= today + timedelta(days=30):
                signals.append({'topic': 'buffer', 'source': 'upcoming', 'observed_on': due.isoformat(),
                                'reason': '你记录了近期需要安排的开支', 'sufficient': True})
        elif entry.get('kind') in ('decision', 'reflection') and entry.get('outcome') == 'unmet':
            updated = day(entry.get('updated_at'))
            if updated and 0 <= (today - updated).days <= 30:
                signals.append({'topic': 'choice', 'source': 'reflection', 'observed_on': updated.isoformat(),
                                'reason': '你最近想重新看看一次消费选择', 'sufficient': True})
    if transactions is not None:
        recent = [row for row in transactions if row.get('transaction_type', 'expense') == 'expense'
                  and (spent := day(row.get('date') or row.get('spent_at')))
                  and 0 <= (today - spent).days <= 30]
        if any(row.get('regret') is True for row in recent):
            signals.append({'topic': 'choice', 'source': 'transaction_reflection',
                            'observed_on': max(day(row.get('date') or row.get('spent_at'))
                                               for row in recent if row.get('regret') is True).isoformat(),
                            'reason': '你把一笔近期消费标记为值得回看', 'sufficient': True})
        grouped = {}
        for row in recent:
            topic = CATEGORY_TOPICS.get(str(row.get('category') or '').strip())
            if topic:
                grouped.setdefault(topic, []).append(day(row.get('date') or row.get('spent_at')))
        for topic, dates in grouped.items():
            if len(dates) >= 3 and len(set(dates)) >= 2:
                signals.append({'topic': topic, 'source': 'transaction_category',
                                'observed_on': max(dates).isoformat(),
                                'reason': f'你近期记录了多笔与“{TOPIC_TITLES[topic]}”相关的消费',
                                'sufficient': True})
        if len(recent) >= 5 and len({day(row.get('date') or row.get('spent_at')) for row in recent}) >= 3:
            signals.append({'topic': 'budget', 'source': 'transaction_frequency',
                            'observed_on': max(day(row.get('date') or row.get('spent_at')) for row in recent).isoformat(),
                            'reason': '你近期有多笔已记录消费，可练习整理收支', 'sufficient': True})
    return {'version': CONTEXT_RULES_VERSION,
            'coverage': 'unavailable' if transactions is None else 'partial' if not transactions else 'recorded_only',
            'signals': signals,
            'limitation': '只依据本人已记录的部分消费；没有记录或读取不完整时仍可继续学习。'}


def learning_profile(items, latest, today):
    states = []
    for topic, title in TOPIC_TITLES.items():
        observed = [latest[item['id']] for item in items if item['topic'] == topic and item['id'] in latest]
        scenarios = {entry.get('scenario_id') or entry.get('item_id') for entry in observed}
        last = max((day(entry.get('updated_at')) for entry in observed if day(entry.get('updated_at'))), default=None)
        status = ('待观察' if not observed else '建议复习' if any(entry.get('correct') is False for entry in observed)
                  else '已有答题证据，仍需新情境验证')
        states.append({'version': EVIDENCE_RULES_VERSION, 'topic': topic, 'title': title, 'observed': len(observed),
                       'distinct_scenarios': len(scenarios), 'correct': sum(entry.get('correct') is True for entry in observed),
                       'status': status, 'source': 'scenario_answers',
                       'observed_on': last.isoformat() if last else None,
                       'evidence_sufficient': len(scenarios) >= 2 and all(entry.get('correct') is not False for entry in observed)})
    return states

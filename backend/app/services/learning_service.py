"""Financial learning content and validation. No model-generated scores or diagnoses."""
from datetime import date, datetime, timedelta
from math import isfinite
from .checkin_service import BEIJING, build_checkin_summary

TOPICS = [
    {'id': 'budget', 'title': '安排收支', 'description': '先了解必要开支，再安排目标与享受。'},
    {'id': 'choice', 'title': '理解取舍', 'description': '看清当下需要和未来安排，自己做选择。'},
    {'id': 'buffer', 'title': '留有余地', 'description': '为不定期开支和生活变化留出空间。'},
    {'id': 'risk', 'title': '理解风险', 'description': '先问清代价、限制和不确定性。'},
]

LESSONS = [
    {'id': 'needs', 'day': 1, 'topic': 'budget', 'title': '我的钱要照顾什么',
     'concept': '预算是安排优先顺序。必要生活、当下体验和未来目标都可以有位置。',
     'scenario': '生活费到账后，你想聚餐，也要支付交通和月底的考试费。你会先确认哪些信息？',
     'prompt': '列出一项必要开支、一项想要的体验，以及一项未来安排。'},
    {'id': 'attention', 'day': 2, 'topic': 'buffer', 'title': '想起容易忘记的开支',
     'concept': '注意力有限，尚未到期的开支容易被忽略。把具体事项写出来，可以帮助安排。',
     'scenario': '余额看起来充足，但下月可能需要修电脑。你会怎样给不确定的开支留余地？',
     'prompt': '写下未来一个月一笔不定期开支，以及你打算怎样准备。'},
    {'id': 'pause', 'day': 3, 'topic': 'choice', 'title': '给选择一点时间',
     'concept': '眼前的满足可能让未来计划变得不显眼。延后考虑是一种可选工具，购买本身没有对错。',
     'scenario': '限时优惠的鞋很吸引你，但你原本在为旅行存钱。立即购买、延后、换一个预算各有什么得失？',
     'prompt': '比较至少两个选择，并写出对你最重要的理由。'},
    {'id': 'accounts', 'day': 4, 'topic': 'budget', 'title': '红包也是我的钱',
     'concept': '我们可能把工资、红包、退款放进不同的心理账户。分类有助于规划，也要一起看总资源。',
     'scenario': '收到一笔红包，你想全部花掉。把它与生活费一起考虑后，你的选择会变化吗？',
     'prompt': '说明你怎样安排这笔意外收入，以及这样安排的原因。'},
    {'id': 'uncertainty', 'day': 5, 'topic': 'risk', 'title': '先问清楚再决定',
     'concept': '判断一个方案，需要同时了解可能的好处、损失、费用和退出限制。信息不足时可以暂不决定。',
     'scenario': '朋友介绍一个“回报很高”的方案，却没有解释亏损可能和取回资金的条件。你还需要知道什么？',
     'prompt': '列出三个需要核实的问题，并说明信息不全时你会怎么做。'},
    {'id': 'rule', 'day': 6, 'topic': 'choice', 'title': '试一条自己的规则',
     'concept': '提前自定规则可以帮助执行计划。规则应允许调整，也应为紧急需要保留例外。',
     'scenario': '你常在晚上临时购物。你想尝试一个提醒或等待规则，但不希望影响必要消费。',
     'prompt': '写一条“如果……我就……”的规则，并写出一个例外。'},
    {'id': 'transfer', 'day': 7, 'topic': 'buffer', 'title': '把方法用到新情境',
     'concept': '能在不同情境中解释自己的取舍，比记住一个标准答案更重要。',
     'scenario': '下个月生活费减少，同时有一场你很重视的活动。你会怎样重新安排，而不忽略基本生活？',
     'prompt': '写出安排、理由和一个备用方案，然后提炼一条自己的理财原则。'},
]


def text_field(data, name, required=False, limit=1000):
    value = data.get(name, '')
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError(f'{name} 必须是 {limit} 字以内的文字')
    value = value.strip()
    if required and not value:
        raise ValueError('请填写思考内容后再保存')
    return value


def number(value, name, minimum=0, maximum=100000000):
    if isinstance(value, bool):
        raise ValueError(f'{name} 必须是有效数字')
    try:
        result = float(value)
    except (TypeError, ValueError):
        raise ValueError(f'{name} 必须是有效数字')
    if not isfinite(result) or not minimum <= result <= maximum:
        raise ValueError(f'{name} 超出有效范围')
    return result


def validate_profile(data):
    income = data.get('monthly_income')
    day = data.get('income_day')
    topic = data.get('topic', 'budget')
    if topic not in {t['id'] for t in TOPICS}:
        raise ValueError('请选择有效的学习主题')
    if day not in (None, ''):
        day = number(day, '到账日', 1, 31)
        if not day.is_integer():
            raise ValueError('到账日必须是整数')
        day = int(day)
    return {
        'monthly_income': None if income in (None, '') else number(income, '月收入'),
        'income_day': day or None, 'topic': topic,
        'personal_rule': text_field(data, 'personal_rule', limit=300),
    }


def validate_entry(kind, data):
    if kind == 'upcoming':
        due_date = text_field(data, 'due_date', True, 10)
        try:
            due_date = date.fromisoformat(due_date).isoformat()
        except ValueError:
            raise ValueError('请填写有效的预计日期')
        return None, {'kind': kind, 'title': text_field(data, 'title', True, 100),
                      'amount': number(data.get('amount'), '预计金额', 0.01),
                      'due_date': due_date, 'handled': False}
    if kind == 'exercise':
        lesson = data.get('lesson_id')
        if lesson not in {item['id'] for item in LESSONS}:
            raise ValueError('练习不存在')
        return f'exercise:{lesson}', {'kind': kind, 'lesson_id': lesson,
                                      'reflection': text_field(data, 'reflection', True)}
    if kind == 'decision':
        choice = data.get('choice')
        if choice not in ('buy', 'wait', 'adjust'):
            raise ValueError('请选择现在购买、延后考虑或调整预算')
        return None, {'kind': kind, 'amount': number(data.get('amount'), '金额', 0.01),
                      'category': text_field(data, 'category', True, 80),
                      'need': text_field(data, 'need', True, 300), 'choice': choice,
                      'reason': text_field(data, 'reason', True),
                      'alternative_amount': number(data.get('alternative_amount', 0), '替代预算'),
                      'outcome': None}
    if kind == 'review':
        week = datetime.now(BEIJING).date()
        week -= timedelta(days=week.weekday())
        return f'review:{week.isoformat()}', {
            'kind': kind, 'week': week.isoformat(),
            'observation': text_field(data, 'observation', True),
            'next_action': text_field(data, 'next_action', True, 500),
            'principle': text_field(data, 'principle', True, 500),
            'previous_action_result': text_field(data, 'previous_action_result', limit=500),
            'pressure': enum_field(data, 'pressure', ('helpful', 'neutral', 'pressure')),
        }
    raise ValueError('不支持的学习记录类型')


def enum_field(data, name, choices):
    value = data.get(name)
    if value not in choices:
        raise ValueError('请选择有效的反馈选项')
    return value


def learning_summary(entries, now=None):
    activities = [e for e in entries if e.get('kind') in ('exercise', 'review', 'decision', 'reflection')]
    completed = {e['lesson_id'] for e in activities if e.get('kind') == 'exercise'}
    return {
        'completed_lessons': sorted(completed),
        'practice_count': len(completed),
        'decision_count': sum(e.get('kind') == 'decision' for e in activities),
        'review_count': sum(e.get('kind') == 'review' for e in activities),
        'checkin': build_checkin_summary([
            day + 'T12:00:00+08:00' for e in activities
            for day in e.get('activity_days', [e.get('updated_at', '')[:10]])
        ], now),
        'abilities': [{'topic': t['id'], 'title': t['title'],
                      'completed': sum(l['id'] in completed for l in LESSONS if l['topic'] == t['id']),
                      'total': sum(l['topic'] == t['id'] for l in LESSONS)} for t in TOPICS],
    }

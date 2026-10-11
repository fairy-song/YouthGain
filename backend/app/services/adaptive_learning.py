"""Versioned formative checks and explainable, low-data learning recommendations."""
from datetime import date, timedelta
from .learning_service import TOPICS
from .learning_question_bank import build_items
from .learning_profiles import context_profile, learning_profile, day as _day
VERSION = 'adaptive-v1'
# Correct choices stay on the server until submission; each task tests a stated skill.
ITEMS = [
    {'id': 'budget-basic', 'topic': 'budget', 'level': '基础', 'question': '本月到账 2000 元，必要开支 1200 元，月底考试费 300 元。暂不考虑其他支出，可另行安排多少？', 'options': ['800 元', '500 元', '2000 元'], 'answer': 1, 'explanation': '2000 − 1200 − 300 = 500。尚未支付的考试费也占用本月资源。', 'lesson': 'needs'},
    {'id': 'budget-transfer', 'topic': 'budget', 'level': '迁移', 'question': '一件已付款商品退款到账。重新安排预算时，哪种处理最完整？', 'options': ['退款是额外奖励，不需要纳入预算', '只记录退款，不核对原支出', '核对原支出与退款，把净支出和现有资源一起考虑'], 'answer': 2, 'explanation': '退款会改变净支出，应核对原交易，避免重复计算，也不预设退款必须消费或储蓄。', 'lesson': 'accounts'},
    {'id': 'choice-basic', 'topic': 'choice', 'level': '基础', 'question': '你想买鞋，也在为旅行存钱。比较选择时，哪项信息最关键？', 'options': ['各方案满足的需要、花费及对旅行安排的影响', '只看折扣是否足够大', '只看朋友是否购买'], 'answer': 0, 'explanation': '比较需要和机会成本后由自己决定；购买或等待都可能合理。', 'lesson': 'pause'},
    {'id': 'choice-transfer', 'topic': 'choice', 'level': '迁移', 'question': '你规定临时购物先等待，但今天必须更换损坏的通勤用品。怎样运用规则？', 'options': ['任何情况都必须等待', '考虑紧急需要和预算，按预先保留的例外处理', '既然有例外，就永久取消所有规则'], 'answer': 1, 'explanation': '自定规则可以保留必要消费的例外，复盘时再判断是否需要调整。', 'lesson': 'rule'},
    {'id': 'buffer-basic', 'topic': 'buffer', 'level': '基础', 'question': '余额充足，但下月电脑可能要维修，费用尚不确定。下一步怎么做？', 'options': ['忽略没有确定金额的支出', '认为维修一定会发生', '了解可能费用并预留余地，信息变化时调整'], 'answer': 2, 'explanation': '不确定不等于不存在，也不等于必然发生。先了解范围并准备备用方案。', 'lesson': 'attention'},
    {'id': 'buffer-transfer', 'topic': 'buffer', 'level': '迁移', 'question': '下月生活费可能减少，你又想参加活动。哪种安排更能应对变化？', 'options': ['先保障必要生活，再比较不同收入情境下的活动预算', '按最高可能收入把钱安排完', '因为有不确定性就完全不做计划'], 'answer': 0, 'explanation': '用不同情境检查计划，并保留调整空间；不确定性不应被当成确定收入。', 'lesson': 'transfer'},
    {'id': 'risk-basic', 'topic': 'risk', 'level': '基础', 'question': '有人介绍高回报方案，未解释损失和退出条件。最合适的下一步是什么？', 'options': ['因为回报高就立即加入', '核实损失、费用和退出限制，信息不足时暂不决定', '朋友参加就意味着没有风险'], 'answer': 1, 'explanation': '判断需要收益之外的证据；熟人推荐和高回报都不能代替风险信息。', 'lesson': 'uncertainty'},
    {'id': 'risk-transfer', 'topic': 'risk', 'level': '迁移', 'question': '分期付款每期金额很低，怎样比较一次付清和分期？', 'options': ['只比较每期金额', '默认分期一定更划算', '核对总支付额、费用、期限和每期负担'], 'answer': 2, 'explanation': '每期金额不能代表总成本，还要考虑付款约束和自己的现金安排。', 'lesson': 'uncertainty'},
]
ITEMS.extend(build_items())

# Code-reviewed pilot content remains clearly marked as pilot. Drafts and
# withdrawn items can be kept for editorial work but are never served.
CONTEXT_TAGS = {
    'phone-plan': ('budget', 'risk'), 'refund-check': ('choice', 'budget'),
    'credit-cost': ('risk', 'budget'), 'repair-buffer': ('buffer',),
    'saving-goal': ('budget', 'buffer'), 'subscription-audit': ('choice', 'buffer'),
    'statement-reconcile': ('budget',), 'offer-risk': ('risk',),
}
MICRO_ACTIONS = {
    'budget': '核对一项下月已经知道的开支。',
    'choice': '下次做消费决定时，写下一个备选方案。',
    'buffer': '写下一笔可能出现的开支和准备方式。',
    'risk': '遇到一个金融方案时，先核对费用或退出条件。',
}
for item in ITEMS[:8]:
    item['review_status'] = 'pilot'
for item in ITEMS:
    item.setdefault('review_status', 'draft')
    item.setdefault('content_version', 1)
    item.setdefault('source_note', '青盈原创试用题；正式发布前仍需人工内容复核')
    item.setdefault('reviewed_by', None)
    item.setdefault('reviewed_at', None)
    item.setdefault('knowledge_point', item.get('lesson') or item['topic'])
    item.setdefault('context_tags', CONTEXT_TAGS.get(item.get('scenario_id'), (item['topic'],)))
    item.setdefault('prerequisites', [] if item.get('step', 1) == 1 else [previous['id'] for previous in ITEMS
                    if previous.get('scenario_id') == item.get('scenario_id') and previous.get('step') == item['step'] - 1])
    item.setdefault('duration_minutes', 2)


def is_publishable(item):
    if item.get('review_status') == 'pilot':
        return bool(item.get('source_note'))
    return (item.get('review_status') == 'approved' and bool(item.get('source_note'))
            and bool(item.get('reference')) and bool(item.get('reviewed_by'))
            and _day(item.get('reviewed_at')) is not None)


def audit_bank(items=ITEMS):
    """Fail closed on missing editorial metadata or inconsistent step chains."""
    seen = set()
    for item in items:
        if item['id'] in seen:
            raise ValueError('题库编号重复')
        seen.add(item['id'])
        if (item.get('review_status') not in ('draft', 'pilot', 'approved', 'withdrawn')
                or type(item.get('content_version')) is not int or item['content_version'] < 1
                or not item.get('knowledge_point')
                or not item.get('context_tags') or not item.get('source_note')
                or not isinstance(item.get('duration_minutes'), int) or item['duration_minutes'] < 1):
            raise ValueError(f"题目 {item['id']} 缺少可审核的内容元数据")
        if item['review_status'] == 'approved' and not is_publishable(item):
            raise ValueError(f"题目 {item['id']} 缺少正式发布审核记录")
        if item.get('type', 'choice') == 'choice' and (not item.get('options') or
                type(item.get('answer')) is not int or item['answer'] not in range(len(item['options']))):
            raise ValueError(f"题目 {item['id']} 的选项或答案无效")
        if item.get('type') == 'number' and type(item.get('answer')) not in (int, float):
            raise ValueError(f"题目 {item['id']} 的金额答案无效")
        if item.get('step', 1) > 1 and not item.get('prerequisites'):
            raise ValueError(f"题目 {item['id']} 缺少前置步骤")
    return {'total': len(items), 'pilot': sum(item.get('review_status') == 'pilot' for item in items),
            'approved': sum(item.get('review_status') == 'approved' for item in items)}


audit_bank()


def public_item(item):
    result = {k: item[k] for k in ('id', 'topic', 'level', 'question', 'duration_minutes', 'knowledge_point', 'review_status')}
    for key in ('options', 'type', 'scenario_id', 'scenario_title', 'scenario_context', 'step', 'steps_total'):
        if key in item:
            result[key] = item[key]
    return result


def grade(item_id, choice):
    item = next((i for i in ITEMS if i['id'] == item_id), None)
    if item is None or not is_publishable(item):
        raise ValueError('请选择有效题目和答案')
    item_type = item.get('type', 'choice')
    if item_type == 'choice':
        if type(choice) is not int or choice not in range(len(item['options'])):
            raise ValueError('请选择有效题目和答案')
        correct = choice == item['answer']
        score = 1 if correct else 0
        evidence = item['options'][choice]
    elif item_type == 'number':
        if type(choice) not in (int, float) or not 0 <= choice <= 100000000:
            raise ValueError('请输入有效的非负金额')
        correct = abs(choice - item['answer']) < 0.005
        score = 1 if correct else 0.5 if any(abs(choice - value) < 0.005 for value in item.get('partial_answers', [])) else 0
        evidence = f'{choice:g} 元'
    elif item_type == 'reflection':
        if not isinstance(choice, str) or not 5 <= len(choice.strip()) <= 300:
            raise ValueError('请用 5 至 300 字写下你的想法')
        choice = choice.strip()
        correct = None
        score = None
        evidence = choice
    else:
        raise ValueError('题目类型暂不可用')
    return {'kind': 'diagnostic', 'version': VERSION, 'item_id': item_id, 'topic': item['topic'],
            'content_version': item['content_version'], 'knowledge_point': item['knowledge_point'],
            'choice': choice, 'correct': correct, 'score': score,
            'answer': item['answer'] if item_type != 'reflection' else None,
            'evidence': evidence, 'explanation': item['explanation'], 'lesson_id': item.get('lesson'),
            'scenario_id': item.get('scenario_id'), 'step': item.get('step'),
            'reference': item.get('reference'), 'review_status': item['review_status'],
            'micro_action': MICRO_ACTIONS[item['topic']] if item.get('step', 1) == item.get('steps_total', 1) else None}


def is_unlocked(item, answered_ids):
    if item.get('step', 1) == 1:
        return True
    scenario = item['scenario_id']
    return any(previous['id'] in answered_ids for previous in ITEMS
               if previous.get('scenario_id') == scenario and previous.get('step') == item['step'] - 1)


def _review_interval(item, latest, items):
    if latest[item['id']].get('correct') is False:
        return 2
    if item['level'] != '迁移' or latest[item['id']].get('correct') is not True:
        return 7
    same_point = {entry.get('scenario_id') or entry.get('item_id') for other in items
                  if other['knowledge_point'] == item['knowledge_point'] and other['id'] in latest
                  and (entry := latest[other['id']]).get('correct') is True}
    return 14 if len(same_point) >= 2 else 7


def recommend(entries, preferred='budget', transactions=None, today=None, preferred_source='selected_topic'):
    today = today or date.today()
    if preferred not in {topic['id'] for topic in TOPICS}:
        preferred = 'budget'
    eligible_items = [item for item in ITEMS if is_publishable(item)]
    eligible_ids = {item['id'] for item in eligible_items}
    latest = {}
    # Unique per item: repeating the same answer cannot manufacture more evidence.
    ordered_entries = sorted(entries, key=lambda e: (e.get('updated_at', ''), e.get('id', '')), reverse=True)
    for e in ordered_entries:
        if e.get('kind') == 'diagnostic' and e.get('version') == VERSION and e.get('item_id') in eligible_ids:
            latest.setdefault(e.get('item_id'), e)
    spending = context_profile(entries, transactions, today)
    context = {signal['topic']: signal for signal in spending['signals'] if signal['sufficient']}
    gaps = {item['topic'] for item in eligible_items if item['id'] in latest and latest[item['id']].get('correct') is False}
    # A fresh scenario is stronger evidence than immediate repetition of a fixed question.
    pending = [item for item in eligible_items if item['id'] not in latest and is_unlocked(item, latest)]
    due = [item for item in eligible_items if item['id'] in latest and
           (answered := _day(latest[item['id']].get('updated_at'))) and
           (today - answered).days >= _review_interval(item, latest, eligible_items)]
    candidates = pending + due

    # When a learner starts a scenario, finish its next step before switching topic.
    in_progress = [item for item in pending if item.get('step', 1) > 1 and
                   any(previous['id'] in latest for previous in eligible_items
                       if previous.get('scenario_id') == item['scenario_id'] and
                       previous.get('step') == item['step'] - 1)]
    recent_scenario = next((entry for entry in ordered_entries
                            if entry.get('kind') == 'diagnostic' and entry.get('version') == VERSION
                            and entry.get('scenario_id') and isinstance(entry.get('step'), int)), None)
    immediate_next = next((item for item in in_progress
                           if recent_scenario and item['scenario_id'] == recent_scenario['scenario_id']
                           and item['step'] == recent_scenario['step'] + 1), None)

    def score(item):
        topic = item['topic']
        new = item['id'] not in latest
        return (30 if topic in gaps else 0) + (15 if topic == preferred else 0) + (12 if topic in context else 0) + (15 if new and item.get('scenario_id') else 0) + (22 if not new else 0) + (2 if item['level'] == '基础' else 0)

    target = immediate_next or (max(in_progress, key=score) if in_progress
                                else max(candidates, key=score) if candidates else None)
    is_review = target is not None and target['id'] in latest
    lesson_item = target or next((item for item in eligible_items if item['topic'] in gaps), None)
    states = learning_profile(eligible_items, latest, today)
    reason = ''
    basis = None
    if target:
        if immediate_next:
            reason, basis = '继续刚才的情境，一次只做一步。', 'scenario_progress'
        elif target['topic'] in gaps:
            reason, basis = '这个主题有尚待巩固的答题证据。', 'scenario_answers'
        elif target['topic'] in context:
            reason, basis = context[target['topic']]['reason'] + '。', context[target['topic']]['source']
        elif is_review:
            reason, basis = '距离上次作答已有一段时间，可以试试复习。', 'review_schedule'
        elif target['topic'] == preferred:
            reason = ('与你在问卷中描述的学习方向相关。' if preferred_source == 'questionnaire'
                      else '符合你选的学习主题。')
            basis = preferred_source
        else:
            reason, basis = '先尝试一道尚未作答的新情境。', 'new_scenario'
    if not target and lesson_item:
        reason, basis = '新情境已完成；先回看需要巩固的主题，稍后再做原题复习。', 'scenario_answers'
    # Return only the learner's own completed feedback for read-only step review.
    # In particular, do not expose the server-side answer before submission.
    attempts = {item['id']: {key: latest[item['id']].get(key) for key in
                             ('evidence', 'explanation', 'correct', 'score', 'reference', 'micro_action')}
                for item in eligible_items if item['id'] in latest}
    review_schedule = [{'item_id': item['id'], 'due_on':
                        (_day(latest[item['id']].get('updated_at')) +
                         timedelta(days=_review_interval(item, latest, eligible_items))).isoformat()}
                       for item in eligible_items if item['id'] in latest and _day(latest[item['id']].get('updated_at'))]
    return {'version': VERSION, 'states': states, 'next_item': public_item(target) if target else None,
            'items': [public_item(i) for i in eligible_items if is_unlocked(i, latest)],
            'attempts': attempts,
            'lesson_id': lesson_item.get('lesson') if lesson_item else None,
            'reason': reason or '本轮新情境已完成，尚未到复习时间。可以继续开放练习；重复原题不算新的迁移证据。',
            'reason_basis': basis, 'context_profile': spending, 'review_schedule': review_schedule,
            'recommendation_mode': 'review' if is_review else 'new' if target else 'none',
            'limitation': '这是少量情境题的形成性反馈，不是财商、人格或心理诊断；答对不代表已经掌握。'}

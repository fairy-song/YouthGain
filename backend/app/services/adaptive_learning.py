"""Versioned formative checks: observed answers, never psychological diagnoses."""
from .learning_service import TOPICS
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


def public_item(item):
    return {k: item[k] for k in ('id', 'topic', 'level', 'question', 'options')}


def grade(item_id, choice):
    item = next((i for i in ITEMS if i['id'] == item_id), None)
    if item is None or type(choice) is not int or choice not in range(len(item['options'])):
        raise ValueError('请选择有效题目和答案')
    return {'kind': 'diagnostic', 'version': VERSION, 'item_id': item_id, 'topic': item['topic'],
            'choice': choice, 'correct': choice == item['answer'], 'answer': item['answer'],
            'evidence': item['options'][choice], 'explanation': item['explanation'], 'lesson_id': item['lesson']}


def recommend(entries, preferred='budget'):
    latest = {}
    # Unique per item: repeating the same answer cannot manufacture more evidence.
    for e in sorted(entries, key=lambda e: (e.get('updated_at', ''), e.get('id', '')), reverse=True):
        if e.get('kind') == 'diagnostic' and e.get('version') == VERSION:
            latest.setdefault(e.get('item_id'), e)
    ordered = sorted(ITEMS, key=lambda i: (i['topic'] != preferred, next(n for n, t in enumerate(TOPICS) if t['id'] == i['topic']), i['level'] != '基础'))
    wrong = next((i for i in ordered if i['id'] in latest and latest[i['id']].get('correct') is False), None)
    pending = next((i for i in ordered if i['id'] not in latest), None)
    target = wrong or pending
    states = []
    for topic in TOPICS:
        observed = [latest[i['id']] for i in ITEMS if i['topic'] == topic['id'] and i['id'] in latest]
        states.append({'topic': topic['id'], 'title': topic['title'], 'observed': len(observed),
                       'correct': sum(e.get('correct') is True for e in observed),
                       'status': '待观察' if not observed else '建议复习' if any(e.get('correct') is False for e in observed) else '已有答题证据，仍需新情境验证'})
    return {'version': VERSION, 'states': states, 'next_item': public_item(target) if target else None,
            'items': [public_item(i) for i in ITEMS],
            'lesson_id': target['lesson'] if target else None,
            'reason': '最近一次作答遗漏了该题的关键条件，建议先复习再尝试。' if wrong else '优先补充所选主题及尚未作答情境的证据。' if pending else '本轮情境已完成；重复作答不算新的迁移证据，可继续开放练习。',
            'limitation': '这是少量情境题的形成性反馈，不是财商、人格或心理诊断；答对不代表已经掌握。'}

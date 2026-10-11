"""Original pilot scenarios. Review and localise before expanding the bank."""

SCENARIOS = [
    {
        'id': 'phone-plan', 'topic': 'budget', 'lesson': 'needs', 'title': '更换手机前，算清这笔钱',
        'context': '本月生活费 2800 元，必要开支 1700 元，月底考试费 300 元。手机现付 1600 元，或分 6 期每期 290 元。',
        'reference': 'https://www.fdic.gov/consumer-resource-center/money-smart-young-adults',
        'steps': [
            {'id': 'phone-total', 'type': 'number', 'question': '分期总额比现付多多少元？', 'answer': 140,
             'explanation': '6 × 290 = 1740 元，比现付 1600 元多 140 元。还要确认是否另有服务费。'},
            {'id': 'phone-gap', 'type': 'number', 'question': '按已知开支，本月若现付，资金缺口是多少元？', 'answer': 800,
             'explanation': '2800 − 1700 − 300 = 800 元可安排；现付 1600 元，缺口为 800 元。'},
            {'id': 'phone-reflect', 'type': 'reflection', 'question': '决定是否分期前，你还需要确认哪一项信息？',
             'answer': '我会核对未来每月的必要开支。',
             'explanation': '可以核对未来每月必要开支、完整费用，以及手机是否急需更换。答案没有唯一选择；关键是让理由有依据。'},
        ],
    },
    {
        'id': 'refund-check', 'topic': 'choice', 'lesson': 'accounts', 'title': '退款到账后，核对真实支出',
        'context': '你买了一件 260 元的商品，后来退货。商家退回 230 元，另有 30 元运费不退。',
        'reference': 'https://www.oecd.org/en/publications/pisa-2022-results-volume-iv_5a849c2a-en/full-report/component-24.html',
        'steps': [
            {'id': 'refund-net', 'type': 'number', 'question': '这次购物最终净支出是多少元？', 'answer': 30,
             'explanation': '支付 260 元，收到退款 230 元，净支出为 30 元。不能把退款当成额外收入。'},
            {'id': 'refund-record', 'type': 'choice', 'question': '核对账本时，哪种做法能避免重复计算？',
             'options': ['删除原消费，不记录退款', '保留原消费和退款，核对净支出', '把退款记作一笔新收入，不看原消费'], 'answer': 1,
             'explanation': '保留原消费与退款，才能追溯交易，并核对最终净支出。'},
            {'id': 'refund-reflect', 'type': 'reflection', 'question': '如果退款金额和预计不同，你会先核对什么？',
             'answer': '我会核对订单和退款明细。',
             'explanation': '可以核对订单、退款明细、运费和平台规则，再判断是否需要联系商家。'},
        ],
    },
    {
        'id': 'credit-cost', 'topic': 'risk', 'lesson': 'uncertainty', 'title': '低月供背后的总成本',
        'context': '一台电脑现付 3600 元。某分期方案为 12 期，每期 330 元，另收一次性服务费 120 元。',
        'reference': 'https://www.oecd.org/en/publications/pisa-2022-results-volume-iv_5a849c2a-en/full-report/component-24.html',
        'steps': [
            {'id': 'credit-total', 'type': 'number', 'question': '这个分期方案最终共需支付多少元？', 'answer': 4080, 'partial_answers': [3960],
             'explanation': '12 × 330 + 120 = 4080 元。不能只比较每期金额。'},
            {'id': 'credit-extra', 'type': 'number', 'question': '分期总支付额比现付多多少元？', 'answer': 480, 'partial_answers': [360],
             'explanation': '4080 − 3600 = 480 元。是否值得这笔额外成本还取决于现金安排与实际需要。'},
            {'id': 'credit-reflect', 'type': 'reflection', 'question': '作决定前，你还想确认哪项条款或个人约束？',
             'answer': '我会查看逾期费用和未来现金流。',
             'explanation': '可以查看逾期费用、提前还款规则、未来月度现金流和电脑使用需求；不预设分期或现付一定适合每个人。'},
        ],
    },
    {
        'id': 'repair-buffer', 'topic': 'buffer', 'lesson': 'attention', 'title': '给不确定的维修费留空间',
        'context': '扣除已知必要开支后，你还有 1200 元。电脑维修预计 400–900 元，你还计划参加一场需花 600 元的活动。',
        'reference': 'https://www.fdic.gov/consumer-resource-center/money-smart-young-adults',
        'steps': [
            {'id': 'repair-gap', 'type': 'number', 'question': '若维修花 900 元且参加活动，最多会差多少元？', 'answer': 300,
             'explanation': '900 + 600 − 1200 = 300 元。这是给定范围的较高费用情境，不代表维修一定花 900 元。'},
            {'id': 'repair-check', 'type': 'choice', 'question': '决定活动安排前，哪项信息最值得先确认？',
             'options': ['只看当前余额', '核对维修报价和活动取消规则', '假定维修一定不需要花钱'], 'answer': 1,
             'explanation': '报价与取消规则会改变可行方案。先确认不确定的信息，再决定预留多少。'},
            {'id': 'repair-reflect', 'type': 'reflection', 'question': '如果维修只花 400 元，你会怎样重新安排？',
             'answer': '我会重新比较活动花费和备用金。',
             'explanation': '信息更新后可以重新比较活动、必要开支与备用金；没有要求把剩余的钱一律储蓄。'},
        ],
    },
    {
        'id': 'saving-goal', 'topic': 'budget', 'lesson': 'transfer', 'title': '储蓄目标需要动态调整',
        'context': '你想在 3 个月后存够 900 元，目前已有 150 元。第一个月只存了 100 元。',
        'reference': 'https://www.fdic.gov/consumer-resource-center/money-smart-young-adults',
        'steps': [
            {'id': 'saving-original', 'type': 'number', 'question': '若从现在起平均分 3 个月存，原计划每月需要存多少元？', 'answer': 250,
             'explanation': '(900 − 150) ÷ 3 = 250 元。目标要和实际可用资金一起检查。'},
            {'id': 'saving-revise', 'type': 'number', 'question': '第一个月只存了 100 元，若期限不变，剩下两个月平均每月需存多少元？', 'answer': 325,
             'explanation': '还差 900 − 150 − 100 = 650 元；650 ÷ 2 = 325 元。'},
            {'id': 'saving-reflect', 'type': 'reflection', 'question': '如果每月 325 元会挤压必要开支，你会调整什么？',
             'answer': '我会检查期限和目标金额。',
             'explanation': '可以调整期限、目标金额或其他可选支出；目标应服务生活需要，不必为达标牺牲必要开支。'},
        ],
    },
    {
        'id': 'subscription-audit', 'topic': 'choice', 'lesson': 'pause', 'title': '核对自动续费的全年影响',
        'context': '你有每月 19 元、29 元和 12 元的三项自动续费服务，价格在未来一年保持不变。',
        'reference': 'https://www.fdic.gov/consumer-resource-center/money-smart-young-adults',
        'steps': [
            {'id': 'subscription-year', 'type': 'number', 'question': '如果三项都继续，一年共支付多少元？', 'answer': 720,
             'explanation': '(19 + 29 + 12) × 12 = 720 元。小额续费累计后也会影响年度预算。'},
            {'id': 'subscription-save', 'type': 'number', 'question': '如果 29 元服务从下个月起停止，未来 12 个月比三项都续费少付多少元？', 'answer': 348,
             'explanation': '29 × 12 = 348 元。实际能否立即停止及退款规则仍需核对服务条款。'},
            {'id': 'subscription-reflect', 'type': 'reflection', 'question': '决定保留哪项服务时，你会比较哪些信息？',
             'answer': '我会比较使用频率和替代方案。',
             'explanation': '使用频率、学习或生活价值、可替代方案与取消条件都值得考虑，不应仅按价格高低决定。'},
        ],
    },
    {
        'id': 'statement-reconcile', 'topic': 'budget', 'lesson': 'accounts', 'title': '从流水核对真实余额',
        'context': '账户期初有 1120 元，奖学金到账 800 元，交房租 650 元，转账手续费 2 元，教材退款到账 120 元。',
        'reference': 'https://www.oecd.org/en/publications/pisa-2022-results-volume-iv_5a849c2a-en/full-report/component-24.html',
        'steps': [
            {'id': 'statement-balance', 'type': 'number', 'question': '按这些流水计算，期末余额应是多少元？', 'answer': 1388, 'partial_answers': [1390],
             'explanation': '1120 + 800 − 650 − 2 + 120 = 1388 元。手续费和退款都要纳入核对。'},
            {'id': 'statement-missing', 'type': 'choice', 'question': '如果自己算出的余额比账单多 2 元，最可能漏看了哪项？',
             'options': ['奖学金', '转账手续费', '房租'], 'answer': 1,
             'explanation': '差额恰好为 2 元，应先核对手续费；若仍不符，再检查其他流水。'},
            {'id': 'statement-reflect', 'type': 'reflection', 'question': '如果账单仍不一致，你会怎样继续核对？',
             'answer': '我会逐笔核对交易日期和金额。',
             'explanation': '可以逐笔核对日期、金额、未入账交易和退款状态；在确认前避免把差额当成可花的钱。'},
        ],
    },
    {
        'id': 'offer-risk', 'topic': 'risk', 'lesson': 'uncertainty', 'title': '兼职收入与预付费用',
        'context': '一份兼职声称每天收入 500 元，但要求先交 300 元“培训费”，并让你在聊天窗口发送银行卡验证码。',
        'reference': 'https://www.oecd.org/en/publications/pisa-2022-results-volume-iv_5a849c2a-en/full-report/component-24.html',
        'steps': [
            {'id': 'offer-signal', 'type': 'choice', 'question': '下面哪项信息最需要你立即停下来核实？',
             'options': ['工作地点离学校远', '要求预付费用并发送验证码', '兼职时间安排在周末'], 'answer': 1,
             'explanation': '预付费用和索取验证码都可能带来损失。不要在聊天窗口提供验证码。'},
            {'id': 'offer-action', 'type': 'choice', 'question': '在尚未付款或发送验证码时，哪项下一步更稳妥？',
             'options': ['先核实招聘主体与公开联系方式', '先付款占名额', '把验证码发过去测试真假'], 'answer': 0,
             'explanation': '先通过独立渠道核实招聘主体和条件，再决定是否继续；不要付款或发送验证码来测试。'},
            {'id': 'offer-reflect', 'type': 'reflection', 'question': '如果朋友也收到同样邀请，你会提醒他核对什么？',
             'answer': '我会提醒核对招聘主体和费用。',
             'explanation': '可以提醒对方核对主体、工作内容、费用与信息收集要求，并通过可信渠道求证。'},
        ],
    },
]


def build_items():
    items = []
    for scenario in SCENARIOS:
        total = len(scenario['steps'])
        for index, step in enumerate(scenario['steps'], start=1):
            items.append({**step, 'topic': scenario['topic'], 'level': '应用' if index < total else '迁移',
                          'scenario_id': scenario['id'], 'scenario_title': scenario['title'],
                          'scenario_context': scenario['context'], 'step': index, 'steps_total': total,
                          'lesson': scenario['lesson'],
                          'reference': scenario['reference'], 'review_status': 'pilot'})
    return items

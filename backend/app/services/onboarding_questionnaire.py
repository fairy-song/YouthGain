"""Versioned first-visit questionnaire. The preview is descriptive, not a skill score."""
from math import isfinite

VERSION = 2
CHOICES = {
    'q1': {'beginner', 'basic', 'intermediate', 'advanced'},
    'q2': {'none', 'savings_no_fund', 'lt1', '1to2', '3to6', 'gt6'},
    'q3': {'p0', 'p1to5', 'p6to10', 'p11to15', 'p16to20', 'p20plus'},
    'q4': {'never', 'rarely', 'monthly', 'weekly', 'daily'},
    'q5': {'always', 'often', 'sometimes', 'rarely', 'never'},
    'q6': {'short', 'p0to5', 'p5to10', 'p10to15', 'p15to25', 'p25plus'},
    'q7': {'over50', 'p30to50', 'under30', 'mortgage_only', 'none'},
    'q8': {'late', 'minimum', 'struggle', 'ontime', 'na'},
    'q9': {'over50', 'p40to50', 'p30to39', 'p20to29', 'under20', 'none'},
}
LIMITS = {'q10': 1000000, 'q11': 1000000, 'q12': 10000000}


def validate_answers(answers):
    if not isinstance(answers, dict) or set(answers) != {f'q{i}' for i in range(1, 13)}:
        raise ValueError('请按当前版本提交 12 道题的回答')
    clean = {}
    for key, choices in CHOICES.items():
        value = answers[key]
        if value is not None and (not isinstance(value, str) or value not in choices):
            raise ValueError(f'{key} 选项无效')
        clean[key] = value
    for key, maximum in LIMITS.items():
        value = answers[key]
        if value is not None:
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value) or not 0 <= value <= maximum:
                raise ValueError(f'{key} 金额无效')
            value = round(value, 2)
        clean[key] = value
    if clean['q7'] in ('none', 'mortgage_only'):
        if clean['q8'] not in (None, 'na') or clean['q9'] not in (None, 'none'):
            raise ValueError('无相关债务时，还款问题应选择不适用')
    return clean


def summarize(answers):
    knowledge = {
        'beginner': '你目前觉得自己刚开始了解个人理财',
        'basic': '你了解一些基础概念，希望进一步练习',
        'intermediate': '你已尝试维护预算并跟踪开支',
        'advanced': '你自述已有较多理财实践',
    }.get(answers['q1'], '你暂未填写理财了解程度')
    tracking = {
        'never': '你还没有开始回看开支', 'rarely': '你目前较少回看开支',
        'monthly': '你大约每月回看一次开支', 'weekly': '你大约每周回看一次开支',
        'daily': '你经常记录和分类开支',
    }.get(answers['q4'], '你暂未填写回看开支的频率')
    buffer = {
        'none': '你目前没有储蓄',
        'savings_no_fund': '你有储蓄，但尚未单独留出应急资金',
        'lt1': '你的应急储蓄还不到一个月开支',
        '1to2': '你的应急储蓄约覆盖 1—2 个月开支',
        '3to6': '你的应急储蓄约覆盖 3—6 个月开支',
        'gt6': '你的应急储蓄超过 6 个月开支',
    }.get(answers['q2'], '你暂未填写应急储蓄情况')
    focus, reason, topic = '安排收支', '先从了解收支和必要开支开始', 'budget'
    if answers['q8'] in ('late', 'minimum'):
        focus, reason, topic = '安排收支', '你提到还款安排可能需要优先核对', 'budget'
    elif answers['q2'] in ('none', 'savings_no_fund', 'lt1'):
        focus, reason, topic = '留有余地', '你提到应急准备可以先梳理', 'buffer'
    elif answers['q4'] in ('never', 'rarely'):
        focus, reason, topic = '安排收支', '你提到目前较少回看开支', 'budget'
    elif answers['q5'] in ('always', 'often'):
        focus, reason, topic = '理解取舍', '你提到实际开支有时超过计划', 'choice'
    return {'knowledge': knowledge, 'tracking': tracking, 'buffer': buffer,
            'focus': focus, 'reason': reason, 'topic': topic,
            'basis': '仅依据本次问卷自述，尚不是客观财商能力测验。'}

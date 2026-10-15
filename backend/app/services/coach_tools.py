"""Read-only coach task routing and named, deterministic financial facts."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re

VERSION = 'coach-tools-v2'


def understand(message, history):
    previous = [m['content'][:600] for m in history[-6:] if m.get('role') == 'user']
    followup = bool(previous and (len(message.strip()) < 30 or re.search(r'这个|那个|这样|具体|继续|为什么|刚才|改成', message)))
    query = '\n'.join(previous[-2:] + [message]) if followup else message
    personal = bool(re.search(r'预算|生活费|余额|结余|收入|开支|支出|花钱|买|支付|资金|贷款|借款|储蓄|攒钱|目标|存钱|还款', query))
    task = ('comparison' if re.search(r'比较|取舍|哪个|买不买|值不值', message) else
            'planning' if personal else 'knowledge')
    return {'task': task, 'retrieval_query': query[-2400:], 'uses_previous_question': followup,
            'needs_financial_tools': personal}


def _decimal(value):
    if isinstance(value, bool):
        raise ValueError('invalid_financial_number')
    try:
        value = Decimal(str(value))
    except (ValueError, InvalidOperation, TypeError):
        raise ValueError('invalid_financial_number')
    if not value.is_finite() or abs(value) > Decimal('100000000'):
        raise ValueError('invalid_financial_number')
    return value


def _extract_scenario(message, history):
    """Only unambiguous user-labelled inputs; no numbers from assistant messages."""
    inputs = {}
    labels = {'income': r'(?:月收入|每月收入|每月生活费)',
              'essential': r'(?:必要支出|必要开支|固定支出|固定开支)'}
    for text in [m.get('content', '') for m in history[-6:] if m.get('role') == 'user'] + [message]:
        for key, label in labels.items():
            pattern = label + r'\s*(?:是|为|有|约|大约|:|：)?\s*(\d+(?:\.\d{1,2})?)\s*(?:元)?'
            for match in re.finditer(pattern, text):
                if re.search(r'不是|并非|不再', text[max(0, match.start()-3):match.start()]):
                    inputs.pop(key, None)
                    continue
                try:
                    value = _decimal(match.group(1))
                except ValueError:
                    inputs.pop(key, None)
                    continue
                if value >= 0:
                    inputs[key] = value
    return inputs


def fact_catalog(calculation=None, snapshot=None, *, message='', history=()):
    facts = []

    def add(identifier, label, value, unit='元', source='system_calculation', assumptions=None):
        if value is None:
            return
        number = _decimal(value)
        facts.append({'id': identifier, 'label': label, 'value': float(number), 'unit': unit,
                      'source': source, 'assumptions': assumptions or []})

    calculation = calculation or {}
    condition = [calculation.get('limitation', '只依据已记录数据，不等于完整账户余额。')]
    for key, label, unit in [
        ('record_count', '已读取消费记录数', '笔'), ('monthly_income', '资料中的估算月收入', '元'),
        ('spent_this_month', '本月已记录消费', '元'),
        ('remaining_estimate', '估算收入减本月已记录支出', '元'),
        ('purchase_amount', '本次明确的试算金额', '元'),
        ('after_purchase_estimate', '扣除试算金额后的收支估计差', '元'),
        ('estimated_monthly_surplus', '历史估算月结余', '元'),
        ('equivalent_surplus_days', '消费等价结余天数', '天')]:
        if key in calculation:
            add('F:'+key, label, calculation[key], unit, assumptions=(condition + [calculation.get('delay_assumption', '')]) if key == 'equivalent_surplus_days' else condition)
    if snapshot:
        features = snapshot['features']
        for key, label in [
            ('available_remaining_month', '本月已确认可用剩余'),
            ('savings_locked_total', '储蓄目标锁定资金'),
            ('goal_remaining', '当前目标尚需金额'),
            ('upcoming_30d', '近期已登记未来开支'),
            ('goal_plan_shortfall', '目标规划资金缺口'),
            ('planned_free_now', '按已知规划预留后的当前余量')]:
            if features.get(key) is not None:
                add('F:'+key, label, features[key], source='finance_snapshot',
                    assumptions=[snapshot['limitation'], '快照时点：'+snapshot['as_of']])
    scenario = _extract_scenario(message, history)
    if set(scenario) == {'income', 'essential'}:
        add('F:scenario_income', '本轮给定月收入', scenario['income'], source='user_scenario')
        add('F:scenario_essential', '本轮给定必要支出', scenario['essential'], source='user_scenario')
        add('F:scenario_surplus', '本轮给定收入减必要支出', scenario['income']-scenario['essential'],
            source='user_scenario', assumptions=['仅比较明确提供的两项金额，其他未提供开支未扣除。'])
    return facts


def display_fact(fact):
    value = _decimal(fact['value'])
    unit = fact.get('unit', '')
    digits = 0 if unit == '笔' else 1 if unit == '天' else 2
    value = value.quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP)
    return f'{value:.{digits}f}{unit}'


def safe_reply(evidence):
    """A labelled, fully server-rendered fallback, never an unverified model reply."""
    facts = evidence.get('facts', [])
    selected = [f for f in facts if f['id'] in {
        'F:spent_this_month', 'F:available_remaining_month', 'F:planned_free_now',
        'F:equivalent_surplus_days', 'F:scenario_surplus'}]
    if selected:
        parts = ['本轮先按已经核实的输入看资金安排：']
        parts.extend(f"- {f['label']}：{display_fact(f)}。" for f in selected)
        parts.append('这些数字有各自的统计范围；尚未记录的开支不会自动补齐。可以先核对必要开支与目标，再比较可调整的部分。')
        return '\n\n'.join(parts)
    sources = evidence.get('sources', [])
    if sources:
        return ('本轮先提供与问题相关、可核对的知识内容：\n\n' + sources[0]['excerpt'] +
                '\n\n这段资料用于理解概念与适用条件，暂不据此推断你的个人余额或财务能力。')
    return None

"""Validate fact bindings, citation membership and limited passage support.

These checks do not claim full semantic truth or educational effectiveness.
"""
from decimal import Decimal
import json
import re

from .coach_tools import display_fact
from .knowledge_retriever import tokens

SLOT = re.compile(r'\{\{(F:[a-z0-9_]+)\}\}')
UNIT_SLOT = re.compile(r'\{\{(F:[a-z0-9_]+)\}\}(元|天|笔|%|％|个月|月|年|倍|小时|分钟)?')
QUANTITY = re.compile(r'(?:\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千万亿半]+)\s*(?:元|天|个月|月|年|%|％|倍|笔)')


def _verified_example(text):
    match = re.fullmatch(r'(.*?)假设每月存(\d+(?:\.\d+)?)元[，, ]*(\d+)个月(?:就是|是|共|可存)(\d+(?:\.\d+)?)元[。.!！]?\s*', text, re.S)
    return bool(match and not QUANTITY.search(match[1]) and not re.search(r'\d', match[1])
                and Decimal(match[2])*Decimal(match[3]) == Decimal(match[4]))


def _bind_literal_scenario(text, facts, declared):
    """Compatibility for models copying inputs: bind only exact, labelled facts.

    No arbitrary number replacement: both semantic field label and Decimal value
    must agree with a declared server-calculated scenario fact. Unknown numbers
    still fail the ordinary validator. Account/balance figures are never inferred.
    """
    aliases = {'F:scenario_income': r'(?:月收入|收入)',
               'F:scenario_essential': r'(?:必要支出|必要开支)',
               'F:scenario_surplus': r'(?:还能留(?:下)?(?:的钱)?|可以留(?:下)?(?:的钱)?|能留(?:下)?|可留|收入减必要支出|收支差)'}
    bindings = []
    for identifier, label in aliases.items():
        if identifier not in declared or identifier not in facts:
            continue
        pattern = '('+label+r'\s*(?:约|是|为|有|：|:)?\s*)(\d+(?:\.\d+)?)\s*元'
        def replace(match):
            if Decimal(match[2]) != Decimal(str(facts[identifier]['value'])):
                return match[0]
            bindings.append(identifier)
            return match[1] + '{{'+identifier+'}}'
        text = re.sub(pattern, replace, text)
    return text, bindings


def validate_reply(raw, evidence):
    from .coach_evidence import prepare_coach_answer
    errors = []
    if not isinstance(raw, str) or len(raw) > 16000:
        return None, {'errors': ['invalid_response']}
    cleaned = re.sub(r'<think\b[^>]*>.*?(?:</think>|$)', '', raw, flags=re.I|re.S).strip()
    fenced = re.fullmatch(r'```(?:json)?\s*(.*?)\s*```', cleaned, re.S)
    cleaned = fenced[1] if fenced else cleaned
    structured = cleaned.startswith(('{', '['))
    data = None
    if structured:
        try:
            data = json.loads(cleaned)
        except ValueError:
            return None, {'errors': ['invalid_json']}
        if not isinstance(data, dict) or not isinstance(data.get('explanation'), str):
            return None, {'errors': ['invalid_schema']}
        explanation = data['explanation']
        source_ids = data.get('source_ids', [])
        fact_ids = data.get('fact_ids', [])
        claims = data.get('claims', [])
    else:
        explanation, source_ids, fact_ids, claims = cleaned, [], [], []
    if prepare_coach_answer(json.dumps({'explanation': explanation}, ensure_ascii=False)) is None:
        errors.append('empty_or_reference_only')
    sources = {s['source_id']: s for s in evidence.get('sources', [])}
    facts = {f['id']: f for f in evidence.get('facts', [])}
    if any(m[2] and m[1] in facts and m[2] != facts[m[1]]['unit'] for m in UNIT_SLOT.finditer(explanation)):
        errors.append('fact_unit_mismatch')
    interpretation_rewrites = []
    if 'F:scenario_surplus' in facts:
        # Normalise this narrowly bound field's interpretation, not arbitrary prose.
        # Income minus the given essential expenses is never a confirmed balance.
        pattern = r'(?:您(?:的)?|你(?:的)?|本月|每月)*\s*可支配(?:的)?(?:金额|收入|资金)\s*(?:是|为)\s*\{\{F:scenario_surplus\}\}(?:元)?'
        explanation, count = re.subn(pattern, '给定收入减必要支出的差额为{{F:scenario_surplus}}（其他未提供开支尚未扣除）', explanation)
        if count:
            interpretation_rewrites.append('scenario_surplus_is_not_disposable_balance')
    if not isinstance(source_ids, list) or any(not isinstance(s, str) or s not in sources for s in source_ids):
        errors.append('unknown_source')
        source_ids = []
    literal_bindings = []
    if structured and isinstance(fact_ids, list) and all(isinstance(f, str) for f in fact_ids):
        explanation, literal_bindings = _bind_literal_scenario(explanation, facts, fact_ids)
    slots = set(SLOT.findall(explanation))
    if not isinstance(fact_ids, list) or any(not isinstance(f, str) or f not in facts for f in fact_ids):
        errors.append('unknown_fact')
    elif structured and slots != set(fact_ids):
        errors.append('fact_bindings_do_not_match')
    if slots - facts.keys():
        errors.append('unknown_fact_slot')
    without_slots = SLOT.sub('', explanation)
    example_verified = _verified_example(without_slots)
    if QUANTITY.search(without_slots) and not example_verified:
        errors.append('unbound_financial_number')
    if facts and re.search(r'\d', re.sub(r'^\s*\d+[.)、]\s*', '', without_slots, flags=re.M)) and not example_verified:
        errors.append('unbound_personal_number')
    if re.search(r'https?://|www\.|\[\s*K\d+\s*\]|\{\{', SLOT.sub('', explanation)):
        errors.append('invented_link_or_reference')
    if not isinstance(claims, list) or len(claims) > 12:
        errors.append('invalid_claims')
    else:
        for claim in claims:
            if not isinstance(claim, dict) or not isinstance(claim.get('text'), str) or not claim['text'].strip():
                errors.append('invalid_claim'); continue
            ids = claim.get('source_ids')
            if (not isinstance(ids, list) or not ids or any(not isinstance(i, str) or i not in sources for i in ids)
                    or any(i not in source_ids for i in ids) or claim['text'] not in explanation):
                errors.append('unsupported_claim_reference'); continue
            body = ' '.join(sources[i]['excerpt'] for i in ids)
            meaningful = set(tokens(SLOT.sub('', claim['text']))) - {'可以','需要','应该','我们','一个','进行','相关','问题','自己'}
            if not meaningful.intersection(tokens(body)):
                errors.append('claim_passage_mismatch')
        claimed_sources = set()
        for claim in claims:
            if isinstance(claim, dict) and isinstance(claim.get('source_ids'), list):
                claimed_sources.update(s for s in claim['source_ids'] if isinstance(s, str))
        if set(source_ids) - claimed_sources:
            errors.append('source_without_bound_claim')
    if re.search(r'可自由支配|实际余额|账户余额|可用余额|可支配(?:金额|收入|余额|资金)', explanation):
        has_balance = any(k in facts for k in ('F:available_remaining_month','F:planned_free_now'))
        if not has_balance and not re.search(r'不等于|不是|未知|未确认|不能|无法|缺少|尚未扣除|未提供', explanation):
            errors.append('unsupported_balance_interpretation')
    if re.search(r'目标.{0,8}(?:推迟|延迟)', explanation) and slots.intersection({'F:equivalent_surplus_days'}):
        if not re.search(r'不等于|不意味着|不是|不能', explanation):
            errors.append('equivalent_days_are_not_goal_delay')
    validation = {'errors': sorted(set(errors)), 'checked_fact_ids': sorted(slots),
                  'used_source_ids': source_ids if isinstance(source_ids, list) else [],
                  'example_arithmetic_verified': example_verified,
                  'literal_scenario_bindings': literal_bindings,
                  'interpretation_rewrites': interpretation_rewrites,
                  'scope': '核对程序事实绑定、数值口径、来源编号与片段词面关联；不保证所有陈述的语义真实性。'}
    if errors:
        return None, validation
    reply = UNIT_SLOT.sub(lambda m: display_fact(facts[m[1]]), explanation).strip()
    if slots.intersection({'F:scenario_income', 'F:scenario_essential', 'F:scenario_surplus'}):
        reply = '以下按本轮给定情境分析，未提供的其他开支尚未扣除。\n\n' + reply
    return reply, validation

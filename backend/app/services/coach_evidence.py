"""Deterministic, account-independent evidence selection and response rendering."""
import json
import math
import re
from datetime import date
from .decision_engine import calculate_surplus, calculate_opportunity_cost

VERSION = 'grounded-v1'
LIMITATION = '仅基于已记录消费；漏记不等于零支出。未来开支尚未扣除，结果不是完整可支配余额，也不是确定预测。'


def prepare_coach_answer(raw):
    """Accept ordinary prose and numbers; reject empty/reference-only output.

    This is presentation validation, never a claim of factual verification.
    Legacy JSON is unwrapped so older provider responses remain readable.
    """
    if not isinstance(raw, str):
        return None
    text = re.sub(r'<think\b[^>]*>.*?(?:</think>|$)', '', raw,
                  flags=re.DOTALL | re.IGNORECASE).strip()
    fenced = re.fullmatch(r'```(?:json)?\s*(.*?)\s*```', text, flags=re.DOTALL)
    candidate = fenced.group(1) if fenced else text
    if candidate.startswith(('{', '[')):
        try:
            value = json.loads(candidate)
        except ValueError:
            return None
        if not isinstance(value, dict) or not isinstance(value.get('explanation'), str):
            return None
        text = value['explanation'].strip()
    if not text or re.search(r'\[\s*K\d+\s*\]|^\s*K\d+\s*[:：.、\- ]', text, re.MULTILINE):
        return None
    if any(phrase in text for phrase in ('请先核对下方资料', '请核对下方资料', '请自行阅读资料', '答案见知识库', '资料摘录：')):
        return None
    return text


def terms(text):
    words = re.findall(r'[a-z0-9]+|[\u4e00-\u9fff]+', str(text).lower())
    return {part for word in words for part in ([word] if not re.search(r'[\u4e00-\u9fff]', word) else [word[i:i+2] for i in range(len(word)-1)])}


def retrieve(query, articles, limit=3):
    """Chinese bigram lexical baseline; abstain on weak matches. No external index."""
    query_terms = terms(query)
    ranked = []
    for article in articles:
        if not article.get('id') or not article.get('content'):
            continue
        title = str(article.get('title') or '')
        summary = str(article.get('summary') or '')
        # Small passages, not entire articles; preserve exact supporting text.
        for index, passage in enumerate(re.split(r'\n\s*\n', str(article['content']))):
            passage = passage.strip()[:1000]
            matched = query_terms & terms(passage)
            title_matches = query_terms & terms(title + ' ' + summary)
            # A title hit alone must not promote an unrelated heading or source list.
            if len(passage) < 12 or not matched or len(matched | title_matches) < 2:
                continue
            score = (len(matched) + 2 * len(title_matches)) / math.sqrt(max(1, len(terms(passage))))
            ranked.append((score, str(article['id']), index, {
                'article_id': str(article['id']), 'title': title[:160],
                'excerpt': passage, 'date': str(article.get('date') or ''),
            }))
    ranked.sort(key=lambda item: (-item[0], item[1], item[2]))
    selected, seen = [], set()
    for _, article_id, _, source in ranked:
        if article_id not in seen:
            selected.append(dict(source, source_id=f'K{len(selected)+1}'))
            seen.add(article_id)
        if len(selected) >= limit:
            break
    return selected


def compute_facts(transactions, income, amount=None, today=None, skipped=0, limited=False):
    today = today or date.today()
    transactions = [t for t in transactions if t.date <= today]
    current = [t for t in transactions if (t.date.year, t.date.month) == (today.year, today.month)]
    dates = [t.date for t in transactions]
    span = (max(dates) - min(dates)).days + 1 if dates else 0
    facts = {'record_count': len(transactions), 'start': min(dates).isoformat() if dates else None,
             'end': max(dates).isoformat() if dates else None, 'monthly_income': income,
             'spent_this_month': round(sum(t.amount for t in current), 2),
             'skipped': skipped, 'limited': limited, 'coverage': 'unknown', 'limitation': LIMITATION}
    if income is None or not transactions:
        facts['message'] = '资料或消费记录不足，暂不估算结余和目标影响。'
        return facts
    facts['remaining_estimate'] = round(income - facts['spent_this_month'], 2)
    if amount is not None:
        facts['purchase_amount'] = amount
        facts['after_purchase_estimate'] = round(facts['remaining_estimate'] - amount, 2)
        if span >= 30 and not skipped and not limited:
            surplus = calculate_surplus(income, transactions)
            if surplus > 0:
                facts['delay_days'] = calculate_opportunity_cost(amount, surplus).delay_days
                facts['delay_assumption'] = '假设这笔支出原本用于未完成的储蓄目标，之后维持历史估算月结余；不含收益。'
            else:
                facts['message'] = '历史估算结余不为正，暂不推算目标延迟。'
        else:
            facts['message'] = '记录跨度不足三十天、存在无效记录或读取已达上限，暂不推算目标延迟。'
    return facts


def plain(value):
    return re.sub(r'[<>\[\]()*_`#!\\]', '', str(value)).replace('\n', ' ')


def render_evidence(evidence):
    parts = []
    facts = evidence.get('calculation')
    if facts:
        parts += ['**本次计算依据（系统计算）**',
                  f"已读取 {facts['record_count']} 笔记录，区间 {facts['start'] or '未知'} 至 {facts['end'] or '未知'}。",
                  f"本月已记录支出：¥{facts['spent_this_month']:.2f}。"]
        for key, label in [('remaining_estimate', '收入减去本月已记录支出'), ('after_purchase_estimate', '再扣除本次试算金额后的余量')]:
            if key in facts:
                parts.append(f"{label}：¥{facts[key]:.2f}。")
        if 'delay_days' in facts:
            parts.append(f"按历史结余估算的目标延迟：约 {facts['delay_days']} 天。{facts['delay_assumption']}")
        if facts.get('message'):
            parts.append(facts['message'])
        if facts['skipped'] or facts['limited']:
            parts.append('部分记录无效或读取已达上限，本次数据不完整。')
        parts.append(LIMITATION)
    if evidence.get('knowledge_status') == 'unavailable':
        parts.append('知识库暂时不可用，本次没有检索证据。')
    elif not evidence.get('sources'):
        parts.append('本次未检索到足够相关的知识片段。')
    for source in evidence.get('sources', []):
        parts.append(f"**[{source['source_id']}] {plain(source['title'])}**\n\n资料摘录：{plain(source['excerpt'])}\n\n来源：站内知识库；更新日期：{plain(source['date']) or '未标注'}。")
    return '\n\n'.join(parts)


def validate_explanation(raw, sources):
    """Fail closed for malformed JSON, invented citations/URLs and numeric prose.

    This verifies structure, not semantic truth. Numerical facts are server-rendered.
    """
    try:
        if not isinstance(raw, str):
            return None
        # Providers sometimes wrap otherwise valid JSON in one Markdown fence.
        fenced = re.fullmatch(r'\s*```(?:json)?\s*\n?(.*?)\n?```\s*', raw, flags=re.DOTALL)
        if fenced:
            raw = fenced.group(1)
        data = json.loads(raw)
        explanation, ids = data['explanation'], data['source_ids']
        allowed = {s['source_id'] for s in sources}
        if not isinstance(explanation, str) or not explanation.strip() or len(explanation) > 3000:
            return None
        if not isinstance(ids, list) or any(not isinstance(i, str) or i not in allowed for i in ids):
            return None
        if re.search(r'\d|https?://|www\.|[<>\[\]]|[零〇一二两三四五六七八九十百千万亿半]+\s*(?:元|天|月|年|%|％|成|倍)', explanation):
            return None
        return explanation.strip()
    except (ValueError, KeyError, TypeError):
        return None

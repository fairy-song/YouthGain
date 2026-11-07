"""Public corpus quotas; counts are never inferred from a truncated UI list."""
import hashlib
import json
from flask import current_app


def limits():
    return {'articles': int(current_app.config.get('KNOWLEDGE_MAX_ARTICLES', 1000)),
            'passages': int(current_app.config.get('KNOWLEDGE_MAX_PASSAGES', 20000))}


def corpus_digest(articles):
    return hashlib.sha256(json.dumps(sorted(articles, key=lambda a: str(a.get('id', ''))),
                                    sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()


def current_articles(conn, candidate=None, replace_id=None):
    from .admin_service import _list_manual_kb_articles
    from .knowledge_updates import public_article
    manual, error = _list_manual_kb_articles(None)
    if error:
        raise ValueError('无法核对知识库存量，暂不发布')
    rows = conn.execute("SELECT d.id,v.payload FROM ku_documents d JOIN ku_versions v ON d.current_id=v.id WHERE d.withdrawn=0 AND v.status='approved'").fetchall()
    articles = manual + [public_article(json.loads(payload), identifier) for identifier, payload in rows]
    if replace_id is not None:
        articles = [a for a in articles if str(a['id']) != str(replace_id)]
    if candidate is not None:
        articles.append(dict(candidate, id=replace_id or 'new-candidate'))
    return articles


def check(articles):
    from .knowledge_retriever import passages
    quota = limits()
    if len(articles) > quota['articles']:
        raise ValueError('已达到知识库文章配额，请先调整额度或撤回不再适用的内容')
    count = len(passages(articles))
    if count > quota['passages']:
        raise ValueError('已达到知识库片段配额，内容保留待处理，未发布')


def report(articles):
    from .knowledge_retriever import passages, _index, LocalModels
    from .knowledge_index_store import statistics
    quota = limits()
    chunks = passages(articles)
    eligible = [a for a in articles if a.get('region', 'CN') == 'CN']
    error = None
    digest = None
    try:
        _, _, digest = _index(eligible, LocalModels(), False)
        indexed = statistics()
    except Exception:
        indexed = {}
        error = '持久索引暂不可用；库存统计仍有效，未声明全部可检索'
    return {'published_articles': len(articles), 'passages': len(chunks),
            'body_characters': sum(len(a.get('content') or '') for a in articles),
            'body_bytes': sum(len((a.get('content') or '').encode()) for a in articles),
            'coach_eligible_articles': len(eligible), 'limits': quota,
            'over_capacity': len(articles) > quota['articles'] or len(chunks) > quota['passages'],
            'index': indexed, 'index_current': bool(current_app.config.get('KNOWLEDGE_PERSISTENT_INDEX', True)
                                                  and digest and indexed.get('snapshot') == digest),
            'index_error': error, 'verified_capacity': None,
            'corpus_snapshot': corpus_digest(articles)}

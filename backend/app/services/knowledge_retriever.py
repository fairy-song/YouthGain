"""Public-knowledge BM25 + dense retrieval, RRF fusion and cross-encoder reranking.

Models are provisioned explicitly, never downloaded during a web request. No
account data is accepted by the index or retained in its content-addressed cache.
"""
from collections import Counter, OrderedDict
from functools import lru_cache
import hashlib
import json
import logging
import math
import os
from pathlib import Path
import re
import threading

import numpy as np

VERSION = 'coach-hybrid-v2'
log = logging.getLogger(__name__)
_indexes = OrderedDict()
_lock = threading.RLock()


def tokens(text):
    result = []
    for word in re.findall(r'[a-z0-9]+|[\u4e00-\u9fff]+', str(text).lower()):
        result.extend([word] if not re.search(r'[\u4e00-\u9fff]', word)
                      else [word[i:i+2] for i in range(max(1, len(word)-1))])
    return result


def _config(name, default):
    from flask import current_app, has_app_context
    return current_app.config.get(name, default) if has_app_context() else os.environ.get(name, default)


@lru_cache(maxsize=2)
def _load_encoder(path, cross=False):
    if not path or not Path(path).is_dir():
        raise FileNotFoundError('local_knowledge_model_not_provisioned')
    from sentence_transformers import SentenceTransformer, CrossEncoder
    import torch
    torch.set_num_threads(2)
    if cross:
        return CrossEncoder(path, device='cpu', local_files_only=True, max_length=512)
    return SentenceTransformer(path, device='cpu', local_files_only=True)


class LocalModels:
    """The same adapters are injectable into the offline evaluation and tests."""
    @property
    def signature(self):
        return str(_config('COACH_EMBEDDING_PATH', ''))

    def encode(self, texts, *, query=False):
        model = _load_encoder(self.signature)
        if query:
            texts = ['为这个句子生成表示以用于检索相关文章：' + text for text in texts]
        return np.asarray(model.encode(texts, normalize_embeddings=True,
                                       show_progress_bar=False, batch_size=16), dtype=np.float32)

    def rerank(self, pairs):
        model = _load_encoder(str(_config('COACH_RERANKER_PATH', '')), True)
        values = np.asarray(model.predict(pairs, show_progress_bar=False, batch_size=8), dtype=np.float32).reshape(-1)
        # BGE returns relevance logits, not a calibrated probability of truth.
        return values


def passages(articles):
    result = []
    for article in articles[:2000]:
        if not isinstance(article, dict) or not article.get('id') or not article.get('content'):
            continue
        content = str(article['content'])[:40000]
        title = str(article.get('title') or '')[:160]
        offset = 0
        for paragraph in re.split(r'\n\s*\n', content):
            paragraph = paragraph.strip()
            for start in range(0, len(paragraph), 700):
                excerpt = paragraph[start:start+800]
                if len(excerpt) < 12:
                    continue
                body_terms = Counter(tokens(excerpt))
                title_terms = Counter(tokens(title + ' ' + str(article.get('summary') or '')))
                weighted = body_terms + Counter({term: count*2 for term, count in title_terms.items()})
                result.append({'article_id': str(article['id']), 'passage_id': f"{article['id']}:{offset}:{start}",
                               'title': title, 'excerpt': excerpt, 'date': str(article.get('date') or ''),
                               '_terms': weighted, '_body_terms': body_terms,
                               '_text': title + '\n' + excerpt})
            offset += len(paragraph)
    return result


def _index(articles, models, dense):
    documents = passages(articles)
    fingerprint = hashlib.sha256(json.dumps(
        [{k: v for k, v in d.items() if not k.startswith('_')} for d in documents],
        sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    key = (fingerprint, models.signature if dense else 'bm25')
    with _lock:
        if key in _indexes:
            _indexes.move_to_end(key)
            return _indexes[key]
        matrix = None
        if dense and documents:
            matrix = models.encode([d['_text'] for d in documents])
            if matrix.ndim != 2 or matrix.shape[0] != len(documents) or not np.isfinite(matrix).all():
                raise ValueError('invalid_document_embeddings')
        value = (documents, matrix, fingerprint)
        _indexes[key] = value
        while len(_indexes) > 4:
            _indexes.popitem(last=False)
        return value


def _bm25(query, docs):
    terms = set(tokens(query))
    n = len(docs)
    avg = sum(sum(d['_terms'].values()) for d in docs) / max(1, n)
    scores = np.zeros(n, dtype=np.float64)
    for term in terms:
        df = sum(term in d['_terms'] for d in docs)
        idf = math.log(1 + (n-df+.5)/(df+.5))
        for i, doc in enumerate(docs):
            tf = doc['_terms'][term]
            length = sum(doc['_terms'].values())
            if tf and terms.intersection(doc['_body_terms']):
                scores[i] += idf * tf * 2.5 / (tf + 1.5*(.25+.75*length/max(1, avg)))
    return scores


def retrieve_knowledge(query, articles, limit=3, *, models=None, mode=None):
    if not isinstance(articles, list):
        raise ValueError('articles_must_be_a_list')
    limit = max(1, min(int(limit), 8))
    models = models or LocalModels()
    mode = mode or _config('COACH_RETRIEVAL_MODE', 'hybrid')
    dense = mode == 'hybrid'
    trace = {'version': VERSION, 'requested': mode, 'used': 'bm25', 'degraded': False,
             'reason': None, 'semantic_model': None, 'reranker_model': None}
    try:
        docs, matrix, digest = _index(articles, models, dense)
    except Exception:
        log.warning('Semantic knowledge index unavailable; using BM25', exc_info=False)
        docs, matrix, digest = _index(articles, models, False)
        trace.update(degraded=True, reason='semantic_model_unavailable')
    trace['corpus_version'] = digest
    if not docs or not tokens(query):
        return {'sources': [], 'retrieval': trace}
    sparse = _bm25(query, docs)
    sparse_order = sorted((i for i, s in enumerate(sparse) if s > 0), key=lambda i: (-sparse[i], docs[i]['passage_id']))[:20]
    ranks = {}
    for rank, i in enumerate(sparse_order, 1):
        ranks[i] = 1/(60+rank)
    similarities = np.zeros(len(docs))
    if matrix is not None:
        try:
            q = models.encode([query], query=True)
            if q.shape != (1, matrix.shape[1]) or not np.isfinite(q).all():
                raise ValueError('invalid_query_embedding')
            # Normalize independently to protect adapters returning unnormalized embeddings.
            similarities = (matrix @ q[0]) / np.maximum(1e-9, np.linalg.norm(matrix, axis=1)*np.linalg.norm(q[0]))
            threshold = float(_config('COACH_SEMANTIC_MIN_SCORE', .45))
            dense_order = sorted((i for i, s in enumerate(similarities) if s >= threshold),
                                 key=lambda i: (-similarities[i], docs[i]['passage_id']))[:20]
            for rank, i in enumerate(dense_order, 1):
                ranks[i] = ranks.get(i, 0) + 1/(60+rank)
            trace.update(used='bm25+dense+rrf', semantic_model=models.signature)
        except Exception:
            trace.update(degraded=True, reason='semantic_query_failed')
    candidates = sorted(ranks, key=lambda i: (-ranks[i], docs[i]['passage_id']))[:12]
    reranked = {}
    if candidates and dense and matrix is not None:
        try:
            values = models.rerank([(query, docs[i]['_text']) for i in candidates])
            if len(values) != len(candidates) or not np.isfinite(values).all():
                raise ValueError('invalid_reranker_scores')
            reranked = dict(zip(candidates, map(float, values)))
            candidates.sort(key=lambda i: (-reranked[i], -ranks[i], docs[i]['passage_id']))
            trace.update(used='bm25+dense+rrf+cross_encoder',
                         reranker_model=str(_config('COACH_RERANKER_PATH', 'local_cross_encoder')))
        except Exception:
            trace.update(degraded=True, reason='reranker_unavailable')
    selected, seen = [], set()
    for i in candidates:
        doc = docs[i]
        # Do not silently promote a title-only hit when dense retrieval is unavailable.
        body_hits = set(tokens(query)).intersection(doc['_body_terms'])
        if matrix is None and len(body_hits | set(tokens(query)).intersection(tokens(doc['title']))) < 2:
            continue
        if reranked and reranked[i] < float(_config('COACH_RERANK_MIN_LOGIT', -5)):
            continue
        if doc['article_id'] in seen:
            continue
        source = {k: v for k, v in doc.items() if not k.startswith('_')}
        source.update(source_id=f'K{len(selected)+1}', scores={'bm25': round(float(sparse[i]), 6),
                      'cosine': round(float(similarities[i]), 6), 'rrf': round(ranks[i], 8),
                      'cross_encoder': round(reranked[i], 6) if i in reranked else None})
        selected.append(source); seen.add(doc['article_id'])
        if len(selected) == limit:
            break
    return {'sources': selected, 'retrieval': trace}

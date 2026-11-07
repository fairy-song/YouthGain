"""Isolated synthetic lexical-index probe; no user data, network, or AI model calls.

Run from the repository root with .venv/Scripts/python.exe. This measures a
single process, not concurrent service throughput or semantic-model capacity.
"""
import json
from pathlib import Path
import statistics
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from flask import Flask
from app.services import knowledge_retriever as kr
from app.services.knowledge_index_store import statistics as index_statistics

(ROOT / 'tmp').mkdir(exist_ok=True)
directory = Path(tempfile.mkdtemp(prefix='knowledge-capacity-', dir=ROOT / 'tmp'))
app = Flask(__name__)
app.config.update(KNOWLEDGE_INDEX_DB_PATH=str(directory / 'index.db'), KNOWLEDGE_PERSISTENT_INDEX=True)
results = []
with app.app_context():
    for count in (100, 500, 1000):
        articles = [dict(id=f'synthetic-{i}', title=f'模拟资料{i}',
                         content=(f'样例编号{i}。先记录生活费与必要开支，核对目标、消费安排和实际支出。' * 60)[:1400])
                    for i in range(count)]
        kr._indexes.clear()
        started = time.perf_counter()
        docs, _, _ = kr._index(articles, kr.LocalModels(), False)
        build = time.perf_counter() - started
        kr._indexes.clear()
        started = time.perf_counter()
        restored, _, _ = kr._index(articles, kr.LocalModels(), False)
        restore = time.perf_counter() - started
        assert len(restored) == len(docs) == count * 2
        durations = []
        for _ in range(5):
            started = time.perf_counter()
            result = kr.retrieve_knowledge('如何安排生活费和必要开支', articles, mode='bm25')
            durations.append((time.perf_counter() - started) * 1000)
            assert result['sources']
        results.append(dict(articles=count, passages=len(docs), build_seconds=round(build, 3),
                            restore_seconds=round(restore, 3), query_median_ms=round(statistics.median(durations), 1),
                            database_bytes=index_statistics()['database_bytes']))
report = dict(scope='synthetic single-process BM25 only; five serial queries; no semantic model or concurrency benchmark',
              results=results)
(directory / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
print('Report:', directory / 'result.json')

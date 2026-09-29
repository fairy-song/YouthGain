import json
from collections import Counter
from pathlib import Path
from flask import Flask
from app.routes import knowledge_routes


def test_starter_content_complete():
    articles = json.loads((Path(__file__).parents[1] / 'content/knowledge_starter.json').read_text(encoding='utf-8'))
    assert len(articles) == 24
    assert len({a['title'] for a in articles}) == 24
    assert set(Counter(a['category'] for a in articles).values()) == {4}
    for article in articles:
        for section in ('适用人群', '## 先理解', '## 生活情境', '## 今天做一件事', '## 想一想', '## 参考答案', '## 资料来源', 'https://'):
            assert section in article['content']


def test_public_read_only_catalogue(monkeypatch):
    app = Flask(__name__)
    app.register_blueprint(knowledge_routes.knowledge_bp, url_prefix='/api/knowledge')
    monkeypatch.setattr(knowledge_routes, 'list_kb_articles', lambda: ([{'id': 'one', 'title': 'Published', 'private': 'secret'}], None))
    api = app.test_client()
    result = api.get('/api/knowledge')
    assert result.status_code == 200
    assert result.json['articles'][0]['title'] == 'Published'
    assert 'private' not in result.json['articles'][0]
    assert api.post('/api/knowledge', json={}).status_code == 405
    monkeypatch.setattr(knowledge_routes, 'list_kb_articles', lambda: ([], 'database secret'))
    assert api.get('/api/knowledge').status_code == 503
    assert b'database secret' not in api.get('/api/knowledge').data

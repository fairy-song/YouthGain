"""Public read-only knowledge catalogue; mutations remain admin-only."""
from flask import Blueprint, jsonify
from app.services.admin_service import list_kb_articles

knowledge_bp = Blueprint('knowledge_bp', __name__)

@knowledge_bp.route('', methods=['GET'])
def catalogue():
    articles, error = list_kb_articles()
    if error:
        return jsonify({'error': '知识库暂时不可用，请稍后重试'}), 503
    fields = ('id', 'title', 'summary', 'content', 'category', 'tags', 'readTime', 'date')
    return jsonify({'articles': [{key: article.get(key) for key in fields} for article in articles]})

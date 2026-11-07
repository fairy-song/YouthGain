"""Public read-only knowledge catalogue; mutations remain admin-only."""
from flask import Blueprint, jsonify, request
from app.services.admin_service import list_kb_articles

knowledge_bp = Blueprint('knowledge_bp', __name__)

@knowledge_bp.route('', methods=['GET'])
def catalogue():
    articles, error = list_kb_articles()
    if error:
        return jsonify({'error': '知识库暂时不可用，请稍后重试'}), 503
    from app.services.knowledge_capacity import corpus_digest
    snapshot = corpus_digest(articles)
    if request.args.get('snapshot') and request.args['snapshot'] != snapshot:
        return jsonify(error='知识库已更新，请重新加载'), 409
    try:
        offset = int(request.args.get('offset', 0))
        limit = int(request.args.get('limit', 200))
        if offset < 0 or not 1 <= limit <= 200:
            raise ValueError()
    except ValueError:
        return jsonify(error='分页参数无效'), 400
    total = len(articles)
    fields = ('id', 'title', 'summary', 'content', 'category', 'tags', 'readTime', 'date', 'source_url', 'source_name', 'checked_at', 'region', 'version')
    return jsonify({'articles': [{key: article.get(key) for key in fields} for article in articles[offset:offset+limit]],
                    'total': total, 'snapshot': snapshot,
                    'next_offset': offset+limit if offset+limit < total else None})

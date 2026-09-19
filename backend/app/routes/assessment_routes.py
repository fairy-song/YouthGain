from flask import Blueprint, request, jsonify
import logging

from app.services.auth_service import require_auth

logger = logging.getLogger('assessment_routes')

assessment_bp = Blueprint('assessment_bp', __name__)


def _get_user_data_service():
    """Lazy-load user_data_service to avoid Python 3.14 metaclass issue at import time."""
    from app.services.user_data_service import user_data_service
    return user_data_service


@assessment_bp.route('/submit', methods=['POST'])
@require_auth
def submit_assessment(user_info):
    """
    提交财务心智评估结果，支持多维度评分和详细分析
    """
    data = request.get_json()
    assessment_data = data.get('assessment') if data else None

    if not assessment_data:
        return jsonify({"error": "评估数据不能为空"}), 400

    required_fields = ['answers', 'scores']
    missing_fields = [field for field in required_fields if field not in assessment_data]

    if missing_fields:
        return jsonify({
            "error": f"缺少必需字段: {', '.join(missing_fields)}"
        }), 400

    user_id = user_info['uid']

    scores = assessment_data.get('scores', {})
    total_score = sum(scores.values()) / len(scores) if scores else 0

    # Build complete assessment with percentage scores for history display
    category_scores_pct = assessment_data.get('categoryScores', {})

    complete_assessment = {
        'answers': assessment_data['answers'],
        'scores': scores,
        'total_score': total_score,
        'total_score_percentage': round(total_score, 1),
        'category_scores_percentage': category_scores_pct,
        'categories': assessment_data.get('categories', {}),
        'recommendations': _generate_recommendations(scores),
        'completed': True
    }

    try:
        uds = _get_user_data_service()
        success, message = uds.save_user_data(user_id, 'assessments', complete_assessment)
    except Exception as e:
        logger.error(f"save_user_data failed: {e}")
        return jsonify({"error": f"保存失败: {str(e)}"}), 500

    if not success:
        return jsonify({"error": message}), 500

    # Also save to legacy firestore service for compatibility (lazy import, non-critical)
    try:
        from app.services.firestore_service import save_assessment_results
        save_assessment_results(user_id, complete_assessment)
    except Exception:
        pass

    return jsonify({
        "message": "评估提交成功",
        "assessment": complete_assessment,
        "total_score": total_score
    }), 200


@assessment_bp.route('/results', methods=['GET'])
@require_auth
def get_results(user_info):
    """
    Retrieve the latest assessment result for the current user.
    """
    user_id = user_info['uid']

    try:
        from app.services.firestore_service import get_assessment_results
        results, error = get_assessment_results(user_id)
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve assessment results: {str(e)}"}), 500

    if error:
        return jsonify({"error": f"Failed to retrieve assessment results: {error}"}), 500

    if not results:
        return jsonify({"error": "No assessment results found"}), 404

    return jsonify({"results": results}), 200


@assessment_bp.route('/history', methods=['GET'])
@require_auth
def get_history(user_info):
    """
    Retrieve all historical assessment records for the current user,
    ordered by time (newest first). Used by the frontend history view.
    """
    user_id = user_info['uid']
    limit = min(int(request.args.get('limit', 50)), 100)

    try:
        uds = _get_user_data_service()
        data_list, error = uds.get_user_data(user_id, 'assessments', limit=limit)
    except Exception as e:
        logger.error(f"get_user_data failed: {e}")
        return jsonify({"error": f"获取历史记录失败: {str(e)}"}), 500

    if error:
        return jsonify({"error": f"获取历史记录失败: {error}"}), 500

    # Normalize records
    history = []
    for record in data_list:
        history.append({
            'id': record.get('id', ''),
            'timestamp': record.get('timestamp', ''),
            'total_score_percentage': record.get('total_score_percentage', record.get('total_score', 0)),
            'category_scores_percentage': record.get('category_scores_percentage', {}),
            'recommendations': record.get('recommendations', []),
            'completed': record.get('completed', True),
        })

    # Sort newest first
    history.sort(key=lambda x: x.get('timestamp', ''), reverse=True)

    return jsonify({"history": history, "total": len(history)}), 200


@assessment_bp.route('/latest', methods=['GET'])
@require_auth
def get_latest(user_info):
    """
    Retrieve the most recent assessment record for the current user.
    """
    user_id = user_info['uid']

    try:
        uds = _get_user_data_service()
        data, error = uds.get_latest_data(user_id, 'assessments')
    except Exception as e:
        logger.error(f"get_latest_data failed: {e}")
        return jsonify({"error": f"获取最新评估失败: {str(e)}"}), 500

    if error:
        return jsonify({"error": f"获取最新评估失败: {error}"}), 500

    if not data:
        return jsonify({"assessment": None}), 200

    return jsonify({"assessment": data}), 200


def _generate_recommendations(scores):
    """Generate simple recommendations based on category scores."""
    recommendations = []
    category_thresholds = {
        'savings': '增加储蓄比例：尝试使用50/30/20法则，将20%收入用于储蓄。',
        'emergency': '建立应急基金：目标覆盖3-6个月基本生活支出。',
        'debt': '管理债务：优先偿还高息债务，考虑债务合并降低利率。',
        'knowledge': '增加财务知识：阅读财经书籍，参加理财课程。',
        'tracking': '追踪收支：使用预算应用详细记录收入和支出。',
        'insurance': '完善保险计划：确保有足够的健康险和意外险保障。',
        'risk': '优化风险管理：根据自身情况配置合适的风险资产比例。',
        'income': '稳定收入：探索多元化收入来源，降低收入波动风险。',
        'goals': '设定财务目标：制定具体可行的短中长期财务目标。',
        'pressure': '提升应对能力：建立完善的财务缓冲机制。',
    }
    for category, advice in category_thresholds.items():
        score = scores.get(category, 4)
        if score < 3:
            recommendations.append(advice)

    if not recommendations:
        recommendations.append('继续保持良好的财务习惯，定期审视您的财务目标和计划。')

    return recommendations
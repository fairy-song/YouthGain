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

    answers = assessment_data.get('answers')
    if not isinstance(answers, dict) or len(answers) != 8:
        return jsonify(error='请完成八个自我探索问题'), 400
    groups = {'budget': [], 'choice': [], 'buffer': [], 'risk': []}
    expected = ['budget', 'budget', 'choice', 'choice', 'buffer', 'buffer', 'risk', 'risk']
    for index, category in enumerate(expected, 1):
        answer = answers.get(str(index))
        if not isinstance(answer, dict) or answer.get('category') != category:
            return jsonify(error='问题与主题不匹配'), 400
        score = answer.get('score')
        if type(score) is not int or score not in (1, 2, 3, 4):
            return jsonify(error='自评选项无效'), 400
        groups[category].append(score)
    scores = {category: sum(values) / len(values) for category, values in groups.items()}
    total_score = sum(scores.values()) / len(scores)
    category_scores_pct = {category: round(score * 25, 1) for category, score in scores.items()}

    complete_assessment = {
        'answers': assessment_data['answers'],
        'scores': scores,
        'total_score': total_score,
        'total_score_percentage': round(total_score * 25, 1),
        'category_scores_percentage': category_scores_pct,
        'categories': {'version': 2},
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
            'version': (record.get('categories') or {}).get('version', 1),
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
    practices = {
        'budget': '安排收支：列出一项必要开支、一项想要的体验和一项未来安排。',
        'choice': '理解取舍：比较一次消费的两个选择，写下自己的理由。',
        'buffer': '留有余地：写下一笔可能被忽略的开支和一个准备办法。',
        'risk': '理解风险：面对一个回报承诺，列出需要核实的三个问题。',
    }
    return [practices[key] for key in sorted(practices, key=lambda key: scores.get(key, 0))[:2]]

# -*- coding: utf-8 -*-
"""语音识别路由：把前端录音的 PCM 音频交给讯飞，返回中文文本。

POST /api/asr/transcribe
  body: { "audio_b64": "<16k 16bit 单声道 PCM 的 base64>" }
  resp: { "status": "success", "data": { "text": "昨天下午在蜜雪冰城..." } }
"""

import base64

from flask import Blueprint, request, jsonify

from app.services.xfyun_asr import transcribe_pcm, XfyunASRError

asr_bp = Blueprint("asr", __name__)


@asr_bp.route("/transcribe", methods=["POST"])
def transcribe():
    """语音转文字：接收 PCM(base64)，返回识别文本。"""
    body = request.get_json(silent=True) or {}
    audio_b64 = body.get("audio_b64", "")

    if not audio_b64:
        return jsonify({"status": "error", "message": "缺少音频数据 audio_b64"}), 400

    try:
        pcm = base64.b64decode(audio_b64)
    except Exception:
        return jsonify({"status": "error", "message": "音频 base64 解码失败"}), 400

    if not pcm:
        return jsonify({"status": "error", "message": "音频内容为空"}), 400

    try:
        text = transcribe_pcm(pcm)
    except XfyunASRError as e:
        # 密钥缺失/超时/讯飞业务错误：给用户可读提示
        return jsonify({"status": "error", "message": str(e)}), 502
    except Exception as e:
        return jsonify({"status": "error", "message": "语音识别失败: {}".format(e)}), 502

    if not text:
        return jsonify({
            "status": "error",
            "message": "没有识别到语音内容，请靠近麦克风、放慢语速再试",
        }), 422

    return jsonify({"status": "success", "data": {"text": text}})

# -*- coding: utf-8 -*-
"""讯飞语音听写(WebAPI v2)客户端。

把 16kHz / 16bit / 单声道 PCM 音频发往讯飞云，返回识别文本。

协议要点(讯飞官方文档: 语音听写 WebAPI)：
1. 鉴权：HMAC-SHA256 对 "host/date/request-line" 签名，拼进 wss URL；
2. 数据：WebSocket 分帧发送，每帧 base64 音频，status 0=首帧 / 1=中间 / 2=末帧；
3. 结果：服务端逐帧返回 code 与 result.ws[].cw[].w(词)，末帧 status=2 时结束。

依赖：websocket-client。正常情况走 requirements.txt 的 pip 安装；
若本机 site-packages 无写权限，也可用 --target 装在 backend/vendor_pkgs，
下面的 sys.path 兜底会优先命中它。两条路互不冲突。
"""

import base64
import hashlib
import hmac
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode

# ---- websocket-client 的本地兜底路径 ----
# 优先用 pip 安装的版本；只有 vendor 目录存在时才插到 sys.path 最前，
# 兼容「site-packages 无写权限」的机器。
_VENDOR = Path(__file__).resolve().parent.parent.parent / "vendor_pkgs"
if _VENDOR.exists() and str(_VENDOR) not in sys.path:
    sys.path.insert(0, str(_VENDOR))

import websocket  # noqa: E402  必须在 sys.path 调整之后导入

# 讯飞语音听写服务端点
HOST = "iat-api.xfyun.cn"
PATH = "/v2/iat"

# 每帧最大音频字节数(讯飞限制单帧 base64 后约 10.7KB，取 8000 字节 PCM 安全)
FRAME_PCM_BYTES = 8000
# 60 秒上限：16000 采样率 * 2 字节 * 60 秒
MAX_PCM_BYTES = 60 * 16000 * 2


class XfyunASRError(Exception):
    """讯飞语音听写调用错误(带用户可读信息)。"""


def build_auth_url(api_key: str, api_secret: str) -> str:
    """构造带鉴权参数的 wss URL(讯飞 v2 签名协议)。"""
    # date 必须是 RFC1123 格式的 GMT 时间
    date = datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S GMT")
    # 签名原文：三行(host / date / request-line)
    signature_origin = "host: {host}\ndate: {date}\nGET {path} HTTP/1.1".format(
        host=HOST, date=date, path=PATH
    )
    signature = base64.b64encode(
        hmac.new(api_secret.encode("utf-8"), signature_origin.encode("utf-8"),
                 hashlib.sha256).digest()
    ).decode("utf-8")
    # authorization 头的内容，再整体 base64 作为 URL 参数
    authorization_origin = (
        'api_key="{key}", algorithm="hmac-sha256", '
        'headers="host date request-line", signature="{sig}"'
    ).format(key=api_key, sig=signature)
    authorization = base64.b64encode(authorization_origin.encode("utf-8")).decode("utf-8")
    return "wss://{host}{path}?{query}".format(
        host=HOST, path=PATH,
        query=urlencode({"authorization": authorization, "date": date, "host": HOST}),
    )


def _read_config() -> tuple:
    """读取讯飞密钥；缺失时抛出带指引的错误。"""
    app_id = os.environ.get("XFYUN_APP_ID", "").strip()
    api_key = os.environ.get("XFYUN_API_KEY", "").strip()
    api_secret = os.environ.get("XFYUN_API_SECRET", "").strip()
    if not (app_id and api_key and api_secret):
        raise XfyunASRError(
            "讯飞密钥未配置：请在 .env.local 填写 XFYUN_APP_ID / XFYUN_API_KEY / XFYUN_API_SECRET"
        )
    return app_id, api_key, api_secret


def transcribe_pcm(pcm_bytes: bytes) -> str:
    """把 16k/16bit/单声道 PCM 发往讯飞，返回识别文本(可能为空串)。"""
    app_id, api_key, api_secret = _read_config()

    if not pcm_bytes:
        raise XfyunASRError("音频内容为空")
    if len(pcm_bytes) > MAX_PCM_BYTES:
        raise XfyunASRError("音频超过 60 秒上限，请缩短录音后再试")

    url = build_auth_url(api_key, api_secret)
    ws = websocket.create_connection(url, timeout=60)
    try:
        texts = []
        total = len(pcm_bytes)
        offset = 0
        frame_index = 0

        # ---- 分帧发送(首帧带 common/business 配置) ----
        while offset < total:
            chunk = pcm_bytes[offset:offset + FRAME_PCM_BYTES]
            offset += len(chunk)

            if frame_index == 0 and offset < total:
                status = 0          # 首帧(后面还有数据)
            elif offset < total:
                status = 1          # 中间帧
            else:
                status = 2          # 末帧(首帧即末帧也走这里)

            frame = {
                "common": {"app_id": app_id},
                "business": {
                    "language": "zh_cn",
                    "domain": "iat",
                    "accent": "mandarin",
                    "vad_eos": 10000,   # 静音 10 秒自动断句
                },
                "data": {
                    "status": status,
                    "format": "audio/L16;rate=16000",
                    "encoding": "raw",
                    "audio": base64.b64encode(chunk).decode("utf-8"),
                },
            }
            ws.send(json.dumps(frame))
            frame_index += 1

        # ---- 接收识别结果，直到最终帧 ----
        while True:
            resp = json.loads(ws.recv())
            code = resp.get("code", -1)
            if code != 0:
                raise XfyunASRError("讯飞返回错误 code={code}: {msg}".format(
                    code=code, msg=resp.get("message", "")
                ))
            data = resp.get("data", {})
            result = data.get("result")
            if result:
                for ws_item in result.get("ws", []):
                    for cw in ws_item.get("cw", []):
                        texts.append(cw.get("w", ""))
            if data.get("status") == 2:
                break

        return "".join(texts).strip()
    finally:
        try:
            ws.close()
        except Exception:
            pass

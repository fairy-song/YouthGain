"""Optional internal HSTU service; the application can also infer in-process."""
import hmac
import os
from pathlib import Path
from flask import Flask, jsonify, request
from dotenv import load_dotenv
from app.services.hstu_runtime import predict

ROOT = Path(__file__).resolve().parents[1]


def create_app():
    load_dotenv(ROOT / '.env.local')
    app = Flask(__name__)
    app.config['MAX_CONTENT_LENGTH'] = 512 * 1024

    @app.post('/rank')
    def rank():
        key = os.environ.get('PODCAST_HSTU_API_KEY')
        if not key or not hmac.compare_digest(request.headers.get('Authorization', ''), 'Bearer '+key):
            return jsonify(error='unauthorized'), 401
        try:
            configured = Path(os.environ.get('PODCAST_HSTU_MODEL_PATH') or 'models/hstu/model.pt')
            configured = configured if configured.is_absolute() else ROOT / configured
            environment = (os.environ.get('APP_ENV') or os.environ.get('FLASK_ENV') or 'development').strip().lower()
            return jsonify(predict(request.get_json(silent=True), configured,
                                   allow_demo=os.environ.get('PODCAST_HSTU_ALLOW_DEMO', 'false').lower() == 'true',
                                   production=environment == 'production'))
        except (ValueError, TypeError, KeyError, OSError):
            return jsonify(error='invalid_payload_or_model_unavailable'), 503
    return app


if __name__ == '__main__':
    create_app().run(host='127.0.0.1', port=5051, debug=False)

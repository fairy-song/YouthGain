import os
from flask import Flask
from flask_cors import CORS


def create_app():
    """创建并配置 Flask 应用。

    初始化过程中的任何失败都应直接抛出，不做静默降级——
    否则服务会在"看似启动成功"的状态下失去全部功能。
    """
    app = Flask(__name__)

    # 跨域资源共享配置
    allowed_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://xiaocow666.github.io",  # GitHub Pages
    ]
    extra_origins = os.environ.get('CORS_ALLOWED_ORIGINS', '')
    if extra_origins:
        allowed_origins.extend(o.strip() for o in extra_origins.split(',') if o.strip())

    CORS(app, resources={
        r"/api/*": {
            "origins": allowed_origins,
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True,
        }
    })

    # 加载配置
    from .config import Config
    app.config.from_object(Config)

    # 初始化 MySQL（当 DB_TYPE=mysql 时）
    if app.config.get('DB_TYPE') == 'mysql':
        from .utils.db_mysql import MySQLHelper
        MySQLHelper.init_database()

    # 注册蓝图
    from .routes.coach_routes import coach_bp
    from .routes.dashboard_routes import dashboard_bp
    from .routes.assessment_routes import assessment_bp
    from .routes.decision_routes import decision_bp

    app.register_blueprint(coach_bp, url_prefix='/api/coach')
    app.register_blueprint(dashboard_bp, url_prefix='/api/dashboard')
    app.register_blueprint(assessment_bp, url_prefix='/api/assessment')
    app.register_blueprint(decision_bp, url_prefix='/api/decision')

    @app.route('/api/health', methods=['GET'])
    def health_check():
        return {"status": "healthy", "message": "API服务正常运行中"}, 200

    @app.route('/')
    def index():
        return {"message": "欢迎使用青盈 YouthGain API"}, 200

    return app

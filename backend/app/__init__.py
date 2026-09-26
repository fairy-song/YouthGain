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
        "https://fairy-song.github.io",  # GitHub Pages
    ]
    extra_origins = os.environ.get('CORS_ALLOWED_ORIGINS', '')
    if extra_origins:
        allowed_origins.extend(o.strip() for o in extra_origins.split(',') if o.strip())

    CORS(app, resources={
        r"/api/*": {
            "origins": allowed_origins,
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "X-Dev-Email"],
            "supports_credentials": True,
        }
    })

    # 加载配置
    from .config import Config
    app.config.from_object(Config)

    # 初始化 MySQL（当 DB_TYPE=mysql 时）
    if app.config.get('DB_TYPE') == 'mysql':
        from .utils.db_mysql import MySQLHelper
        if not MySQLHelper.init_database():
            raise RuntimeError('数据库初始化或迁移失败，请检查数据库连接与权限')

    # Initialize the configured Firebase backend before authenticated requests.
    if app.config.get('DB_TYPE') == 'firestore' or app.config.get('FIREBASE_ADMIN_SDK_PATH'):
        import firebase_admin
        from firebase_admin import credentials, firestore
        try:
            firebase_app = firebase_admin.get_app()
        except ValueError:
            credential_path = app.config.get('FIREBASE_ADMIN_SDK_PATH')
            credential = credentials.Certificate(credential_path) if credential_path else credentials.ApplicationDefault()
            firebase_app = firebase_admin.initialize_app(credential)
        if app.config.get('DB_TYPE') == 'firestore':
            app.db = firestore.client(app=firebase_app)

    # 注册蓝图
    from .routes.auth_routes import auth_bp
    from .routes.coach_routes import coach_bp
    from .routes.dashboard_routes import dashboard_bp
    from .routes.assessment_routes import assessment_bp
    from .routes.decision_routes import decision_bp
    from .routes.asr_routes import asr_bp
    from .routes.learning_routes import learning_bp
    from .routes.admin_routes import admin_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(coach_bp, url_prefix='/api/coach')
    app.register_blueprint(dashboard_bp, url_prefix='/api/dashboard')
    app.register_blueprint(assessment_bp, url_prefix='/api/assessment')
    app.register_blueprint(decision_bp, url_prefix='/api/decision')
    app.register_blueprint(asr_bp, url_prefix='/api/asr')
    app.register_blueprint(learning_bp, url_prefix='/api/learning')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')

    @app.route('/api/health', methods=['GET'])
    def health_check():
        return {"status": "healthy", "message": "API服务正常运行中"}, 200

    @app.route('/')
    def index():
        return {"message": "欢迎使用青盈 YouthGain API"}, 200

    return app

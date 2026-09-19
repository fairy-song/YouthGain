import os

class Config:
    # 安全密钥 - 优先从环境变量读取，未设置时使用开发用默认值
    SECRET_KEY = os.environ.get('SECRET_KEY', 'youthgain-dev-secret-key-change-in-production')

    # Google Gemini API密钥 - 可选，不使用 Gemini 时无需设置
    GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')

    # 智谱AI API密钥 - 优先从环境变量读取，未设置时打印警告
    ZHIPUAI_API_KEY = os.environ.get('ZHIPUAI_API_KEY')
    if not ZHIPUAI_API_KEY:
        print("警告: ZHIPUAI_API_KEY 环境变量未设置，AI教练功能可能不可用")

    # Firebase Admin SDK 配置文件路径
    FIREBASE_ADMIN_SDK_PATH = os.environ.get('FIREBASE_ADMIN_SDK_PATH')

    # 运行环境标识: development / production
    # 当值为 production 时，DEV_MODE 认证绕过会自动失效
    APP_ENV = os.environ.get('APP_ENV') or os.environ.get('FLASK_ENV') or 'development'

    # 开发模式认证绕过 - 仅限本地开发，详见 services/auth_service.is_dev_bypass_enabled()
    DEV_MODE = os.environ.get('DEV_MODE', 'false').lower() == 'true'

    # 数据库类型: memory (内存开发模式), mysql (MySQL 数据库模式), firestore (Firebase Firestore 模式)
    # 本地调试默认若配置了 DB_TYPE 为 mysql，则启用 MySQL
    DB_TYPE = os.environ.get('DB_TYPE', 'memory')
    
    # MySQL 数据库配置
    MYSQL_HOST = os.environ.get('MYSQL_HOST', '127.0.0.1')
    MYSQL_PORT = int(os.environ.get('MYSQL_PORT', 3306))
    MYSQL_USER = os.environ.get('MYSQL_USER', 'root')
    MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD', '')
    MYSQL_DB = os.environ.get('MYSQL_DB', 'youthgain')
import os
from pathlib import Path

MODEL_ROOT = Path(__file__).resolve().parents[2] / 'models'

def model_path(name, default):
    value = os.environ.get(name) or str(default)
    path = Path(value)
    return str(path if path.is_absolute() else MODEL_ROOT.parent / path)

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

    # 管理员邮箱列表（逗号分隔）。登录后邮箱命中该列表的用户自动拥有管理员角色，
    # 可访问 /api/admin/* 管理接口。本地开发模式同样按邮箱列表校验管理员身份。
    ADMIN_EMAILS = [e.strip().lower() for e in os.environ.get('ADMIN_EMAILS', '').split(',') if e.strip()]

    # 数据库类型: memory (内存开发模式), mysql (MySQL 数据库模式), firestore (Firebase Firestore 模式)
    # 本地调试默认若配置了 DB_TYPE 为 mysql，则启用 MySQL
    DB_TYPE = os.environ.get('DB_TYPE', 'memory')
    # Research registry is a separate, durable, single-host transactional ledger.
    RESEARCH_DB_PATH = os.environ.get('RESEARCH_DB_PATH')
    RESEARCH_LIVE_ENABLED = os.environ.get('RESEARCH_LIVE_ENABLED', 'false').lower() == 'true'
    RESEARCH_GLOBAL_EPSILON_MILLI = int(os.environ.get('RESEARCH_GLOBAL_EPSILON_MILLI', '6000'))
    PODCAST_DB_PATH = os.environ.get('PODCAST_DB_PATH')
    PODCAST_RSS_ALLOWED_HOSTS = os.environ.get('PODCAST_RSS_ALLOWED_HOSTS', '')
    PODCAST_STARTER_CATALOG_ENABLED = os.environ.get('PODCAST_STARTER_CATALOG_ENABLED', 'true').lower() == 'true'
    PODCAST_RANKER_MODE = os.environ.get('PODCAST_RANKER_MODE', 'local_hstu')
    PODCAST_HSTU_URL = os.environ.get('PODCAST_HSTU_URL')
    PODCAST_HSTU_API_KEY = os.environ.get('PODCAST_HSTU_API_KEY')
    PODCAST_HSTU_TIMEOUT_SECONDS = os.environ.get('PODCAST_HSTU_TIMEOUT_SECONDS', '2')
    PODCAST_HSTU_MODEL_PATH = model_path('PODCAST_HSTU_MODEL_PATH', MODEL_ROOT / 'hstu/model.pt')
    PODCAST_HSTU_ALLOW_DEMO = os.environ.get('PODCAST_HSTU_ALLOW_DEMO', 'false').lower() == 'true'
    COACH_RETRIEVAL_MODE = os.environ.get('COACH_RETRIEVAL_MODE', 'hybrid')
    COACH_EMBEDDING_PATH = model_path('COACH_EMBEDDING_PATH', MODEL_ROOT / 'coach/embedding')
    COACH_RERANKER_PATH = model_path('COACH_RERANKER_PATH', MODEL_ROOT / 'coach/reranker')
    COACH_SEMANTIC_MIN_SCORE = os.environ.get('COACH_SEMANTIC_MIN_SCORE', '0.45')
    COACH_RERANK_MIN_LOGIT = os.environ.get('COACH_RERANK_MIN_LOGIT', '-5')
    
    # MySQL 数据库配置
    MYSQL_HOST = os.environ.get('MYSQL_HOST', '127.0.0.1')
    MYSQL_PORT = int(os.environ.get('MYSQL_PORT', 3306))
    MYSQL_USER = os.environ.get('MYSQL_USER', 'root')
    MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD', '')
    MYSQL_DB = os.environ.get('MYSQL_DB', 'youthgain')

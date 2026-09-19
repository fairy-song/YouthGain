import os
import sys
from pathlib import Path
import logging
import threading
import time

# 设置控制台编码为UTF-8
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

print("=== 青盈后端服务启动 (增强版) ===")

# 设置全局状态标识
MODEL_INITIALIZED = False
MODEL_READY_EVENT = threading.Event()

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('youthgain-backend')
logger.info("正在启动后端服务...")

# 添加项目根目录到系统路径
try:
    current_dir = Path(__file__).parent
    project_root = current_dir.parent
    sys.path.insert(0, str(project_root))
    print(f"[OK] 系统路径设置成功")
    logger.info(f"系统路径: {sys.path}")
except Exception as e:
    print(f"✕ 设置路径出错: {e}")
    logger.error(f"设置路径出错: {e}", exc_info=True)

# 加载环境变量
# 优先 .env.local（与 README 和 快速启动.cmd 保持一致），回退到 .env
from dotenv import load_dotenv
env_path = project_root / '.env.local'
if not env_path.exists():
    env_path = project_root / '.env'
if env_path.exists():
    load_dotenv(env_path)
    logger.info(f"成功加载环境变量文件: {env_path}")
else:
    logger.warning(f"未找到 .env.local 或 .env，将使用默认配置: {project_root}")

# 开发启动器默认开启认证绕过。注意：本文件仅供本地开发使用，
# 部署请改用 run.py，并在 .env.local 中保持 DEV_MODE=false。
os.environ.setdefault("DEV_MODE", "true")
# 增加新环境变量，强制立即初始化模型
os.environ["INITIALIZE_MODEL_ON_START"] = "true"
# 禁用自动加载.env文件，避免编码问题
os.environ["FLASK_SKIP_DOTENV"] = "1"
logger.info("环境变量设置完成")

def monitor_model_initialization():
    """监控模型初始化状态的线程函数"""
    global MODEL_INITIALIZED
    
    print("⟳ 正在初始化AI模型...")
    loading_chars = "|/-\\"
    i = 0
    
    # 最长等待5分钟
    for _ in range(300):
        if MODEL_INITIALIZED:
            print("\r[OK] AI模型初始化完成!                 ")
            MODEL_READY_EVENT.set()
            return
            
        print(f"\r⟳ 正在初始化AI模型...{loading_chars[i % len(loading_chars)]}", end="", flush=True)
        i += 1
        time.sleep(1)
        
    print("\r! AI模型初始化超时，可能会影响服务质量")
    # 即使超时也设置事件，避免永久阻塞
    MODEL_READY_EVENT.set()

# 启动模型初始化监视线程
init_thread = threading.Thread(target=monitor_model_initialization, daemon=True)
init_thread.start()

def patch_app_routes(app):
    """修补应用路由，确保API响应是实际的而非测试消息"""
    from flask import jsonify
    
    # 不再修补路由，直接返回应用
    # 之前的修补逻辑有闭包问题，导致所有路由都指向同一个函数
    logger.info("跳过路由修补，使用原始路由")
    return app

# 导入和创建应用
try:
    # 方式1: 标准导入方式
    logger.info("尝试标准导入方式...")
    from backend.app import create_app
    print("[OK] 应用模块导入成功")
    logger.info("应用模块导入成功")

    # 创建应用实例
    logger.info("正在创建应用实例...")
    app = create_app()
    
    # 应用路由补丁
    app = patch_app_routes(app)

    print("[OK] 应用实例创建成功")
    logger.info("应用实例创建成功")
    print("[OK] 开发模式已启用")
    print("[OK] 使用智谱AI GLM-4模型")
    print(f"[OK] API地址: http://localhost:5001")
    logger.info(f"API地址: http://0.0.0.0:5001")
    
    # 标记模型已初始化
    MODEL_INITIALIZED = True
    
    # 开发模式使用Flask内置服务器
    # 使用0.0.0.0作为主机，允许从外部访问
    logger.info("启动Flask服务器...")
    # 禁用自动加载.env，避免编码问题
    app.run(debug=True, port=5001, host='0.0.0.0', threaded=True, load_dotenv=False, use_reloader=False)
    
except ImportError as e:
    print(f"✕ 导入错误: {e}")
    logger.error(f"导入错误: {e}", exc_info=True)
    print("尝试备用导入方式...")
    logger.info("尝试备用导入方式...")
    
    try:
        # 方式2: 直接导入
        logger.info("添加当前目录到sys.path...")
        sys.path.append(str(current_dir))
        logger.info("尝试从app导入create_app...")
        from app import create_app
        logger.info("创建应用实例...")
        app = create_app()
        
        # 应用路由补丁
        app = patch_app_routes(app)
        
        print("[OK] 备用导入成功")
        logger.info("备用导入成功")
        
        # 标记模型已初始化
        MODEL_INITIALIZED = True
        
        logger.info("启动Flask服务器(备用方式)...")
        # 禁用自动加载.env，避免编码问题
        app.run(debug=True, port=5001, host='0.0.0.0', threaded=True, load_dotenv=False, use_reloader=False)
    except Exception as e:
        print(f"✕ 启动失败: {e}")
        logger.critical(f"启动失败: {e}", exc_info=True)
        print("\n请检查项目结构是否正确。")
        sys.exit(1) 
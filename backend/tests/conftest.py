"""pytest 配置：把 backend 目录加入模块搜索路径，使 `from app...` 可用。"""

import os
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

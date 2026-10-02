"""Keep one local memory-backed server per project; release automatically on exit."""
import os
from pathlib import Path


def acquire_server_lock(path):
    path = Path(path)
    handle = path.open('a+b')
    if path.stat().st_size == 0:
        handle.write(b'0')
        handle.flush()
    handle.seek(0)
    try:
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as error:
        handle.close()
        raise RuntimeError('本项目后端已在运行，请使用现有服务，勿重复启动。') from error
    return handle

import subprocess
import sys
from pathlib import Path
from local_server_lock import acquire_server_lock


def test_duplicate_process_is_rejected_and_lock_releases_on_close(tmp_path):
    path = tmp_path / 'backend.lock'
    handle = acquire_server_lock(path)
    child = [sys.executable, '-c',
             'import sys; from local_server_lock import acquire_server_lock; '
             'handle = acquire_server_lock(sys.argv[1])', str(path)]
    try:
        result = subprocess.run(child, cwd=Path(__file__).parents[1], capture_output=True, timeout=10)
        assert result.returncode != 0
        assert 'RuntimeError' in result.stderr.decode(errors='replace')
    finally:
        handle.close()
    result = subprocess.run(child, cwd=Path(__file__).parents[1], capture_output=True, timeout=10)
    assert result.returncode == 0, result.stderr

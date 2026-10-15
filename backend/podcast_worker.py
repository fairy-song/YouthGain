"""Usage: python backend/podcast_worker.py [--once] [--limit 100]."""
import argparse
import logging
import signal
from pathlib import Path
from threading import Event, Thread


def work(app, stopped, once=False, limit=100):
    from app.services import podcast_pipeline as pipeline
    while not stopped.is_set():
        try:
            with app.app_context():
                pipeline.schedule_due()
                for _ in range(limit):
                    if stopped.is_set() or pipeline.run_one() is None:
                        break
        except Exception:
            app.logger.exception('Podcast worker cycle failed')
        if once:
            return
        stopped.wait(15)


def start_local_worker(app):
    """Only the single-process local launcher calls this; WSGI deployments run the CLI worker."""
    if not app.config.get('PODCAST_LOCAL_WORKER_ENABLED', True):
        return
    import atexit
    stopped = Event()
    atexit.register(stopped.set)
    Thread(target=work, args=(app, stopped), daemon=True, name='podcast-worker').start()


if __name__ == '__main__':
    from dotenv import load_dotenv
    root = Path(__file__).resolve().parent.parent
    load_dotenv(root / '.env.local' if (root / '.env.local').exists() else root / '.env')
    from app import create_app
    parser = argparse.ArgumentParser(description='青盈播客增量采集与内容整理工作进程')
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--limit', type=int, default=100)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    stopped = Event()
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    work(create_app(), stopped, args.once, max(1, min(args.limit, 1000)))

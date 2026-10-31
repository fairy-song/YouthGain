"""Run knowledge updates independently: python backend/knowledge_worker.py [--once]."""
import argparse
import signal
from pathlib import Path
from threading import Event


if __name__ == '__main__':
    from dotenv import load_dotenv
    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / '.env.local')
    from app import create_app
    from app.services.knowledge_updates import run_due
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    app = create_app()
    stopped = Event()
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    while not stopped.is_set():
        with app.app_context():
            try:
                run_due()
            except Exception:
                app.logger.exception('Knowledge update cycle failed')
        if args.once:
            break
        stopped.wait(60)

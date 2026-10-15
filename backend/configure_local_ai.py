"""Enable explicitly labelled demo HSTU and provisioned coach models locally."""
from pathlib import Path
import re
from dotenv import dotenv_values


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    env_file = root / '.env.local'
    existing = dotenv_values(env_file)
    if (existing.get('APP_ENV') or existing.get('FLASK_ENV') or 'development').lower() == 'production':
        raise SystemExit('Refusing to enable a demo checkpoint in production.')
    required = [root/'models/coach/embedding/config.json', root/'models/coach/reranker/config.json', root/'models/hstu-demo/model.pt']
    if not all(path.is_file() for path in required):
        raise SystemExit('Provision the coach models and train --demo first.')
    settings = {'COACH_RETRIEVAL_MODE': 'hybrid', 'COACH_EMBEDDING_PATH': 'models/coach/embedding',
                'COACH_RERANKER_PATH': 'models/coach/reranker', 'PODCAST_RANKER_MODE': 'local_hstu',
                'PODCAST_HSTU_MODEL_PATH': 'models/hstu-demo/model.pt', 'PODCAST_HSTU_ALLOW_DEMO': 'true'}
    old = env_file.read_text(encoding='utf-8-sig') if env_file.exists() else ''
    lines = [line for line in old.splitlines() if not any(re.match(r'^\s*(?:export\s+)?'+key+r'\s*=', line) for key in settings)]
    lines.extend(['', '# Local AI upgrade: HSTU demo weights are synthetic, not a validated campus model.'])
    lines.extend(f'{key}={value}' for key, value in settings.items())
    env_file.write_text('\n'.join(lines)+'\n', encoding='utf-8')
    print('Configured local hybrid retrieval and labelled HSTU demo. Existing credentials preserved.')

"""Explicit model provisioning; web requests never download model weights."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path

from huggingface_hub import HfApi, snapshot_download


def provision(repo_id, target):
    revision = HfApi().model_info(repo_id).sha
    snapshot_download(repo_id, revision=revision, local_dir=target,
                      allow_patterns=['*.json', '*.safetensors', 'vocab.txt', '*.model',
                                      'modules.json', '1_Pooling/*', 'README.md'])
    (target / 'youthgain-provenance.json').write_text(json.dumps(
        {'repository': repo_id, 'revision': revision}, indent=2), encoding='utf-8')
    print(f'Ready: {repo_id} @ {revision} -> {target}', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'models/coach')
    args = parser.parse_args()
    models = [('BAAI/bge-small-zh-v1.5', args.output / 'embedding'),
              ('BAAI/bge-reranker-base', args.output / 'reranker')]
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda item: provision(*item), models))

"""Preview a file-scoped rollback; --apply restores only this enhancement.

The manifest is local to this checkout. Later edits cause a refusal, not an overwrite.
Current versions are archived before originals are restored. No database is touched.
"""
import argparse
import hashlib
import json
from datetime import datetime
from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / 'tmp' / 'funds-breakdown-20261028-before'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inside(base, relative):
    path = (base / relative).resolve()
    if not path.is_relative_to(base.resolve()) or Path(relative).is_absolute():
        raise ValueError(f'Path outside intended workspace: {relative}')
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Apply the verified rollback')
    args = parser.parse_args()
    manifest = json.loads((BACKUP / 'rollback-manifest.json').read_text(encoding='utf-8'))
    plan = []
    # Validate every file before mutating any file.
    for entry in manifest:
        target = inside(ROOT, entry['path'])
        original = inside(BACKUP, entry['path'])
        if not target.is_file() or digest(target) != entry['after_sha256']:
            raise ValueError(f'File changed since implementation; keep later edits and review manually: {entry["path"]}')
        if entry['before_sha256'] is not None and (not original.is_file() or digest(original) != entry['before_sha256']):
            raise ValueError(f'Original backup missing or changed: {entry["path"]}')
        plan.append((entry, target, original))
    for entry, _, _ in plan:
        print(('RESTORE ' if entry['before_sha256'] else 'ARCHIVE NEW ') + entry['path'])
    if not args.apply:
        print('Preview only. Re-run with --apply to restore these files.')
        return
    archive = BACKUP / ('rolled-back-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
    for entry, target, original in plan:
        saved = inside(archive, entry['path'])
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, saved)
        if entry['before_sha256']:
            shutil.copy2(original, target)
        else:
            # Exact verified file only; the saved copy remains recoverable.
            target.unlink()
    print(f'Rollback complete. Previous current versions saved to: {archive}')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError) as error:
        raise SystemExit(str(error)) from error

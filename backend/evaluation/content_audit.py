"""Export a read-only, human-review worksheet for the personal learning bank.

This tool never changes a question's review status. A completed worksheet is
evidence for an editor to assess, not an automatic approval mechanism.
"""
import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))

from app.services.adaptive_learning import ITEMS, audit_bank


FIELDS = ('item_id', 'scenario_id', 'step', 'knowledge_point', 'question_type',
          'review_status', 'content_version', 'question', 'options', 'answer',
          'explanation', 'source_note', 'reference', 'reviewed_by', 'reviewed_at',
          'needs_human_review', 'reviewer_decision', 'reviewer_notes')


def worksheet_rows(items=ITEMS):
    audit_bank(items)
    rows = []
    for item in items:
        rows.append({
            'item_id': item['id'], 'scenario_id': item.get('scenario_id', ''),
            'step': item.get('step', 1), 'knowledge_point': item['knowledge_point'],
            'question_type': item.get('type', 'choice'),
            'review_status': item['review_status'], 'content_version': item['content_version'],
            'question': item['question'],
            'options': json.dumps(item.get('options', []), ensure_ascii=False),
            'answer': item.get('answer', ''), 'explanation': item['explanation'],
            'source_note': item['source_note'], 'reference': item.get('reference', ''),
            'reviewed_by': item.get('reviewed_by') or '',
            'reviewed_at': item.get('reviewed_at') or '',
            'needs_human_review': item['review_status'] != 'approved',
            'reviewer_decision': '', 'reviewer_notes': '',
        })
    return rows


def export_csv(path, items=ITEMS, *, overwrite=False):
    rows = worksheet_rows(items)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # A reviewer may have filled the decision columns after export.
    # Require an explicit overwrite to avoid silently deleting that work.
    with path.open('w' if overwrite else 'x', encoding='utf-8-sig', newline='') as output:
        writer = csv.DictWriter(output, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    return {'total': len(rows), 'needs_human_review': sum(row['needs_human_review'] for row in rows),
            'output': str(path)}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv', help='Optional local path for the review worksheet')
    parser.add_argument('--overwrite', action='store_true', help='Replace an existing review worksheet')
    args = parser.parse_args(argv)
    report = export_csv(args.csv, overwrite=args.overwrite) if args.csv else {
        **audit_bank(), 'needs_human_review': sum(item['review_status'] != 'approved' for item in ITEMS)}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

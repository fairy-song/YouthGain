"""Import the starter catalogue through the authenticated admin API.
Uses YOUTHGAIN_TOKEN for real auth, or --dev-email for an explicitly enabled local dev backend.
Existing titles are skipped: reruns do not replace administrator edits.
"""
import argparse
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:5001/api')
    parser.add_argument('--dev-email')
    args = parser.parse_args()
    headers = {'Content-Type': 'application/json'}
    if args.dev_email:
        headers['X-Dev-Email'] = args.dev_email
    if os.environ.get('YOUTHGAIN_TOKEN'):
        headers['Authorization'] = 'Bearer ' + os.environ['YOUTHGAIN_TOKEN']
    def call(path, data=None):
        request = Request(args.url.rstrip('/') + path, headers=headers,
                          data=json.dumps(data).encode('utf-8') if data is not None else None)
        with urlopen(request, timeout=30) as response:
            return json.load(response)
    existing = call('/admin/kb')['data']['articles']
    titles = {a['title'] for a in existing}
    articles = json.loads(Path(__file__).with_name('knowledge_starter.json').read_text(encoding='utf-8'))
    count = 0
    for article in articles:
        if article['title'] in titles:
            continue
        call('/admin/kb', article)
        titles.add(article['title'])
        count += 1
    print(f'Imported {count}; skipped {len(articles) - count}.')


if __name__ == '__main__':
    run()

"""Check repository README resources without network access or extra dependencies."""
from html.parser import HTMLParser
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


class Resources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.ids, self.errors = [], set(), []
        self.disclosures = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.add(attrs['id'])
        if tag == 'img':
            if not attrs.get('alt', '').strip():
                self.errors.append('Image needs meaningful alt text')
            if not attrs.get('src'):
                self.errors.append('Image has no source')
        key = 'src' if tag == 'img' else 'href' if tag == 'a' else None
        if key and attrs.get(key):
            self.links.append(attrs[key])
        if tag == 'details':
            self.disclosures += 1

    def handle_endtag(self, tag):
        if tag == 'details':
            self.disclosures -= 1
            if self.disclosures < 0:
                self.errors.append('Closing details tag has no opening tag')


def main():
    text = (ROOT / 'README.md').read_text(encoding='utf-8')
    # Code examples are not navigation or HTML structure.
    prose = re.sub(r'^```[^\n]*\n.*?^```\s*$', '', text, flags=re.M | re.S)
    resources = Resources()
    resources.feed(prose)
    # Also capture an outer link around a badge, not only its image URL.
    resources.links.extend(re.findall(r'\]\(([^)\s]+)\)', prose))
    for alt, _ in re.findall(r'!\[([^\]]*)\]\(([^)]+)\)', prose):
        if not alt.strip():
            resources.errors.append('Markdown image needs meaningful alt text')
    if resources.disclosures:
        resources.errors.append('Unbalanced details tags')
    for link in set(resources.links):
        parsed = urlsplit(link)
        if parsed.scheme or parsed.netloc:
            continue
        if parsed.path:
            target = (ROOT / unquote(parsed.path)).resolve()
            if not target.is_relative_to(ROOT) or not target.exists():
                resources.errors.append(f'Missing repository resource: {link}')
        elif parsed.fragment and unquote(parsed.fragment) not in resources.ids:
            resources.errors.append(f'Missing explicit navigation anchor: {link}')
    if resources.errors:
        print('\n'.join(sorted(set(resources.errors))))
        return 1
    print(f'README OK: {len(set(resources.links))} unique links; local files, explicit anchors, image alt text and disclosures checked.')
    print('Remote URL availability and visual rendering are not checked.')
    return 0


if __name__ == '__main__':
    sys.exit(main())

#!/usr/bin/env python3
"""Load approved topic descriptions through the author API, without overwriting.

Dry run by default: prints what it would do. With --apply it sends
PUT /api/catalog/topics/{id} with the version it read, so a concurrent edit
returns 409 and is reported instead of lost. Topics that already have a
description are skipped, even if it differs: authors own them after loading.
Uses only catalog endpoints; never touches learner data.

Authenticate in a browser as an author and export the value of the
`ait_dotnet_session` cookie as AITEACHER_SESSION. It is never printed.
"""
import argparse
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = ROOT / 'backend/configuration/topic-descriptions.json'
MAX_LENGTH = 600  # CatalogEndpoints.DescriptionMaxLength
SESSION_COOKIE = 'ait_dotnet_session'


class ApiError(RuntimeError):
    def __init__(self, status, title):
        super().__init__(f'HTTP {status}: {title}')
        self.status = status


class Api:
    """Same-origin client: keeps the antiforgery cookie and sends the session cookie."""

    def __init__(self, base_url, session):
        parsed = urllib.parse.urlsplit(base_url)
        if parsed.scheme != 'https' and parsed.hostname not in ('localhost', '127.0.0.1'):
            raise SystemExit('Use https; plain http is only accepted for localhost.')
        self.base = base_url.rstrip('/')
        # One origin only, so a plain dict is enough; cookiejar mishandles dotless hosts such as localhost.
        self.cookies = {SESSION_COOKIE: session}
        self.csrf = None

    def request(self, method, path, body=None):
        headers = {'Accept': 'application/json', 'Cookie': '; '.join(f'{k}={v}' for k, v in self.cookies.items())}
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers['Content-Type'] = 'application/json'
        if method != 'GET':
            headers['X-CSRF-TOKEN'] = self.csrf or ''
        try:
            with urllib.request.urlopen(urllib.request.Request(self.base + path, data, headers, method=method), timeout=30) as response:
                for header in response.headers.get_all('Set-Cookie') or []:
                    name, _, value = header.split(';', 1)[0].partition('=')
                    self.cookies[name.strip()] = value.strip()
                return json.loads(response.read() or b'null')
        except urllib.error.HTTPError as error:
            try:
                title = json.loads(error.read()).get('title', '')
            except ValueError:
                title = ''
            raise ApiError(error.code, title) from None

    def login_check(self):
        me = self.request('GET', '/api/auth/me')
        if not me.get('canAuthor'):
            raise SystemExit('The session does not belong to an author.')
        # Antiforgery tokens are bound to the authenticated identity: fetch after confirming it.
        self.csrf = self.request('GET', '/api/auth/csrf')['requestToken']

    def entries(self, resource):
        items, offset = [], 0
        while True:
            page = self.request('GET', f'/api/catalog/{resource}?offset={offset}&limit=100')
            items += page['items']
            offset += 100
            if offset >= page['total']:
                return items

    def update_topic(self, topic, description):
        entry = {key: topic[key] for key in ('name', 'slug', 'sortOrder', 'isAvailable')}
        return self.request('PUT', f"/api/catalog/topics/{topic['id']}",
                            {'version': topic['version'], 'entry': entry, 'description': description})


def load_source(path):
    topics = json.loads(Path(path).read_text(encoding='utf-8'))['topics']
    seen = set()
    for item in topics:
        key = (item['subject'], item['category'], item['slug'])
        text = item['description']
        if key in seen:
            raise SystemExit(f'Duplicate topic in source: {"/".join(key)}')
        if not text.strip() or text != text.strip() or len(text) > MAX_LENGTH:
            raise SystemExit(f'Invalid description for {item["slug"]}: trimmed, non-empty, at most {MAX_LENGTH} characters.')
        seen.add(key)
    return topics


def plan(source, subjects, categories, topics):
    """Pure decision per source topic: write, skip (already described), same, or missing."""
    subject_ids = {s['slug']: s['id'] for s in subjects}
    category_ids = {(c['subjectId'], c['slug']): c['id'] for c in categories}
    by_key = {(t['categoryId'], t['slug']): t for t in topics}
    steps = []
    for item in source:
        category = category_ids.get((subject_ids.get(item['subject']), item['category']))
        topic = by_key.get((category, item['slug']))
        if topic is None:
            steps.append({'slug': item['slug'], 'action': 'missing'})
        elif topic.get('description') == item['description']:
            steps.append({'slug': item['slug'], 'action': 'same', 'topic': topic})
        elif topic.get('description'):
            steps.append({'slug': item['slug'], 'action': 'skip', 'topic': topic})
        else:
            steps.append({'slug': item['slug'], 'action': 'write', 'topic': topic, 'description': item['description']})
    return steps


def run(api, source, apply):
    api.login_check()
    steps = plan(source, api.entries('subjects'), api.entries('categories'), api.entries('topics'))
    for step in steps:
        if step['action'] != 'write' or not apply:
            continue
        try:
            api.update_topic(step['topic'], step['description'])
            step['action'] = 'written'
        except ApiError as error:
            step['action'] = 'conflict' if error.status == 409 else 'failed'
            step['error'] = str(error)
    counts = {}
    for step in steps:
        counts[step['action']] = counts.get(step['action'], 0) + 1
    report = {'mode': 'apply' if apply else 'dry-run', 'counts': counts,
              'items': [{key: step[key] for key in ('slug', 'action', 'error') if key in step} for step in steps]}
    return report, not any(step['action'] in ('missing', 'conflict', 'failed') for step in steps)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--base-url', required=True, help='Same origin as the React app, e.g. https://<beta-host>')
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--apply', action='store_true', help='Write; without it nothing changes')
    args = parser.parse_args()
    session = os.environ.get('AITEACHER_SESSION', '').strip()
    if not session:
        parser.error('Set AITEACHER_SESSION to the author session cookie value.')
    report, ok = run(Api(args.base_url, session), load_source(args.source), args.apply)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()

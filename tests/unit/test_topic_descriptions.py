"""Approved topic descriptions and their non-overwriting loader."""
import http.server
import importlib.util
import json
from pathlib import Path
import socket
import threading
import urllib.error
import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('topic_descriptions', ROOT / 'backend/scripts/load-topic-descriptions.py')
loader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(loader)


def test_approved_file_covers_every_source_topic_within_the_api_limit():
    frozen = json.loads((ROOT / 'backend/src/AITeacher.Api/Features/Editorial/source-curriculum.json').read_text())
    approved = loader.load_source(loader.DEFAULT_SOURCE)
    assert {(t['subject'], t['category'], t['slug']) for t in frozen['topics']} == {(t['subject'], t['category'], t['slug']) for t in approved}
    assert all(len(t['description']) <= loader.MAX_LENGTH for t in approved)


@pytest.mark.parametrize('description', ['', '   ', ' padded', 'x' * 601])
def test_invalid_descriptions_are_rejected_before_any_request(tmp_path, description):
    path = tmp_path / 'source.json'
    path.write_text(json.dumps({'topics': [{'subject': 's', 'category': 'c', 'slug': 't', 'description': description}]}))
    with pytest.raises(SystemExit):
        loader.load_source(path)


class FakeApi:
    """In-memory catalog with the API's version check."""

    def __init__(self, topics, author=True):
        self.author = author
        self.subjects = [{'id': 'S', 'slug': 'net'}]
        self.categories = [{'id': 'C', 'subjectId': 'S', 'slug': 'routing'}, {'id': 'O', 'subjectId': 'S', 'slug': 'other'}]
        self.topics = topics
        self.writes = []

    def login_check(self):
        if not self.author:
            raise SystemExit('not an author')

    def entries(self, resource):
        return {'subjects': self.subjects, 'categories': self.categories, 'topics': self.topics}[resource]

    def update_topic(self, topic, description):
        if topic['slug'] == 'raced':
            raise loader.ApiError(409, 'Catalog entry has changed; reload before saving')
        self.writes.append((topic['id'], topic['version'], description))


def topic(id, slug, category='C', description=None):
    return {'id': id, 'slug': slug, 'categoryId': category, 'version': 3, 'name': slug, 'sortOrder': 0, 'isAvailable': True, 'description': description}


SOURCE = [{'subject': 'net', 'category': 'routing', 'slug': slug, 'description': f'Texto de {slug}.'}
          for slug in ('empty', 'edited', 'loaded', 'absent', 'raced')]
CATALOG = [topic('1', 'empty'), topic('2', 'edited', description='Escrita por un autor.'), topic('3', 'loaded', description='Texto de loaded.'),
           topic('4', 'absent', category='O'), topic('5', 'raced')]


def actions(report):
    return {item['slug']: item['action'] for item in report['items']}


def test_dry_run_reports_the_plan_without_writing():
    api = FakeApi(CATALOG)
    report, ok = loader.run(api, SOURCE, apply=False)
    assert api.writes == []
    assert actions(report) == {'empty': 'write', 'edited': 'skip', 'loaded': 'same', 'absent': 'missing', 'raced': 'write'}
    assert report['mode'] == 'dry-run' and not ok


def test_apply_writes_only_empty_topics_with_the_read_version_and_reports_conflicts():
    api = FakeApi(CATALOG)
    report, ok = loader.run(api, SOURCE, apply=True)
    # Same-slug topics in another category are not matched, and an author's text is never replaced.
    assert api.writes == [('1', 3, 'Texto de empty.')]
    assert actions(report) == {'empty': 'written', 'edited': 'skip', 'loaded': 'same', 'absent': 'missing', 'raced': 'conflict'}
    assert not ok


def test_repeating_after_a_successful_load_changes_nothing():
    api = FakeApi([topic(str(i), item['slug'], description=item['description']) for i, item in enumerate(SOURCE)])
    report, ok = loader.run(api, SOURCE, apply=True)
    assert api.writes == [] and ok and report['counts'] == {'same': 5}


def test_non_author_session_stops_before_reading_the_catalog():
    with pytest.raises(SystemExit):
        loader.run(FakeApi(CATALOG, author=False), SOURCE, apply=True)


def test_plain_http_is_refused_outside_localhost():
    with pytest.raises(SystemExit):
        loader.Api('http://beta.example.test', 'token')
    assert loader.Api('http://127.0.0.1:5088', 'token').base == 'http://127.0.0.1:5088'


class Recorder(http.server.BaseHTTPRequestHandler):
    """Local server that redirects /redirect elsewhere and records every request it receives."""

    seen = []
    target = ''

    def do_GET(self):
        Recorder.seen.append((self.path, self.headers.get('Cookie')))
        if self.path == '/redirect':
            self.send_response(302)
            self.send_header('Location', Recorder.target)
            self.end_headers()
        else:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{}')

    def log_message(self, *args):
        pass


@pytest.fixture
def local_server():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Recorder)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    Recorder.seen = []
    Recorder.target = f'http://127.0.0.1:{server.server_port}/leak'
    yield f'http://127.0.0.1:{server.server_port}'
    server.shutdown()
    server.server_close()


def test_redirects_are_not_followed_so_the_session_cookie_stays_on_the_origin(local_server):
    with pytest.raises(loader.ApiError) as raised:
        loader.Api(local_server, 'secreto').request('GET', '/redirect')
    assert raised.value.status == 302
    assert [path for path, _ in Recorder.seen] == ['/redirect']


@pytest.mark.parametrize('error', [urllib.error.URLError('refused by beta.example.test'), TimeoutError('timed out'), ConnectionResetError('reset')])
def test_transport_errors_become_api_errors_without_url_or_cause(error):
    api = loader.Api('http://127.0.0.1:5088', 'secreto')

    def fail(*args, **kwargs):
        raise error

    api.opener.open = fail
    with pytest.raises(loader.ApiError) as raised:
        api.request('PUT', '/api/catalog/topics/1', {'version': 1})
    assert raised.value.status is None
    assert str(raised.value) == f'Transport error: {type(error).__name__}'
    assert raised.value.__cause__ is None and raised.value.__suppress_context__


def test_unreachable_server_is_reported_as_a_transport_error():
    # A closed port refuses the connection: urllib raises URLError, not HTTPError.
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    with pytest.raises(loader.ApiError) as raised:
        loader.Api(f'http://127.0.0.1:{port}', 'secreto').request('GET', '/api/auth/me')
    assert raised.value.status is None
    assert 'secreto' not in str(raised.value) and str(port) not in str(raised.value)


def test_a_network_error_mid_apply_is_reported_as_failed_and_the_rest_continue():
    class FlakyApi(FakeApi):
        def update_topic(self, topic, description):
            if topic['slug'] == 'empty':
                raise loader.ApiError(None, 'TimeoutError')
            super().update_topic(topic, description)

    api = FlakyApi(CATALOG + [topic('6', 'later')])
    source = SOURCE + [{'subject': 'net', 'category': 'routing', 'slug': 'later', 'description': 'Texto de later.'}]
    report, ok = loader.run(api, source, apply=True)
    assert api.writes == [('6', 3, 'Texto de later.')]
    assert actions(report)['empty'] == 'failed' and actions(report)['later'] == 'written'
    assert next(item for item in report['items'] if item['slug'] == 'empty')['error'] == 'Transport error: TimeoutError'
    assert json.loads(json.dumps(report))['counts']['failed'] == 1 and not ok

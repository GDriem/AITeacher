"""Approved topic descriptions and their non-overwriting loader."""
import importlib.util
import json
from pathlib import Path
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

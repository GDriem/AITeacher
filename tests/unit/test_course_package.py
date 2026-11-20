"""Paquetes de curso: validación previa, IDs deterministas y sincronización repetible."""
import copy
import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend/scripts'))
from course_package import Package, PackageError  # noqa: E402
import course_loader  # noqa: E402

AZ900 = ROOT / 'backend/configuration/courses/az-900'

TF = [{'key': 'verdadero', 'text': 'Verdadero'}, {'key': 'falso', 'text': 'Falso'}]


def closed(key, kind, objective, concept, correct):
    if kind == 'trueFalse':
        options = [dict(o, correct=o['key'] == correct) for o in TF]
        return {'key': key, 'type': kind, 'prompt': f'Afirmación de prueba número {key}.', 'objectives': [objective],
                'concepts': [concept], 'options': options}
    options = [{'key': k, 'text': f'Opción {k} de {key}', 'correct': k in correct} for k in 'abcd']
    prompt = f'Pregunta de prueba número {key}.' + (' Selecciona dos.' if kind == 'multipleChoice' else '')
    return {'key': key, 'type': kind, 'prompt': prompt, 'objectives': [objective], 'concepts': [concept], 'options': options}


def module():
    reading = 'Texto de lectura suficientemente largo. ' * 40
    objectives = [('o1', 'c1'), ('o2', 'c2'), ('o3', 'c3')]
    questions = []
    for index, (objective, concept) in enumerate(objectives):
        questions += [closed(f's{index}a', 'singleChoice', objective, concept, 'abcd'[index]),
                      closed(f's{index}b', 'singleChoice', objective, concept, 'abcd'[index + 1]),
                      closed(f'm{index}', 'multipleChoice', objective, concept, 'ab' if index else 'cd'),
                      closed(f't{index}', 'trueFalse', objective, concept, 'verdadero' if index % 2 else 'falso')]
    for kind in ('openResponse', 'caseAnalysis', 'practicalExercise'):
        questions.append({'key': kind.lower(), 'type': kind, 'prompt': f'Responde con detalle: {kind}.', 'objectives': ['o1'],
                          'concepts': ['c1'], 'rubric': {'privateGuidance': 'Guía.', 'criteria': [{'key': 'k', 'description': 'Criterio', 'maxPoints': 2}]}})
    closed_keys = [q['key'] for q in questions if 'rubric' not in q]
    return {
        'slug': 'modulo', 'name': 'Módulo', 'category': 'cat', 'sortOrder': 1, 'description': 'Descripción.',
        'unit': {
            'title': 'Unidad',
            'concepts': [{'key': c, 'name': c.upper()} for _, c in objectives],
            'objectives': [{'key': o, 'description': f'Objetivo {o}', 'concepts': [c]} for o, c in objectives],
            'readings': [{'key': f'r{i}', 'title': 'Lectura', 'text': reading, 'source': 'https://learn.microsoft.com/x',
                          'objectives': ['o1', 'o2', 'o3']} for i in range(3)],
            'exercises': [{'key': f'e{i}', 'prompt': 'Ejercicio', 'objectives': ['o1', 'o2', 'o3']} for i in range(3)],
            'assessments': [{'key': 'a1', 'prompt': 'Evalúa', 'privateCriteria': 'Criterio', 'objectives': ['o1', 'o2', 'o3']}],
            'prerequisites': [{'concept': 'c2', 'requires': 'c1'}],
        },
        'questions': questions,
        'tests': [{'key': 'practica', 'title': 'Práctica', 'mode': 'practice', 'timeLimitMinutes': 20, 'maxAttempts': 100,
                   'feedback': 'afterSubmission', 'questions': closed_keys},
                  {'key': 'quiz', 'title': 'Quiz', 'mode': 'assessment', 'timeLimitMinutes': 10, 'maxAttempts': 3,
                   'feedback': 'afterSubmission', 'questions': closed_keys[:8]},
                  {'key': 'abierta', 'title': 'Abierta', 'mode': 'assessment', 'timeLimitMinutes': 45, 'maxAttempts': 2,
                   'feedback': 'afterSubmission', 'questions': ['openresponse', 'caseanalysis', 'practicalexercise']}],
        'graph': {'title': 'Mapa', 'edges': [{'from': 'c2', 'to': 'c1', 'relation': 'requires'},
                                             {'from': 'c3', 'to': 'c2', 'relation': 'applies'}]},
    }


def package(tmp_path, *modules):
    (tmp_path / 'modules').mkdir(exist_ok=True)
    names = []
    for index, item in enumerate(modules):
        names.append(f'modules/{index}.json')
        (tmp_path / names[-1]).write_text(json.dumps(item), encoding='utf-8')
    course = {'course': 't', 'namespace': 'test-v1', 'subject': {'slug': 'materia', 'name': 'Materia'},
              'categories': [{'slug': 'cat', 'name': 'Categoría'}], 'modules': names}
    (tmp_path / 'course.json').write_text(json.dumps(course), encoding='utf-8')
    return Package(tmp_path)


def test_published_az900_package_is_valid_and_complete():
    pkg = Package(AZ900)
    assert pkg.validate() == []
    outline = [bullet for m in pkg.modules for bullet in m.get('outline', [])]
    assert len(pkg.modules) == 12 and len(outline) >= 50
    exam = next(m for m in pkg.modules if m.get('profile') == 'exam')
    assert {t['key'] for t in exam['tests']} >= {'diagnostico', 'simulacro-completo'}


def test_minimal_module_is_valid_and_ids_are_deterministic(tmp_path):
    first, second = package(tmp_path, module()), Package(tmp_path)
    assert first.validate() == []
    doc = first.unit_document(first.modules[0])
    assert doc == second.unit_document(second.modules[0])
    assert doc['objectives'][0]['conceptIds'] == [doc['concepts'][0]['id']]
    question = first.question_document(first.modules[0], first.modules[0]['questions'][0], 'U', 'R')
    assert question['unitRevisionId'] == 'R' and len(question['correctOptionIds']) == 1


@pytest.mark.parametrize('break_it, message', [
    (lambda m: m['unit']['exercises'].clear(), 'sin ejercicio'),
    (lambda m: m['questions'][0]['options'][1].update(correct=True), 'una sola correcta'),
    (lambda m: m['questions'][2].update(prompt='Elige las correctas de esta lista.'), 'Selecciona'),
    (lambda m: m['questions'][0].update(scoringPolicy='partialCredit'), 'política de puntuación'),
    (lambda m: m['questions'][0].update(concepts=['c2']), 'conceptos deben pertenecer'),
    (lambda m: m['questions'][12].update(options=[{'key': 'a', 'text': 'x'}]), 'no lleva opciones'),
    (lambda m: m['tests'][0]['questions'].append('inexistente'), 'preguntas existentes'),
    (lambda m: m['unit']['prerequisites'].append({'concept': 'c1', 'requires': 'c2'}), 'cíclicos'),
    (lambda m: m['graph']['edges'].append({'from': 'c1', 'to': 'c2', 'relation': 'requires'}), 'ciclo'),
    (lambda m: m['unit']['readings'][0].update(source='https://example.com'), 'Microsoft Learn'),
    (lambda m: m.update(description='x' * 601), 'description'),
])
def test_contract_violations_are_rejected_before_writing(tmp_path, break_it, message):
    broken = module()
    break_it(broken)
    with pytest.raises(PackageError, match=message):
        package(tmp_path, broken).validate()


def test_repeated_prompts_across_modules_are_rejected(tmp_path):
    other = copy.deepcopy(module())
    other['slug'] = 'otro'
    with pytest.raises(PackageError, match='repetida'):
        package(tmp_path, module(), other).validate()


def test_answer_position_bias_is_reported(tmp_path):
    biased = module()
    for q in biased['questions']:
        if q['type'] == 'singleChoice':
            for o in q['options']:
                o['correct'] = o['key'] == 'a'
    assert any('posición 1' in w for w in package(tmp_path, biased).validate())


class FakeApi:
    """API de autoría en memoria con revisiones inmutables y control de versión."""

    class Error(Exception):
        def __init__(self, status):
            super().__init__(status)
            self.status = status

    def __init__(self):
        self.catalog = {'subjects': [], 'categories': [], 'topics': []}
        self.units, self.revisions, self.graphs, self.writes = {}, {'questions': [], 'definitions': []}, [], []
        self.counter = 0

    def new_id(self):
        self.counter += 1
        return f'id-{self.counter}'

    def login_check(self):
        pass

    def entries(self, resource):
        return self.catalog[resource]

    def request(self, method, path, body=None):
        path, _, query = path.partition('?')
        params = dict(p.split('=') for p in query.split('&') if p)
        if method == 'GET':
            return self.get(path, params)
        self.writes.append((path, body))
        return self.post(path, body)

    def page(self, items, params):
        offset, limit = int(params.get('offset', 0)), int(params.get('limit', 50))
        return {'items': items[offset:offset + limit], 'total': len(items)}

    def get(self, path, params):
        if path == '/api/units':
            return self.page([{'id': u['id'], 'title': u['revision']['document']['title'], 'kind': 'learningUnit'}
                              for u in self.units.values() if u['topicId'] == params['topicId']], params)
        if path.startswith('/api/units/'):
            return copy.deepcopy(self.units[path.split('/')[3]])
        if path in ('/api/assessments/questions', '/api/assessments/definitions'):
            return self.page(self.revisions[path.split('/')[3]], params)
        if path.startswith('/api/assessments/definitions/'):
            return next(r for r in self.revisions['definitions'] if r['id'] == path.split('/')[4])
        if path == '/api/graphs/revisions':
            return self.page([{k: v for k, v in g.items() if k not in ('nodes', 'edges')}
                              for g in self.graphs if g['topicId'] == params['topicId']], params)
        if path.startswith('/api/graphs/revisions/'):
            return copy.deepcopy(next(g for g in self.graphs if g['id'] == path.split('/')[4]))
        raise AssertionError(path)

    def post(self, path, body):
        parts = path.split('/')
        if parts[2] == 'catalog':
            entry = {**body.get('entry', body), 'id': self.new_id(), 'version': 1,
                     'subjectId': body.get('subjectId'), 'categoryId': body.get('categoryId'), 'description': body.get('description')}
            self.catalog[parts[3]].append(entry)
            return entry
        if path == '/api/units':
            unit = {'id': self.new_id(), 'topicId': body['topicId'], 'version': 1, 'publishedRevisionId': None,
                    'revision': {'id': self.new_id(), 'number': 1, 'document': body['document']}}
            self.units[unit['id']] = unit
            return copy.deepcopy(unit)
        if parts[2] == 'units':
            unit = self.units[parts[3]]
            if body['version'] != unit['version']:
                raise self.Error(409)
            unit['version'] += 1
            if parts[-1] == 'revisions':
                unit['revision'] = {'id': self.new_id(), 'number': unit['revision']['number'] + 1, 'document': body['document']}
            else:
                unit['publishedRevisionId'] = parts[5]
            return copy.deepcopy(unit)
        if parts[2] == 'assessments':
            store = self.revisions[parts[3]]
            latest = max((r['number'] for r in store if r['resourceId'] == body['id']), default=0)
            if body['number'] != latest + 1:
                raise self.Error(409)
            revision = {'id': self.new_id(), 'resourceId': body['id'], 'number': body['number'], 'document': body['document']}
            store.append(revision)
            return revision
        if parts[2] == 'graphs':
            self.graphs.append({**body, 'id': self.new_id(), 'nodes': body['nodes'], 'edges': body['edges']})
            return self.graphs[-1]
        raise AssertionError(path)


def test_sync_dry_run_writes_nothing_then_apply_is_repeatable(tmp_path):
    pkg = package(tmp_path, module())
    api = FakeApi()
    report, ok = course_loader.run(api, FakeApi.Error, pkg, apply=False)
    assert ok and api.writes == [] and report['counts']['unit:pending-topic'] == 1

    report, ok = course_loader.run(api, FakeApi.Error, pkg, apply=True)
    assert ok and report['counts'] == {'subject:create': 1, 'category:create': 1, 'topic:create': 1, 'unit:create-and-publish': 1,
                                       'question:create': 15, 'test:create': 3, 'graph:create': 1}
    unit = next(iter(api.units.values()))
    assert unit['publishedRevisionId'] == unit['revision']['id']

    writes = len(api.writes)
    report, ok = course_loader.run(api, FakeApi.Error, pkg, apply=True)
    assert ok and len(api.writes) == writes and report['changes'] == []


def test_changed_unit_is_revised_and_dependents_repinned(tmp_path):
    changed = module()
    pkg = package(tmp_path, changed)
    api = FakeApi()
    course_loader.run(api, FakeApi.Error, pkg, apply=True)
    changed['unit']['readings'][0]['title'] = 'Lectura revisada'
    pkg = package(tmp_path, changed)
    report, ok = course_loader.run(api, FakeApi.Error, pkg, apply=True)
    assert ok and report['counts']['unit:revise-and-publish'] == 1
    assert report['counts']['question:revise'] == 15 and report['counts']['test:revise'] == 3 and report['counts']['graph:revise'] == 1
    unit = next(iter(api.units.values()))
    latest = [r for r in api.revisions['definitions'] if r['number'] == 2]
    assert all(r['document']['unitRevisionId'] == unit['revision']['id'] for r in latest)


def test_author_written_topic_description_is_not_replaced(tmp_path):
    pkg = package(tmp_path, module())
    api = FakeApi()
    course_loader.run(api, FakeApi.Error, pkg, apply=True)
    api.catalog['topics'][0]['description'] = 'Editada por un autor.'
    report, _ = course_loader.run(api, FakeApi.Error, pkg, apply=True)
    assert {'kind': 'topic', 'key': 'modulo', 'action': 'keep-author-description'} in report['changes']
    assert not any(path.startswith('/api/catalog') for path, _ in api.writes[-1:])

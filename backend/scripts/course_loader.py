"""Sincroniza un paquete de curso con la API de autoría, sin borrar ni sobrescribir.

Cada paso decide a partir de lo que el servidor ya tiene: crear, revisar o dejar
igual. Las revisiones son inmutables en el servidor, así que «actualizar» siempre
añade la siguiente revisión. Un fallo en un tema detiene sólo ese tema; los
siguientes continúan y el informe lo refleja.
"""
from __future__ import annotations

import json

PAGE = 100


def _canonical(value):
    """Comparación estable: orden de claves y números enteros/decimales equivalentes."""
    if isinstance(value, dict):
        return {k: _canonical(v) for k, v in sorted(value.items()) if v is not None}
    if isinstance(value, list):
        return [_canonical(v) for v in value]
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return value


def same(stored: dict, desired: dict) -> bool:
    """El documento guardado coincide en todos los campos que el paquete define."""
    stored = {k: stored.get(k) for k in desired}
    return json.dumps(_canonical(stored), sort_keys=True) == json.dumps(_canonical(desired), sort_keys=True)


class Sync:
    def __init__(self, api, api_error, package, apply):
        self.api, self.ApiError, self.package, self.apply = api, api_error, package, apply
        self.steps = []

    # --- utilidades ---------------------------------------------------------

    def step(self, kind, key, action, **extra):
        self.steps.append({'kind': kind, 'key': key, 'action': action, **extra})

    def write(self, method, path, body):
        return self.api.request(method, path, body)

    def pages(self, path):
        items, offset = [], 0
        separator = '&' if '?' in path else '?'
        while True:
            page = self.api.request('GET', f'{path}{separator}offset={offset}&limit={PAGE}')
            items += page['items']
            offset += PAGE
            if offset >= page['total']:
                return items

    # --- catálogo -----------------------------------------------------------

    def catalog(self):
        course = self.package.course
        subject_spec = course['subject']
        subject = next((s for s in self.api.entries('subjects') if s['slug'] == subject_spec['slug']), None)
        if subject is None:
            self.step('subject', subject_spec['slug'], 'create')
            subject = self.write('POST', '/api/catalog/subjects', {**_entry(subject_spec)}) if self.apply else None
        else:
            self.step('subject', subject_spec['slug'], 'same')
        existing = [c for c in self.api.entries('categories') if subject and c.get('subjectId') == subject['id']]
        categories = {}
        for spec in course['categories']:
            found = next((c for c in existing if c['slug'] == spec['slug']), None)
            if found is None:
                self.step('category', spec['slug'], 'create')
                if self.apply:
                    found = self.write('POST', '/api/catalog/categories', {'subjectId': subject['id'], 'entry': _entry(spec)})
            else:
                self.step('category', spec['slug'], 'same')
            categories[spec['slug']] = found
        topics = self.api.entries('topics')
        resolved = {}
        for module in self.package.modules:
            category = categories[module['category']]
            found = category and next((t for t in topics if t.get('categoryId') == category['id'] and t['slug'] == module['slug']), None)
            if not found:
                self.step('topic', module['slug'], 'create')
                if self.apply:
                    found = self.write('POST', '/api/catalog/topics', {
                        'subjectId': subject['id'], 'categoryId': category['id'],
                        'entry': _entry(module), 'description': module['description']})
            else:
                # Los autores son dueños de la descripción una vez cargada: no se pisa.
                self.step('topic', module['slug'], 'same' if found.get('description') == module['description'] else 'keep-author-description')
            resolved[module['slug']] = found
        return resolved

    # --- unidad -------------------------------------------------------------

    def unit(self, module, topic):
        """Devuelve (unitId, revisionId publicada que coincide con el paquete) o (None, None) en seco."""
        desired = self.package.unit_document(module)
        slug = module['slug']
        units = [u for u in self.pages(f"/api/units?topicId={topic['id']}") if u.get('kind', 'learningUnit') == 'learningUnit']
        if len(units) > 1:
            units = [u for u in units if u['title'] == desired['title']]
            if len(units) != 1:
                raise RuntimeError('El tema tiene varias unidades completas y ninguna coincide de forma única con el título')
        if not units:
            self.step('unit', slug, 'create-and-publish')
            if not self.apply:
                return None, None
            unit = self.write('POST', '/api/units', {'topicId': topic['id'], 'document': desired})
        else:
            unit = self.api.request('GET', f"/api/units/{units[0]['id']}")
            if same(unit['revision']['document'], desired):
                if unit['publishedRevisionId'] == unit['revision']['id']:
                    self.step('unit', slug, 'same', revision=unit['revision']['number'])
                    return unit['id'], unit['revision']['id']
                self.step('unit', slug, 'publish', revision=unit['revision']['number'])
            else:
                self.step('unit', slug, 'revise-and-publish', revision=unit['revision']['number'] + 1)
                if not self.apply:
                    return unit['id'], None
                unit = self.write('POST', f"/api/units/{unit['id']}/revisions", {'version': unit['version'], 'document': desired})
            if not self.apply:
                return unit['id'], None
        published = self.write('POST', f"/api/units/{unit['id']}/revisions/{unit['revision']['id']}/publish", {'version': unit['version']})
        return unit['id'], published['revision']['id']

    # --- banco, pruebas y mapa ----------------------------------------------

    def latest(self, kind, ids):
        latest = {}
        for revision in self.pages(f'/api/assessments/{kind}'):
            if revision['resourceId'] in ids and revision['number'] > latest.get(revision['resourceId'], {}).get('number', 0):
                latest[revision['resourceId']] = revision
        return latest

    def questions(self, module, unit_id, revision_id, bank):
        pinned = {}
        for question in module['questions']:
            resource = self.package.question_id(module, question['key'])
            current = bank.get(resource)
            if revision_id is None:
                self.step('question', f"{module['slug']}/{question['key']}", 'pending-unit')
                continue
            desired = self.package.question_document(module, question, unit_id, revision_id)
            if current and same(current['document'], desired):
                pinned[question['key']] = current['id']
                continue
            number = current['number'] + 1 if current else 1
            self.step('question', f"{module['slug']}/{question['key']}", 'revise' if current else 'create', revision=number)
            if self.apply:
                pinned[question['key']] = self.write('POST', '/api/assessments/questions',
                                                     {'id': resource, 'number': number, 'document': desired})['id']
        return pinned

    def tests(self, module, unit_id, revision_id, pinned, definitions):
        for test in module['tests']:
            resource = self.package.definition_id(module, test['key'])
            key = f"{module['slug']}/{test['key']}"
            if revision_id is None or len(pinned) < len(module['questions']):
                self.step('test', key, 'pending-unit' if revision_id is None else 'pending-questions')
                continue
            desired = self.package.definition_document(module, test, unit_id, revision_id, pinned)
            current = definitions.get(resource)
            if current and same(self.api.request('GET', f"/api/assessments/definitions/{current['id']}")['document'], desired):
                continue
            number = current['number'] + 1 if current else 1
            self.step('test', key, 'revise' if current else 'create', revision=number)
            if self.apply:
                self.write('POST', '/api/assessments/definitions', {'id': resource, 'number': number, 'document': desired})

    def graph(self, module, topic, unit_id, revision_id):
        key = module['slug']
        if revision_id is None:
            self.step('graph', key, 'pending-unit')
            return
        graph_id = self.package.graph_id(module)
        desired = self.package.graph_content(module, unit_id, revision_id)
        revisions = [g for g in self.pages(f"/api/graphs/revisions?topicId={topic['id']}") if g['graphId'] == graph_id]
        current = max(revisions, key=lambda g: g['number'], default=None)
        if current:
            # La lista devuelve resúmenes; nodos y aristas sólo vienen en la revisión completa.
            current = self.api.request('GET', f"/api/graphs/revisions/{current['id']}")
        if current and current['title'] == desired['title'] and _graph_key(current) == _graph_key(desired):
            return
        number = current['number'] + 1 if current else 1
        self.step('graph', key, 'revise' if current else 'create', revision=number)
        if self.apply:
            self.write('POST', '/api/graphs/revisions', {'graphId': graph_id, 'number': number, 'topicId': topic['id'], **desired})


def _entry(spec):
    return {'name': spec['name'], 'slug': spec['slug'], 'sortOrder': spec.get('sortOrder', 0), 'isAvailable': True}


def _graph_key(graph):
    nodes = sorted((n['id'], n['unitId'], n['unitRevisionId'], n['conceptId']) for n in graph['nodes'])
    edges = sorted((e['fromNodeId'], e['toNodeId'], e['relation']) for e in graph['edges'])
    return nodes, edges


def run(api, api_error, package, apply):
    sync = Sync(api, api_error, package, apply)
    api.login_check()
    topics = sync.catalog()
    question_ids = {package.question_id(m, q['key']) for m in package.modules for q in m['questions']}
    definition_ids = {package.definition_id(m, t['key']) for m in package.modules for t in m['tests']}
    bank = sync.latest('questions', question_ids)
    definitions = sync.latest('definitions', definition_ids)
    failed = []
    for module in package.modules:
        topic = topics[module['slug']]
        if topic is None:
            for kind in ('unit', 'question', 'test', 'graph'):
                sync.step(kind, module['slug'], 'pending-topic')
            continue
        try:
            unit_id, revision_id = sync.unit(module, topic)
            pinned = sync.questions(module, unit_id, revision_id, bank)
            sync.tests(module, unit_id, revision_id, pinned, definitions)
            sync.graph(module, topic, unit_id, revision_id)
        except (api_error, RuntimeError) as error:
            failed.append(module['slug'])
            sync.step('topic-sync', module['slug'], 'conflict' if getattr(error, 'status', None) == 409 else 'failed', error=str(error))
    counts = {}
    for step in sync.steps:
        counts[f"{step['kind']}:{step['action']}"] = counts.get(f"{step['kind']}:{step['action']}", 0) + 1
    return {'mode': 'apply' if apply else 'dry-run', 'counts': counts, 'failed': failed,
            'changes': [s for s in sync.steps if s['action'] not in ('same',)]}, not failed

"""Paquetes de curso versionados: validación y traducción a los contratos de la API.

Un paquete (`backend/configuration/courses/<curso>/`) describe con claves legibles
el catálogo, las unidades, el banco de preguntas, las pruebas y los mapas de un
curso. Los UUID se derivan con UUIDv5 de esas claves, así que repetir la carga
produce los mismos identificadores y una revisión nueva conserva objetivos y
conceptos. Las reglas replican las del servidor (publicación, `ChoiceQuestion`,
rúbricas, cobertura de definiciones y DAG de `requires`) para fallar antes de
escribir; el servidor sigue siendo la autoridad.
"""
from __future__ import annotations

import json
import re
import uuid
from collections import Counter
from pathlib import Path

KEY = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')
CLOSED = {'singleChoice', 'multipleChoice', 'trueFalse'}
RUBRIC = {'openResponse', 'caseAnalysis', 'practicalExercise'}
RELATIONS = {'requires', 'explains', 'applies', 'differsFrom'}
TOPIC_DESCRIPTION_MAX = 600
OFFICIAL_SOURCE = 'https://learn.microsoft.com/'

# Mínimos pedagógicos por perfil. `module`: unidad de un módulo del temario;
# `exam`: unidad integradora del simulacro.
PROFILES = {
    'module': {'readings': 3, 'reading_chars': 1200, 'exercises': 3, 'closed': 12,
               'per_objective': 3, 'tests': 3, 'rubric_types': RUBRIC},
    'exam': {'readings': 3, 'reading_chars': 1200, 'exercises': 3, 'closed': 55,
             'per_objective': 15, 'tests': 4, 'rubric_types': set()},
}


class PackageError(ValueError):
    """El paquete incumple el contrato; el mensaje lista todos los problemas."""


class Package:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.course = json.loads((self.root / 'course.json').read_text(encoding='utf-8'))
        self.namespace = uuid.uuid5(uuid.NAMESPACE_URL, 'https://aiteacher/courses/' + self.course['namespace'])
        self.modules = [json.loads((self.root / name).read_text(encoding='utf-8')) for name in self.course['modules']]

    def id(self, *parts: str) -> str:
        return str(uuid.uuid5(self.namespace, '/'.join(parts)))

    # --- Documentos de API -------------------------------------------------

    def unit_document(self, module: dict) -> dict:
        unit, slug = module['unit'], module['slug']
        ref = lambda kind, key: self.id(slug, kind, key)  # noqa: E731
        return {
            'kind': 'learningUnit',
            'title': unit['title'],
            'concepts': [{'id': ref('concept', c['key']), 'name': c['name']} for c in unit['concepts']],
            'objectives': [{'id': ref('objective', o['key']), 'description': o['description'],
                            'conceptIds': [ref('concept', k) for k in o['concepts']]} for o in unit['objectives']],
            'readings': [{'id': ref('reading', r['key']), 'title': r['title'], 'text': r['text'], 'source': r['source'],
                          'objectiveIds': [ref('objective', k) for k in r['objectives']]} for r in unit['readings']],
            'exercises': [{'id': ref('exercise', e['key']), 'prompt': e['prompt'],
                           'objectiveIds': [ref('objective', k) for k in e['objectives']]} for e in unit['exercises']],
            'assessments': [{'id': ref('assessment', a['key']), 'prompt': a['prompt'], 'privateCriteria': a['privateCriteria'],
                             'objectiveIds': [ref('objective', k) for k in a['objectives']]} for a in unit['assessments']],
            'prerequisites': [{'conceptId': ref('concept', p['concept']), 'requiresConceptId': ref('concept', p['requires'])}
                              for p in unit['prerequisites']],
        }

    def question_document(self, module: dict, question: dict, unit_id: str, revision_id: str) -> dict:
        slug, key = module['slug'], question['key']
        closed = question['type'] in CLOSED
        options = [{'id': self.id(slug, 'option', key, o['key']), 'text': o['text']} for o in question.get('options', [])]
        document = {
            'unitId': unit_id, 'unitRevisionId': revision_id,
            'objectiveIds': [self.id(slug, 'objective', k) for k in question['objectives']],
            'conceptIds': [self.id(slug, 'concept', k) for k in question['concepts']],
            'type': question['type'], 'prompt': question['prompt'],
            'options': options if closed else [],
            'scoringPolicy': question.get('scoringPolicy', 'exactMatch') if closed else 'rubric',
            'correctOptionIds': [self.id(slug, 'option', key, o['key']) for o in question.get('options', []) if o.get('correct')] if closed else [],
        }
        if not closed:
            rubric = question['rubric']
            document['rubric'] = {'version': 1, 'privateGuidance': rubric['privateGuidance'],
                                  'criteria': [{'id': self.id(slug, 'criterion', key, c['key']), 'description': c['description'],
                                                'maxPoints': c['maxPoints']} for c in rubric['criteria']]}
        return document

    def definition_document(self, module: dict, test: dict, unit_id: str, revision_id: str, question_revisions: dict) -> dict:
        questions = {q['key']: q for q in module['questions']}
        objectives = []
        for key in test['questions']:
            for objective in questions[key]['objectives']:
                if objective not in objectives:
                    objectives.append(objective)
        return {
            'title': test['title'], 'unitId': unit_id, 'unitRevisionId': revision_id,
            'objectiveIds': [self.id(module['slug'], 'objective', k) for k in objectives],
            'questionRevisionIds': [question_revisions[k] for k in test['questions']],
            'mode': test['mode'], 'timeLimitMinutes': test['timeLimitMinutes'],
            'maxAttempts': test['maxAttempts'], 'feedback': test['feedback'], 'assistance': 'none',
        }

    def graph_content(self, module: dict, unit_id: str, revision_id: str) -> dict:
        slug = module['slug']
        node = lambda key: self.id(slug, 'graph-node', key)  # noqa: E731
        return {
            'title': module['graph']['title'],
            'nodes': [{'id': node(c['key']), 'unitId': unit_id, 'unitRevisionId': revision_id,
                       'conceptId': self.id(slug, 'concept', c['key'])} for c in module['unit']['concepts']],
            'edges': [{'fromNodeId': node(e['from']), 'toNodeId': node(e['to']), 'relation': e['relation']}
                      for e in module['graph']['edges']],
        }

    def question_id(self, module: dict, key: str) -> str:
        return self.id(module['slug'], 'question', key)

    def definition_id(self, module: dict, key: str) -> str:
        return self.id(module['slug'], 'definition', key)

    def graph_id(self, module: dict) -> str:
        return self.id(module['slug'], 'graph')

    # --- Validación ---------------------------------------------------------

    def validate(self) -> list[str]:
        """Devuelve advertencias de calidad; lanza PackageError ante errores de contrato."""
        errors, warnings = [], []
        categories = {c['slug'] for c in self.course['categories']}
        for item in [self.course['subject'], *self.course['categories']]:
            _entry(item, item.get('slug', '?'), errors)
        slugs = Counter(m.get('slug') for m in self.modules)
        errors += [f'{s}: tema duplicado' for s, n in slugs.items() if n > 1]
        prompts = Counter()
        for module in self.modules:
            where = module.get('slug', '?')
            try:
                _validate_module(module, categories, errors, warnings)
            except (KeyError, TypeError) as error:
                errors.append(f'{where}: estructura inválida ({type(error).__name__}: {error})')
                continue
            prompts.update(q['prompt'].strip().casefold() for q in module['questions'])
        errors += [f'pregunta repetida en el curso: {p[:70]}…' for p, n in prompts.items() if n > 1]
        if errors:
            raise PackageError('\n'.join(errors))
        return warnings


def _entry(item, where, errors):
    if not KEY.fullmatch(item.get('slug', '')) or len(item['slug']) > 80:
        errors.append(f'{where}: slug inválido')
    if not 0 < len(item.get('name', '').strip()) <= 150:
        errors.append(f'{where}: nombre vacío o de más de 150 caracteres')


def _keys(items, kind, where, errors):
    keys = [i.get('key', '') for i in items]
    errors += [f'{where}: clave {kind} inválida «{k}»' for k in keys if not KEY.fullmatch(k)]
    errors += [f'{where}: clave {kind} duplicada «{k}»' for k, n in Counter(keys).items() if n > 1]
    return set(keys)


def _text(value, limit, label, errors, minimum=1):
    if not isinstance(value, str) or len(value.strip()) < minimum or len(value) > limit:
        errors.append(f'{label}: texto vacío, demasiado corto o de más de {limit} caracteres')


def _cycle(edges):
    graph = {}
    for a, b in edges:
        graph.setdefault(a, set()).add(b)
    state = {}

    def visit(n):
        state[n] = 1
        for m in graph.get(n, ()):
            if state.get(m) == 1 or (m not in state and visit(m)):
                return True
        state[n] = 2
        return False

    return any(n not in state and visit(n) for n in list(graph))


def _validate_module(module, categories, errors, warnings):
    slug = module['slug']
    profile = PROFILES[module.get('profile', 'module')]
    _entry(module, slug, errors)
    if module['category'] not in categories:
        errors.append(f'{slug}: categoría desconocida {module["category"]}')
    _text(module['description'], TOPIC_DESCRIPTION_MAX, f'{slug}: description', errors)
    if module['description'] != module['description'].strip():
        errors.append(f'{slug}: description con espacios al inicio o final')
    unit = module['unit']
    _text(unit['title'], 150, f'{slug}: unit.title', errors)
    concepts = _keys(unit['concepts'], 'concepto', slug, errors)
    objectives = _keys(unit['objectives'], 'objetivo', slug, errors)
    for c in unit['concepts']:
        _text(c['name'], 150, f'{slug}/{c["key"]}', errors)
    objective_concepts = {}
    for o in unit['objectives']:
        _text(o['description'], 2000, f'{slug}/{o["key"]}', errors)
        if not o['concepts'] or set(o['concepts']) - concepts:
            errors.append(f'{slug}/{o["key"]}: conceptos vacíos o desconocidos')
        objective_concepts[o['key']] = set(o['concepts'])
    orphan = concepts - set().union(*objective_concepts.values()) if objective_concepts else concepts
    errors += [f'{slug}: concepto {c} sin objetivo' for c in sorted(orphan)]
    for kind, items, label in (('reading', unit['readings'], 'lectura'), ('exercise', unit['exercises'], 'ejercicio'),
                               ('assessment', unit['assessments'], 'evaluación editorial')):
        _keys(items, kind, slug, errors)
        covered = set()
        for item in items:
            where = f'{slug}/{item["key"]}'
            if not item['objectives'] or set(item['objectives']) - objectives:
                errors.append(f'{where}: objetivos vacíos o desconocidos')
            covered |= set(item['objectives'])
            if kind == 'reading':
                _text(item['title'], 150, where, errors)
                _text(item['text'], 100_000, where, errors, profile['reading_chars'])
                _text(item['source'], 1000, where, errors)
                if not item['source'].startswith(OFFICIAL_SOURCE):
                    errors.append(f'{where}: la fuente debe ser una página de Microsoft Learn')
            else:
                _text(item['prompt'], 20_000, where, errors)
            if kind == 'assessment':
                _text(item['privateCriteria'], 20_000, where, errors)
        errors += [f'{slug}: objetivo {o} sin {label}' for o in sorted(objectives - covered)]
    if len(unit['readings']) < profile['readings'] or len(unit['exercises']) < profile['exercises']:
        errors.append(f'{slug}: faltan lecturas o ejercicios para el perfil')
    pairs = [(p['concept'], p['requires']) for p in unit['prerequisites']]
    if any(a not in concepts or b not in concepts or a == b for a, b in pairs) or _cycle(pairs):
        errors.append(f'{slug}: prerrequisitos desconocidos o cíclicos')

    questions = {}
    _keys(module['questions'], 'pregunta', slug, errors)
    for q in module['questions']:
        where = f'{slug}/{q["key"]}'
        questions[q['key']] = q
        _text(q['prompt'], 20_000, where, errors, 15)
        if not q['objectives'] or set(q['objectives']) - objectives:
            errors.append(f'{where}: objetivos vacíos o desconocidos')
            continue
        allowed = set().union(*(objective_concepts[o] for o in q['objectives']))
        if not q['concepts'] or set(q['concepts']) - allowed or any(not objective_concepts[o] & set(q['concepts']) for o in q['objectives']):
            errors.append(f'{where}: los conceptos deben pertenecer a sus objetivos y representar a cada uno')
        if q['type'] in CLOSED:
            _closed(q, where, errors)
        elif q['type'] in RUBRIC:
            if q.get('options') or q.get('scoringPolicy', 'rubric') != 'rubric':
                errors.append(f'{where}: una pregunta con rúbrica no lleva opciones')
            rubric = q.get('rubric') or {}
            criteria = rubric.get('criteria') or []
            _keys(criteria, 'criterio', where, errors)
            _text(rubric.get('privateGuidance'), 20_000, f'{where}: privateGuidance', errors)
            if not 1 <= len(criteria) <= 50 or any(not 0 < c.get('maxPoints', 0) <= 1000 for c in criteria):
                errors.append(f'{where}: rúbrica con 1–50 criterios y puntos en (0, 1000]')
            for c in criteria:
                _text(c.get('description'), 2000, f'{where}/{c.get("key")}', errors)
        else:
            errors.append(f'{where}: tipo desconocido {q["type"]}')

    closed = [q for q in module['questions'] if q['type'] in CLOSED]
    types = Counter(q['type'] for q in module['questions'])
    if len(closed) < profile['closed'] or not CLOSED <= set(types):
        errors.append(f'{slug}: se requieren al menos {profile["closed"]} preguntas cerradas de los tres tipos')
    if not profile['rubric_types'] <= set(types):
        errors.append(f'{slug}: faltan preguntas abiertas ({", ".join(sorted(profile["rubric_types"] - set(types)))})')
    per_objective = Counter(o for q in closed for o in q['objectives'])
    errors += [f'{slug}: objetivo {o} con menos de {profile["per_objective"]} preguntas cerradas'
               for o in sorted(objectives) if per_objective[o] < profile['per_objective']]
    _bias(slug, closed, warnings)

    _keys(module['tests'], 'prueba', slug, errors)
    if len(module['tests']) < profile['tests']:
        errors.append(f'{slug}: se requieren al menos {profile["tests"]} pruebas')
    used = set()
    for test in module['tests']:
        where = f'{slug}/{test["key"]}'
        keys = test['questions']
        used |= set(keys)
        if not 1 <= len(keys) <= 100 or len(set(keys)) != len(keys) or set(keys) - set(questions):
            errors.append(f'{where}: 1–100 preguntas existentes y sin repetir')
        _text(test['title'], 300, where, errors)
        if test['mode'] not in ('practice', 'assessment') or test['feedback'] not in ('afterSubmission', 'never') \
                or not 1 <= test['timeLimitMinutes'] <= 1440 or not 1 <= test['maxAttempts'] <= 100:
            errors.append(f'{where}: política inválida')
    errors += [f'{slug}: pregunta {k} fuera de toda prueba' for k in sorted(set(questions) - used)]

    graph = module['graph']
    _text(graph['title'], 150, f'{slug}: graph.title', errors)
    edges = [(e['from'], e['to']) for e in graph['edges']]
    if any(a not in concepts or b not in concepts or a == b for a, b in edges) or \
            any(e['relation'] not in RELATIONS for e in graph['edges']) or len(set(edges)) != len(edges):
        errors.append(f'{slug}: aristas del mapa inválidas o repetidas')
    if _cycle([(e['from'], e['to']) for e in graph['edges'] if e['relation'] == 'requires']):
        errors.append(f'{slug}: las aristas requires del mapa forman un ciclo')
    linked = {n for pair in edges for n in pair}
    warnings += [f'{slug}: concepto {c} aislado en el mapa' for c in sorted(concepts - linked)]


def _closed(q, where, errors):
    options = q.get('options') or []
    _keys(options, 'opción', where, errors)
    correct = [o for o in options if o.get('correct')]
    policy = q.get('scoringPolicy', 'exactMatch')
    for o in options:
        _text(o.get('text'), 10_000, f'{where}/{o.get("key")}', errors)
    if len(options) < 2 or not correct or q.get('rubric'):
        errors.append(f'{where}: al menos dos opciones y una correcta, sin rúbrica')
    elif q['type'] != 'multipleChoice' and len(correct) != 1:
        errors.append(f'{where}: selección única y verdadero/falso exigen una sola correcta')
    elif q['type'] == 'trueFalse' and len(options) != 2:
        errors.append(f'{where}: verdadero/falso exige dos opciones')
    elif q['type'] == 'multipleChoice' and (len(correct) == len(options) or len(correct) < 2):
        errors.append(f'{where}: selección múltiple exige al menos dos correctas y un distractor')
    if policy not in ('exactMatch', 'partialCredit') or (policy == 'partialCredit' and q['type'] != 'multipleChoice'):
        errors.append(f'{where}: política de puntuación inválida')
    if q['type'] == 'multipleChoice' and 'selecciona' not in q['prompt'].casefold():
        errors.append(f'{where}: la selección múltiple debe indicar cuántas opciones elegir («Selecciona …»)')


def _bias(slug, closed, warnings):
    """Advierte de pistas involuntarias: posición fija o respuesta más larga."""
    single = [q for q in closed if q['type'] == 'singleChoice']
    if len(single) >= 4:
        positions = Counter(next(i for i, o in enumerate(q['options']) if o.get('correct')) for q in single)
        position, count = positions.most_common(1)[0]
        if count / len(single) > 0.4:
            warnings.append(f'{slug}: {count}/{len(single)} respuestas correctas en la posición {position + 1}')
        longest = sum(max(q['options'], key=lambda o: len(o['text'])).get('correct', False) for q in single)
        if longest / len(single) > 0.5:
            warnings.append(f'{slug}: la opción correcta es la más larga en {longest}/{len(single)} preguntas')
    tf = [q for q in closed if q['type'] == 'trueFalse']
    true_first = sum(q['options'][0].get('correct', False) for q in tf)
    if len(tf) >= 4 and true_first in (0, len(tf)):
        warnings.append(f'{slug}: todas las respuestas verdadero/falso tienen la misma clave')

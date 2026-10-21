#!/usr/bin/env python3
"""Freeze the existing Python curriculum and corpus, without learner data."""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from mcp_learning_server.curriculum import CURRICULUM
from mcp_learning_server.models import LearningContent

SUBJECTS = {'artificial-intelligence': 'Inteligencia artificial', 'english': 'Inglés', 'networks': 'Redes'}
CATEGORIES = {'fundamentos': 'Fundamentos', 'modelos-y-datos': 'Modelos y datos', 'agentes-y-herramientas': 'Agentes y herramientas', 'calidad-y-seguridad': 'Calidad y seguridad', 'produccion': 'Producción', 'comunicacion': 'Comunicación', 'vocabulario': 'Vocabulario', 'gramatica': 'Gramática', 'enrutamiento': 'Enrutamiento'}
LEVELS = {'beginner': 'Principiante', 'intermediate': 'Intermedio', 'advanced': 'Avanzado'}

def manifest():
    records = json.loads((ROOT / 'mcp_learning_server/content/learning_content.json').read_text())
    for record in records:
        LearningContent.model_validate(record)
    assert len({r['id'] for r in records}) == len(records)
    assert {r['topic'] for r in records} == {t.topic.value for t in CURRICULUM}
    return {'schemaVersion': 1, 'source': 'learning-content-v1',
            'subjects': [{'slug': slug, 'name': name} for slug, name in SUBJECTS.items()],
            'categories': [{'slug': slug, 'name': name, 'subject': subject} for subject in SUBJECTS
                           for slug, name in CATEGORIES.items() if any(t.subject.value == subject and t.category.value == slug for t in CURRICULUM)],
            'levels': [{'slug': slug, 'name': name} for slug, name in LEVELS.items()],
            'topics': [{'slug': t.topic.value, 'name': t.title, 'subject': t.subject.value,
                        'category': t.category.value, 'prerequisites': [p.value for p in t.prerequisites]} for t in CURRICULUM],
            'records': records}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    target = ROOT / 'backend/src/AITeacher.Api/Features/Editorial/source-curriculum.json'
    value = json.dumps(manifest(), ensure_ascii=False, indent=2) + '\n'
    if args.check:
        if target.read_text() != value:
            raise SystemExit('Source curriculum manifest differs; regenerate before migration.')
    else:
        target.write_text(value)
    print('Source curriculum: 3 subjects, 9 categories, 3 reading levels, 35 topics, 82 readings.')

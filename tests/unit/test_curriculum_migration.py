"""Source preservation and recovery of real ACA/CRI report formats."""
import importlib.util
import json
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[2]

def module(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded

runner = module('curriculum_runner', 'backend/scripts/run-curriculum-azure.py')

@pytest.mark.parametrize('envelope', ['plain', 'escaped', 'cri'])
def test_recovers_complete_report_without_using_execution_status(envelope):
    report = {'mode': 'inspect', 'source': 'learning-content-v1', 'matches': False, 'imported': 0}
    body = json.dumps(report)
    raw = body if envelope == 'plain' else json.dumps({'Log': 'F ' + body}) if envelope == 'escaped' else '{"Log":"F ' + body + '"}'
    assert runner.report_from_logs(raw) == report


def test_incomplete_or_success_only_logs_cannot_prove_reconciliation():
    for raw in ['Succeeded', '{"status":"Succeeded"}', '{"Log":"F {"mode":"inspect"']:
        with pytest.raises(RuntimeError):
            runner.report_from_logs(raw)


def test_frozen_manifest_preserves_source_corpus_and_topic_edges():
    generator = module('curriculum_generator', 'backend/scripts/prepare-curriculum-manifest.py')
    frozen = json.loads((ROOT / 'backend/src/AITeacher.Api/Features/Editorial/source-curriculum.json').read_text())
    assert frozen == generator.manifest()
    assert len(frozen['records']) == 82
    assert len(frozen['topics']) == 35
    assert sum(len(topic['prerequisites']) for topic in frozen['topics']) == 42

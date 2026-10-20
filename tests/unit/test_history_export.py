import copy
import importlib.util
import json
from pathlib import Path
from uuid import uuid4

import pytest

from agent_app.services.sessions import _serialize_session
from tests.unit.test_session_repository import make_session

spec = importlib.util.spec_from_file_location(
    "history_export", Path(__file__).resolve().parents[2] / "backend/scripts/prepare-history-import.py"
)
export = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export)


def test_export_preserves_original_summaries_private_data_unicode_and_dates():
    session = _serialize_session(make_session())
    progress = {"student_id": "student-1", "assessments": [], "level": "advanced",
                "studied_topics": ["embeddings"], "topic_progress": [],
                "recommendations": ["Conserva este resumen antiguo"], "updated_at": "2020-01-01T00:00:00Z"}
    before = copy.deepcopy(progress)
    snapshot = export.prepare({session["id"]: session}, {"student-1": progress}, "local", uuid4())
    assert snapshot["documents"][0]["payload"] == session
    assert snapshot["documents"][0]["payload"]["pending_evaluation"]["quiz"]["expected_keywords"]
    assert snapshot["documents"][1]["payload"] == before
    assert progress == before  # Pydantic's recalculated summaries never replace raw data.


@pytest.mark.parametrize("mutation", ["owner", "key", "duplicate", "invalid_score"])
def test_export_rejects_identity_and_content_errors(mutation):
    session = _serialize_session(make_session())
    key = session["id"]
    progress = {}
    if mutation == "owner":
        session["pending_evaluation"]["student_id"] = "other"
    elif mutation == "key":
        key = "different"
    elif mutation == "duplicate":
        session["messages"].append(copy.deepcopy(session["messages"][0]))
    else:
        progress = {"student-1": {"student_id": "student-1", "assessments": [{"score": 101}]}}
    with pytest.raises(ValueError):
        export.prepare({key: session}, progress, "local", uuid4())


def test_export_rejects_duplicate_json_properties(tmp_path):
    source = tmp_path / "source.json"
    source.write_text('{"a":1,"a":2}')
    with pytest.raises(ValueError):
        export.read_map(source)

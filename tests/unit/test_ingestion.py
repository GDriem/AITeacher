import json

import pytest
from pydantic import ValidationError

from mcp_learning_server.models import LearningLevel, Topic
from mcp_learning_server.server import CONTENT_PATH
from mcp_learning_server.services.ingestion import load_content


def test_initial_content_covers_every_required_topic() -> None:
    chunks = load_content(CONTENT_PATH)
    assert {chunk.topic for chunk in chunks} == set(Topic)
    assert all(chunk.source for chunk in chunks)


def test_extended_curriculum_has_three_progressive_levels() -> None:
    chunks = load_content(CONTENT_PATH)
    extended_topics = {
        Topic.PROMPT_ENGINEERING,
        Topic.HALLUCINATIONS_EVALUATION,
        Topic.AGENT_MEMORY,
        Topic.ADVANCED_RAG,
        Topic.AI_SECURITY,
        Topic.OBSERVABILITY_COSTS,
        Topic.FINE_TUNING,
        Topic.MULTIMODAL_AI,
        Topic.RESPONSIBLE_AI,
        Topic.AI_PRODUCTION,
    }
    expected_levels = set(LearningLevel)

    for topic in extended_topics:
        assert {chunk.level for chunk in chunks if chunk.topic == topic} == expected_levels


def test_ingestion_rejects_invalid_content(tmp_path) -> None:
    path = tmp_path / "invalid.json"
    path.write_text(json.dumps([{"id": "x"}]), encoding="utf-8")
    with pytest.raises(ValidationError):
        load_content(path)


def test_ingestion_rejects_duplicate_ids(tmp_path) -> None:
    original = json.loads(CONTENT_PATH.read_text(encoding="utf-8"))
    original.append(original[0])
    path = tmp_path / "duplicate.json"
    path.write_text(json.dumps(original), encoding="utf-8")
    with pytest.raises(ValueError, match="únicos"):
        load_content(path)

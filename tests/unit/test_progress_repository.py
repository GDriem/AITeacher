import json

import pytest

from mcp_learning_server.models import (
    Assessment,
    LearningLevel,
    MasteryStatus,
    Topic,
)
from mcp_learning_server.repositories.base import ProgressRepositoryError
from mcp_learning_server.repositories.local_progress import LocalProgressRepository


def test_new_student_has_local_default(tmp_path) -> None:
    repository = LocalProgressRepository(tmp_path / "progress.json")
    progress = repository.get("student-1")
    assert progress.student_id == "student-1"
    assert progress.level == LearningLevel.BEGINNER
    assert progress.assessments == []


def test_assessment_is_persisted_and_updates_level(tmp_path) -> None:
    path = tmp_path / "progress.json"
    repository = LocalProgressRepository(path)
    assessment = Assessment(
        topic=Topic.EMBEDDINGS,
        score=90,
        feedback="Comprende similitud vectorial.",
        recommendation="Continuar con RAG",
    )
    saved = repository.save_assessment("student-1", assessment)
    reloaded = LocalProgressRepository(path).get("student-1")
    assert saved.level == LearningLevel.ADVANCED
    assert reloaded.assessments[0].score == 90
    assert reloaded.studied_topics == [Topic.EMBEDDINGS]


def test_corrupted_repository_fails_explicitly(tmp_path) -> None:
    path = tmp_path / "progress.json"
    path.write_text("not-json", encoding="utf-8")
    repository = LocalProgressRepository(path)
    with pytest.raises(ProgressRepositoryError):
        repository.get("student-1")


def test_written_file_contains_no_unvalidated_wrapper(tmp_path) -> None:
    path = tmp_path / "progress.json"
    repository = LocalProgressRepository(path)
    repository.save_assessment(
        "student-1",
        Assessment(
            topic=Topic.RAG,
            score=70,
            feedback="Base correcta.",
            recommendation="Practicar recuperación.",
        ),
    )
    raw = json.loads(path.read_text(encoding="utf-8"))
    assert raw["student-1"]["student_id"] == "student-1"


def test_legacy_progress_is_migrated_when_read(tmp_path) -> None:
    path = tmp_path / "progress.json"
    path.write_text(
        json.dumps(
            {
                "legacy-student": {
                    "student_id": "legacy-student",
                    "level": "beginner",
                    "studied_topics": ["rag"],
                    "assessments": [
                        {
                            "topic": "rag",
                            "score": 92,
                            "feedback": "Comprensión sólida.",
                            "recommendation": "Continuar.",
                            "created_at": "2026-01-01T00:00:00Z",
                        }
                    ],
                    "recommendations": ["Continuar."],
                    "updated_at": "2026-01-01T00:00:00Z",
                }
            }
        ),
        encoding="utf-8",
    )

    progress = LocalProgressRepository(path).get("legacy-student")

    assert progress.level == LearningLevel.ADVANCED
    assert len(progress.topic_progress) == 1
    rag = progress.topic_progress[0]
    assert rag.topic == Topic.RAG
    assert rag.attempts == 1
    assert rag.best_score == 92
    assert rag.mastery_status == MasteryStatus.MASTERED
    assert rag.concepts == []


def test_topic_and_concept_progress_accumulates_attempts(tmp_path) -> None:
    repository = LocalProgressRepository(tmp_path / "progress.json")
    repository.save_assessment(
        "student-1",
        Assessment(
            topic=Topic.EMBEDDINGS,
            score=33.33,
            feedback="Intento parcial.",
            recommendation="Reforzar.",
            mastered_concepts=["vector"],
            pending_concepts=["similitud", "significado"],
        ),
    )
    saved = repository.save_assessment(
        "student-1",
        Assessment(
            topic=Topic.EMBEDDINGS,
            score=100,
            feedback="Completó los conceptos pendientes.",
            recommendation="Aplicar.",
            mastered_concepts=["similitud", "significado"],
        ),
    )

    topic = saved.topic_progress[0]
    assert topic.attempts == 2
    assert topic.best_score == 100
    assert topic.level == LearningLevel.ADVANCED
    assert topic.mastery_status == MasteryStatus.MASTERED
    assert topic.mastered_concepts == ["vector", "similitud", "significado"]
    assert topic.pending_concepts == []
    similarity = next(
        item for item in topic.concepts if item.concept == "similitud"
    )
    assert similarity.attempts == 2
    assert similarity.successful_attempts == 1
    assert similarity.mastery_status == MasteryStatus.MASTERED

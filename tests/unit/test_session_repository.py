import json
from datetime import UTC, datetime, timedelta

import pytest

from agent_app.models.chat import Quiz
from agent_app.services.sessions import (
    ConversationMessage,
    LocalSessionRepository,
    MessageRole,
    PendingEvaluation,
    StoredConversation,
)
from mcp_learning_server.models import Topic


def make_session(session_id: str = "session-1") -> StoredConversation:
    return StoredConversation(
        id=session_id,
        student_id="student-1",
        title="Aprender embeddings",
        topic=Topic.EMBEDDINGS,
        messages=[
            ConversationMessage(
                role=MessageRole.USER,
                label="Tú",
                content="Explícame embeddings",
            )
        ],
        pending_evaluation=PendingEvaluation(
            student_id="student-1",
            topic=Topic.EMBEDDINGS,
            quiz=Quiz(
                question="¿Qué es un embedding?",
                expected_keywords=["vector", "significado"],
            ),
            attempt=2,
        ),
    )


def test_local_session_repository_round_trip_keeps_private_quiz(tmp_path) -> None:
    path = tmp_path / "sessions.json"
    repository = LocalSessionRepository(path)
    repository.save(make_session())

    restarted = LocalSessionRepository(path)
    recovered = restarted.get("session-1", "student-1")
    raw = json.loads(path.read_text(encoding="utf-8"))

    assert recovered.pending_evaluation.attempt == 2
    assert recovered.pending_evaluation.quiz.expected_keywords == [
        "vector",
        "significado",
    ]
    assert raw["session-1"]["pending_evaluation"]["quiz"]["expected_keywords"]
    assert not list(tmp_path.glob("*.tmp"))


def test_local_session_repository_isolates_students(tmp_path) -> None:
    repository = LocalSessionRepository(tmp_path / "sessions.json")
    repository.save(make_session())

    assert repository.list("other-student") == []
    with pytest.raises(PermissionError, match="otro estudiante"):
        repository.get("session-1", "other-student")
    with pytest.raises(PermissionError, match="otro estudiante"):
        repository.delete("session-1", "other-student")


def test_local_session_repository_renames_archives_and_deletes(tmp_path) -> None:
    repository = LocalSessionRepository(tmp_path / "sessions.json")
    repository.save(make_session())

    renamed = repository.rename("session-1", "student-1", "Vectores semánticos")
    archived = repository.set_archived("session-1", "student-1", True)

    assert renamed.title == "Vectores semánticos"
    assert archived.archived_at is not None
    assert repository.list("student-1") == []
    assert len(repository.list("student-1", include_archived=True)) == 1

    repository.delete("session-1", "student-1")
    with pytest.raises(KeyError, match="conversación"):
        repository.get("session-1", "student-1")


def test_local_session_repository_applies_retention(tmp_path) -> None:
    now = datetime(2026, 1, 1, tzinfo=UTC)

    def clock() -> datetime:
        return now

    repository = LocalSessionRepository(
        tmp_path / "sessions.json",
        retention_days=1,
        clock=clock,
    )
    repository.save(make_session())
    now += timedelta(days=2)

    assert repository.list("student-1", include_archived=True) == []
    assert json.loads(repository.path.read_text(encoding="utf-8")) == {}

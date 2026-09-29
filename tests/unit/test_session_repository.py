import json
from datetime import UTC, datetime, timedelta

import pytest

from agent_app.models.activities import PracticeDifficulty, PracticeExercise
from agent_app.models.chat import ChatResponse, Quiz
from agent_app.services.sessions import (
    CHAT_REQUEST_RETENTION_HOURS,
    LEGACY_LEASE_GRACE_SECONDS,
    ConversationMessage,
    LocalSessionRepository,
    MessageRole,
    PendingEvaluation,
    PendingPractice,
    StoredConversation,
)
from mcp_learning_server.models import LearningLevel, StudentProgress, Topic


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
        pending_practice=PendingPractice(
            exercise=PracticeExercise(
                id="embeddings-practice-1",
                topic=Topic.EMBEDDINGS,
                round=1,
                based_on_attempts=1,
                difficulty=PracticeDifficulty.FOUNDATION,
                focus_concepts=["similitud"],
                title="Conecta las ideas esenciales",
                prompt="Explica para qué sirve la similitud.",
                hint="Relaciona dos elementos.",
            ),
            quiz=Quiz(
                question="Explica para qué sirve la similitud.",
                expected_keywords=["similitud"],
            ),
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
    assert recovered.pending_practice is not None
    assert recovered.pending_practice.quiz.expected_keywords == ["similitud"]
    assert raw["session-1"]["pending_practice"]["quiz"]["expected_keywords"]
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


def make_chat_response() -> ChatResponse:
    return ChatResponse(
        correlation_id="correlation-1",
        session_id="session-1",
        topic=Topic.EMBEDDINGS,
        level=LearningLevel.BEGINNER,
        answer="Los embeddings representan significado mediante vectores.",
        sources=["lesson.md"],
        progress=StudentProgress(student_id="student-1"),
        quiz=Quiz(
            question="¿Qué representa?",
            expected_keywords=["vector", "significado"],
        ),
        quiz_attempt=1,
        trace=[],
    )


def test_local_chat_requests_are_purged_when_they_expire(tmp_path) -> None:
    now = datetime(2026, 1, 1, tzinfo=UTC)
    repository = LocalSessionRepository(
        tmp_path / "sessions.json", clock=lambda: now
    )
    claim = repository.claim_chat_request(
        "browser-send-1", "student-1", "session-1", "fingerprint", 60
    )
    repository.complete_chat_request(
        "browser-send-1", "student-1", claim.claim_token or "", make_chat_response()
    )

    now += timedelta(hours=CHAT_REQUEST_RETENTION_HOURS - 1)
    assert repository.get_chat_request("browser-send-1", "student-1") is not None

    now += timedelta(hours=2)
    assert repository.get_chat_request("browser-send-1", "student-1") is None
    # La purga no sólo oculta el registro: lo borra del archivo, que si no
    # crecería sin límite.
    assert json.loads(
        repository.chat_requests_path.read_text(encoding="utf-8")
    ) == {}


def test_local_chat_requests_purge_records_without_expiry(tmp_path) -> None:
    """Los registros escritos antes de que existiera `expires_at` también se purgan."""

    now = datetime(2026, 1, 1, tzinfo=UTC)
    repository = LocalSessionRepository(
        tmp_path / "sessions.json", clock=lambda: now
    )
    claim = repository.claim_chat_request(
        "browser-send-1", "student-1", "session-1", "fingerprint", 60
    )
    repository.complete_chat_request(
        "browser-send-1", "student-1", claim.claim_token or "", make_chat_response()
    )
    stored = json.loads(repository.chat_requests_path.read_text(encoding="utf-8"))
    for record in stored.values():
        del record["expires_at"]
    repository.chat_requests_path.write_text(json.dumps(stored), encoding="utf-8")

    now += timedelta(hours=CHAT_REQUEST_RETENTION_HOURS + 1)
    assert repository.get_chat_request("browser-send-1", "student-1") is None


def test_local_legacy_pending_request_keeps_a_grace_period(tmp_path) -> None:
    """Un registro heredado sin lease no se puede robar de inmediato."""

    now = datetime(2026, 1, 1, tzinfo=UTC)
    repository = LocalSessionRepository(
        tmp_path / "sessions.json", clock=lambda: now
    )
    repository.claim_chat_request(
        "browser-send-1", "student-1", "session-1", "fingerprint", 60
    )
    stored = json.loads(repository.chat_requests_path.read_text(encoding="utf-8"))
    for record in stored.values():
        record["lease_expires_at"] = None
    repository.chat_requests_path.write_text(json.dumps(stored), encoding="utf-8")

    now += timedelta(seconds=LEGACY_LEASE_GRACE_SECONDS - 1)
    contended = repository.claim_chat_request(
        "browser-send-1", "student-1", "session-1", "fingerprint", 60
    )
    assert contended.acquired is False

    now += timedelta(seconds=2)
    recovered = repository.claim_chat_request(
        "browser-send-1", "student-1", "session-1", "fingerprint", 60
    )
    assert recovered.acquired is True
    assert recovered.claim_token is not None

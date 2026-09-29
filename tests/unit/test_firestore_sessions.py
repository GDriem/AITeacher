from datetime import UTC, datetime, timedelta

from google.api_core.exceptions import AlreadyExists, FailedPrecondition
import pytest

from agent_app.models.chat import ChatResponse, Quiz
from agent_app.services.sessions import (
    CHAT_REQUEST_RETENTION_HOURS,
    LEGACY_LEASE_GRACE_SECONDS,
    FirestoreSessionRepository,
    PendingEvaluation,
    StoredConversation,
)
from mcp_learning_server.models import LearningLevel, StudentProgress, Topic


class FakeSnapshot:
    def __init__(self, document, data, update_time=None):
        self.reference = document
        self._data = data
        self.exists = data is not None
        self.update_time = update_time

    def to_dict(self):
        return self._data


class FakeDocument:
    def __init__(self, client, collection, document_id):
        self.client = client
        self.collection = collection
        self.document_id = document_id

    def get(self):
        return FakeSnapshot(
            self,
            self.client.collections[self.collection].get(self.document_id),
            self.client.versions.get((self.collection, self.document_id)),
        )

    def set(self, data, option=None):
        key = (self.collection, self.document_id)
        if (
            option is not None
            and option._last_update_time != self.client.versions.get(key)
        ):
            raise FailedPrecondition("stale write")
        self.client.collections[self.collection][self.document_id] = data
        self.client.bump_version(key)

    def update(self, data, option=None):
        self.set(data, option=option)

    def create(self, data):
        collection = self.client.collections[self.collection]
        if self.document_id in collection:
            raise AlreadyExists("already exists")
        collection[self.document_id] = data
        self.client.bump_version((self.collection, self.document_id))

    def delete(self, option=None):
        key = (self.collection, self.document_id)
        if (
            option is not None
            and option._last_update_time != self.client.versions.get(key)
        ):
            raise FailedPrecondition("stale delete")
        self.client.collections[self.collection].pop(self.document_id, None)
        self.client.versions.pop(key, None)


class FakeQuery:
    def __init__(self, client, collection, value):
        self.client = client
        self.collection = collection
        self.value = value

    def stream(self):
        return [
            FakeSnapshot(
                FakeDocument(self.client, self.collection, session_id),
                data,
                self.client.versions.get((self.collection, session_id)),
            )
            for session_id, data in self.client.collections[self.collection].items()
            if data["student_id"] == self.value
        ]


class FakeCollection:
    def __init__(self, client, name):
        self.client = client
        self.name = name

    def document(self, document_id):
        return FakeDocument(self.client, self.name, document_id)

    def where(self, *, field_path, op_string, value):
        assert field_path == "student_id"
        assert op_string == "=="
        return FakeQuery(self.client, self.name, value)


class FakeFirestoreClient:
    def __init__(self):
        self.collections = {
            "learning_sessions": {},
            "learning_sessions_chat_requests": {},
        }
        self.versions = {}
        self.next_version = 1

    def bump_version(self, key):
        self.versions[key] = self.next_version
        self.next_version += 1

    def collection(self, name):
        assert name in self.collections
        return FakeCollection(self, name)


def make_session() -> StoredConversation:
    return StoredConversation(
        id="session-1",
        student_id="student-1",
        title="Embeddings",
        topic=Topic.EMBEDDINGS,
        pending_evaluation=PendingEvaluation(
            student_id="student-1",
            topic=Topic.EMBEDDINGS,
            quiz=Quiz(
                question="¿Qué representa?",
                expected_keywords=["vector", "significado"],
            ),
        ),
    )


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


def test_firestore_session_repository_round_trip_and_query() -> None:
    repository = FirestoreSessionRepository(FakeFirestoreClient())
    repository.save(make_session())

    recovered = repository.get("session-1", "student-1")
    listed = repository.list("student-1")

    assert recovered.pending_evaluation.quiz.expected_keywords == [
        "vector",
        "significado",
    ]
    assert [item.id for item in listed] == ["session-1"]


def test_firestore_session_repository_updates_and_deletes() -> None:
    repository = FirestoreSessionRepository(FakeFirestoreClient())
    repository.save(make_session())

    assert repository.rename(
        "session-1", "student-1", "Vectores"
    ).title == "Vectores"
    assert repository.set_archived(
        "session-1", "student-1", True
    ).archived_at is not None
    assert repository.list("student-1") == []
    assert len(repository.list("student-1", include_archived=True)) == 1

    repository.delete("session-1", "student-1")
    assert repository.list("student-1", include_archived=True) == []


def test_firestore_chat_request_claim_is_atomic_and_scoped_by_student() -> None:
    repository = FirestoreSessionRepository(FakeFirestoreClient())

    first = repository.claim_chat_request(
        "browser-send-1", "student-1", "session-1", "fingerprint", 60
    )
    retry = repository.claim_chat_request(
        "browser-send-1", "student-1", "different-session", "fingerprint", 60
    )
    other_student = repository.claim_chat_request(
        "browser-send-1", "student-2", "session-2", "fingerprint", 60
    )

    assert first.acquired is True
    assert retry.acquired is False
    assert retry.session_id == "session-1"
    assert other_student.acquired is True


def test_firestore_chat_request_atomically_recovers_expired_lease() -> None:
    now = datetime(2026, 9, 28, tzinfo=UTC)
    repository = FirestoreSessionRepository(FakeFirestoreClient(), clock=lambda: now)
    first = repository.claim_chat_request(
        "browser-send-1", "student-1", "session-1", "fingerprint", 30
    )

    now += timedelta(seconds=31)
    recovered = repository.claim_chat_request(
        "browser-send-1", "student-1", "different-session", "fingerprint", 30
    )

    assert recovered.acquired is True
    assert recovered.session_id == "session-1"
    assert recovered.claim_token != first.claim_token


def test_firestore_chat_request_rejects_request_id_reuse_for_other_payload() -> None:
    repository = FirestoreSessionRepository(FakeFirestoreClient())
    repository.claim_chat_request(
        "browser-send-1", "student-1", "session-1", "fingerprint-1", 60
    )

    with pytest.raises(ValueError, match="mensaje o una sesión diferente"):
        repository.claim_chat_request(
            "browser-send-1", "student-1", "session-1", "fingerprint-2", 60
        )


def test_firestore_chat_request_fences_previous_lease_owner() -> None:
    now = datetime(2026, 9, 28, tzinfo=UTC)
    repository = FirestoreSessionRepository(FakeFirestoreClient(), clock=lambda: now)
    first = repository.claim_chat_request(
        "browser-send-1", "student-1", "session-1", "fingerprint", 30
    )
    now += timedelta(seconds=31)
    recovered = repository.claim_chat_request(
        "browser-send-1", "student-1", "session-1", "fingerprint", 30
    )
    response = make_chat_response()

    with pytest.raises(PermissionError, match="lease"):
        repository.complete_chat_request(
            "browser-send-1",
            "student-1",
            first.claim_token or "",
            response,
        )
    repository.complete_chat_request(
        "browser-send-1",
        "student-1",
        recovered.claim_token or "",
        response,
    )

    record = repository.get_chat_request("browser-send-1", "student-1")
    assert record is not None
    assert record.response == response


def test_firestore_chat_request_reconciles_persisted_session_response() -> None:
    repository = FirestoreSessionRepository(FakeFirestoreClient())
    repository.claim_chat_request(
        "browser-send-1", "student-1", "session-1", "fingerprint", 60
    )
    response = make_chat_response()

    repository.reconcile_chat_request(
        "browser-send-1", "student-1", response
    )

    record = repository.get_chat_request("browser-send-1", "student-1")
    assert record is not None
    assert record.response == response


def test_firestore_chat_request_writes_native_timestamp_for_ttl() -> None:
    """`expires_at` debe ser Timestamp: la política TTL ignora cadenas ISO."""

    now = datetime(2026, 9, 28, tzinfo=UTC)
    client = FakeFirestoreClient()
    repository = FirestoreSessionRepository(client, clock=lambda: now)
    repository.claim_chat_request(
        "browser-send-1", "student-1", "session-1", "fingerprint", 60
    )

    stored = next(iter(client.collections["learning_sessions_chat_requests"].values()))
    assert isinstance(stored["expires_at"], datetime)
    assert stored["expires_at"] == now + timedelta(
        hours=CHAT_REQUEST_RETENTION_HOURS
    )
    # El resto del documento sigue siendo JSON, como antes.
    assert isinstance(stored["created_at"], str)


def test_firestore_chat_request_is_purged_when_it_expires() -> None:
    now = datetime(2026, 9, 28, tzinfo=UTC)
    client = FakeFirestoreClient()
    repository = FirestoreSessionRepository(client, clock=lambda: now)
    claim = repository.claim_chat_request(
        "browser-send-1", "student-1", "session-1", "fingerprint", 60
    )
    repository.complete_chat_request(
        "browser-send-1", "student-1", claim.claim_token or "", make_chat_response()
    )

    now += timedelta(hours=CHAT_REQUEST_RETENTION_HOURS + 1)
    assert repository.get_chat_request("browser-send-1", "student-1") is None
    assert client.collections["learning_sessions_chat_requests"] == {}


def test_firestore_legacy_pending_request_keeps_a_grace_period() -> None:
    now = datetime(2026, 9, 28, tzinfo=UTC)
    client = FakeFirestoreClient()
    repository = FirestoreSessionRepository(client, clock=lambda: now)
    repository.claim_chat_request(
        "browser-send-1", "student-1", "session-1", "fingerprint", 60
    )
    for stored in client.collections["learning_sessions_chat_requests"].values():
        stored["lease_expires_at"] = None

    now += timedelta(seconds=LEGACY_LEASE_GRACE_SECONDS - 1)
    assert (
        repository.claim_chat_request(
            "browser-send-1", "student-1", "session-1", "fingerprint", 60
        ).acquired
        is False
    )

    now += timedelta(seconds=2)
    assert (
        repository.claim_chat_request(
            "browser-send-1", "student-1", "session-1", "fingerprint", 60
        ).acquired
        is True
    )

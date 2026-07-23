from agent_app.models.chat import Quiz
from agent_app.services.sessions import (
    FirestoreSessionRepository,
    PendingEvaluation,
    StoredConversation,
)
from mcp_learning_server.models import Topic


class FakeSnapshot:
    def __init__(self, document, data):
        self.reference = document
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return self._data


class FakeDocument:
    def __init__(self, client, document_id):
        self.client = client
        self.document_id = document_id

    def get(self):
        return FakeSnapshot(self, self.client.data.get(self.document_id))

    def set(self, data):
        self.client.data[self.document_id] = data

    def delete(self):
        self.client.data.pop(self.document_id, None)


class FakeQuery:
    def __init__(self, client, value):
        self.client = client
        self.value = value

    def stream(self):
        return [
            FakeSnapshot(FakeDocument(self.client, session_id), data)
            for session_id, data in self.client.data.items()
            if data["student_id"] == self.value
        ]


class FakeCollection:
    def __init__(self, client):
        self.client = client

    def document(self, document_id):
        return FakeDocument(self.client, document_id)

    def where(self, *, field_path, op_string, value):
        assert field_path == "student_id"
        assert op_string == "=="
        return FakeQuery(self.client, value)


class FakeFirestoreClient:
    def __init__(self):
        self.data = {}

    def collection(self, name):
        assert name == "learning_sessions"
        return FakeCollection(self)


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

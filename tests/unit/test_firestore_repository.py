from mcp_learning_server.models import Assessment, LearningLevel, Topic
from mcp_learning_server.repositories.firestore_progress import (
    FirestoreProgressRepository,
)


class FakeSnapshot:
    def __init__(self, data):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return self._data


class FakeDocument:
    def __init__(self, client, document_id):
        self.client = client
        self.document_id = document_id

    def get(self, transaction=None):
        return FakeSnapshot(self.client.data.get(self.document_id))


class FakeCollection:
    def __init__(self, client):
        self.client = client

    def document(self, document_id):
        return FakeDocument(self.client, document_id)


class FakeTransaction:
    def __init__(self, client):
        self.client = client
        self.pending = None
        self.in_progress = False

    def _begin(self):
        assert not self.in_progress
        self.in_progress = True

    def set(self, document, data):
        assert self.in_progress
        self.pending = (document.document_id, data)

    def _commit(self):
        assert self.in_progress
        document_id, data = self.pending
        self.client.data[document_id] = data
        self.in_progress = False

    def _rollback(self):
        self.in_progress = False


class FakeFirestoreClient:
    def __init__(self):
        self.data = {}

    def collection(self, name):
        assert name == "student_progress"
        return FakeCollection(self)

    def transaction(self):
        return FakeTransaction(self)


def test_firestore_adapter_persists_through_transaction() -> None:
    client = FakeFirestoreClient()
    repository = FirestoreProgressRepository(client)
    saved = repository.save_assessment(
        "cloud-student",
        Assessment(
            topic=Topic.MCP,
            score=75,
            feedback="Distingue protocolo y agente.",
            recommendation="Practicar tool calling.",
        ),
    )
    reloaded = repository.get("cloud-student")
    assert saved.level == LearningLevel.INTERMEDIATE
    assert reloaded.studied_topics == [Topic.MCP]
    assert reloaded.assessments[0].score == 75


def test_firestore_adapter_returns_default_for_unknown_student() -> None:
    repository = FirestoreProgressRepository(FakeFirestoreClient())
    assert repository.get("new-student").student_id == "new-student"


"""Firestore nunca debe ejecutarse en el hilo del event loop.

El cliente de `google-cloud-firestore` es síncrono: cada `get()`/`set()` es una
llamada de red bloqueante. Si un handler `async` la invoca directamente, congela
el loop entero de la instancia —serializando todas las peticiones concurrentes e
interrumpiendo el bombeo de audio del WebSocket de voz—. Estas pruebas fijan ese
contrato con dobles cuyo `get()` duerme con `time.sleep`.
"""

import asyncio
import threading
import time

import httpx
import pytest

from agent_app.api.main import create_app
from agent_app.config import Settings
from agent_app.models.chat import Quiz
from agent_app.providers.mock import MockModelProvider
from agent_app.services.auth import (
    AuthService,
    FirestoreStudentProfileRepository,
    GoogleIdentity,
    SessionSigner,
    StudentProfile,
)
from agent_app.services.learning_tools import LocalLearningTools
from agent_app.services.sessions import (
    FirestoreSessionRepository,
    PendingEvaluation,
    StoredConversation,
    _serialize_session,
)
from mcp_learning_server.models import Topic

LATENCY_SECONDS = 0.15


class BlockingCallRecorder:
    """Registra desde qué hilo se llamó a Firestore y simula la latencia de red."""

    def __init__(self, latency: float = LATENCY_SECONDS) -> None:
        self.latency = latency
        self.threads: list[int] = []
        self._lock = threading.Lock()

    def record(self) -> None:
        with self._lock:
            self.threads.append(threading.get_ident())
        time.sleep(self.latency)


class SlowSnapshot:
    def __init__(self, data: dict | None) -> None:
        self._data = data
        self.exists = data is not None
        self.update_time = None

    def to_dict(self) -> dict | None:
        return self._data


class SlowDocument:
    def __init__(self, client: "SlowFirestoreClient", document_id: str) -> None:
        self._client = client
        self._document_id = document_id

    def get(self) -> SlowSnapshot:
        self._client.recorder.record()
        return SlowSnapshot(self._client.documents.get(self._document_id))

    def set(self, data: dict, option=None) -> None:
        self._client.recorder.record()
        self._client.documents[self._document_id] = data


class SlowCollection:
    def __init__(self, client: "SlowFirestoreClient") -> None:
        self._client = client

    def document(self, document_id: str) -> SlowDocument:
        return SlowDocument(self._client, document_id)


class SlowFirestoreClient:
    def __init__(self, documents: dict[str, dict]) -> None:
        self.documents = documents
        self.recorder = BlockingCallRecorder()

    def collection(self, name: str) -> SlowCollection:
        return SlowCollection(self)


def make_stored_session() -> StoredConversation:
    return StoredConversation(
        id="session-1",
        student_id="student-1",
        title="Embeddings",
        topic=Topic.EMBEDDINGS,
        pending_evaluation=PendingEvaluation(
            student_id="student-1",
            topic=Topic.EMBEDDINGS,
            quiz=Quiz(
                question="¿Qué representa un embedding?",
                expected_keywords=["vector", "significado"],
            ),
        ),
    )


class AlwaysValidVerifier:
    def verify(self, credential: str) -> GoogleIdentity:  # pragma: no cover
        raise AssertionError("El login no participa en estas pruebas")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_firestore_sessions_run_off_the_event_loop_thread(
    learning_service,
) -> None:
    client_double = SlowFirestoreClient(
        {"session-1": _serialize_session(make_stored_session())}
    )
    app = create_app(
        Settings(),
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
        sessions=FirestoreSessionRepository(client_double),
    )
    loop_thread = threading.get_ident()

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://agent.local"
    ) as http:
        started = time.perf_counter()
        first, second = await asyncio.gather(
            http.get("/api/sessions/session-1", params={"student_id": "student-1"}),
            http.get("/api/sessions/session-1", params={"student_id": "student-1"}),
        )
        elapsed = time.perf_counter() - started

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["title"] == "Embeddings"

    # Criterio principal (determinista): ninguna llamada corrió en el loop.
    assert len(client_double.recorder.threads) == 2
    assert loop_thread not in client_double.recorder.threads
    assert len(set(client_double.recorder.threads)) == 2

    # Criterio secundario: dos peticiones concurrentes tardan lo que una, no el
    # doble. El margen es amplio a propósito para no volverse frágil en CI.
    assert elapsed < 2 * LATENCY_SECONDS


@pytest.mark.integration
@pytest.mark.asyncio
async def test_firestore_student_profiles_run_off_the_event_loop_thread(
    learning_service,
) -> None:
    profile = StudentProfile(
        student_id="student-1",
        provider_subject="google-subject",
        email="student@example.com",
        display_name="Estudiante",
    )
    client_double = SlowFirestoreClient({"student-1": profile.model_dump(mode="json")})
    signer = SessionSigner("s" * 32)
    token, _ = signer.issue("student-1")
    auth_service = AuthService(
        AlwaysValidVerifier(),
        FirestoreStudentProfileRepository(client_double),
        signer,
    )
    app = create_app(
        Settings(
            google_client_id="web-client.apps.googleusercontent.com",
            app_session_secret="s" * 32,
        ),
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
        sessions=FirestoreSessionRepository(SlowFirestoreClient({})),
        auth_service=auth_service,
    )
    loop_thread = threading.get_ident()

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://agent.local",
        cookies={"ait_session": token},
    ) as http:
        started = time.perf_counter()
        first, second = await asyncio.gather(
            http.get("/api/auth/status"),
            http.get("/api/auth/status"),
        )
        elapsed = time.perf_counter() - started

    assert first.json()["authenticated"] is True
    assert second.json()["authenticated"] is True
    assert len(client_double.recorder.threads) == 2
    assert loop_thread not in client_double.recorder.threads
    assert elapsed < 2 * LATENCY_SECONDS


@pytest.mark.integration
@pytest.mark.asyncio
async def test_orchestrator_chat_persists_sessions_off_the_event_loop_thread(
    learning_service,
) -> None:
    client_double = SlowFirestoreClient({})
    app = create_app(
        Settings(),
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
        sessions=FirestoreSessionRepository(client_double),
    )
    loop_thread = threading.get_ident()

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://agent.local"
    ) as http:
        response = await http.post(
            "/api/chat",
            json={"student_id": "student-1", "message": "Explícame embeddings"},
        )

    assert response.status_code == 200
    # El orquestador escribe la sesión al terminar el turno: esa escritura
    # también es red bloqueante y debe salir del loop.
    assert client_double.recorder.threads
    assert loop_thread not in client_double.recorder.threads

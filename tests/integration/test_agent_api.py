import asyncio
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from agent_app.api.main import _chat_request_fingerprint, create_app
from agent_app.config import ModelProviderName, Settings
from agent_app.models.chat import ChatRequest, ChatResponse
from agent_app.providers.mock import MockModelProvider
from agent_app.services.authoring import LocalAuthoringGateway
from agent_app.services.learning_tools import (
    LearningToolsUnavailable,
    LocalLearningTools,
)
from agent_app.services.sessions import LocalSessionRepository, utc_now
from mcp_learning_server.models import LearningContent, Topic
from mcp_learning_server.repositories.content_authoring import (
    LocalContentAuthoringRepository,
)
from mcp_learning_server.services.authoring import ContentAuthoringService
from mcp_learning_server.services.content_store import InMemoryContentStore


class UnavailableLearningTools(LocalLearningTools):
    async def list_available_topics(self):
        raise RuntimeError("MCP unavailable")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_selected_level_survives_restart_and_is_validated(learning_service, tmp_path):
    sessions_path = tmp_path / "level-sessions.json"

    def build_app():
        return create_app(
            Settings(model_provider=ModelProviderName.MOCK),
            tools=LocalLearningTools(learning_service),
            provider=MockModelProvider(),
            sessions=LocalSessionRepository(sessions_path),
        )

    body = {"student_id": "level-student", "message": "Enséñame embeddings", "level": "advanced"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=build_app()), base_url="http://agent.local") as client:
        first = await client.post("/api/chat", json=body)
        assert first.status_code == 200
        assert first.json()["level"] == "advanced"
        invalid = await client.post("/api/chat", json={**body, "level": "expert"})
        assert invalid.status_code == 422

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=build_app()), base_url="http://agent.local") as client:
        follow_up = await client.post("/api/chat", json={
            "student_id": "level-student", "session_id": first.json()["session_id"],
            "message": "Explícame con otro ejemplo",
        })
        assert follow_up.status_code == 200
        assert follow_up.json()["level"] == "advanced"

    assert _chat_request_fingerprint(ChatRequest(**body)) != _chat_request_fingerprint(ChatRequest(**{**body, "level": "beginner"}))


class TimedOutLearningTools(LocalLearningTools):
    async def get_student_progress(self, student_id):
        raise LearningToolsUnavailable("MCP no respondió") from TimeoutError(
            "agotó el presupuesto MCP"
        )

    async def list_available_topics(self):
        raise LearningToolsUnavailable("MCP no respondió") from TimeoutError(
            "agotó el presupuesto MCP"
        )


class TimedOutModelProvider(MockModelProvider):
    async def generate(self, request):
        raise TimeoutError("el modelo agotó su presupuesto")


class BlockingMockModelProvider(MockModelProvider):
    def __init__(self) -> None:
        self.calls = 0
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def generate(self, request):
        self.calls += 1
        self.started.set()
        await self.release.wait()
        return await super().generate(request)


class CrashAfterSessionSaveRepository(LocalSessionRepository):
    def __init__(self, path) -> None:
        super().__init__(path)
        self._simulate_crash = True
        self._skip_release = False

    def complete_chat_request(
        self,
        request_id: str,
        student_id: str,
        claim_token: str,
        response: ChatResponse,
    ) -> None:
        if self._simulate_crash:
            self._simulate_crash = False
            self._skip_release = True
            raise RuntimeError("simulated process crash after session save")
        super().complete_chat_request(
            request_id, student_id, claim_token, response
        )

    def release_chat_request(
        self, request_id: str, student_id: str, claim_token: str
    ) -> None:
        if self._skip_release:
            self._skip_release = False
            return
        super().release_chat_request(request_id, student_id, claim_token)


class StolenLeaseRepository(LocalSessionRepository):
    """Simula que el lease vence y otro proceso reclama la misma solicitud."""

    def __init__(self, path) -> None:
        self._now = utc_now()
        super().__init__(path, clock=lambda: self._now)
        self._steal = True

    def complete_chat_request(
        self,
        request_id: str,
        student_id: str,
        claim_token: str,
        response: ChatResponse,
    ) -> None:
        if self._steal:
            self._steal = False
            record = super().get_chat_request(request_id, student_id)
            assert record is not None
            assert record.lease_expires_at is not None
            self._now = record.lease_expires_at + timedelta(seconds=1)
            super().claim_chat_request(
                request_id,
                student_id,
                record.session_id,
                record.request_fingerprint,
                60.0,
            )
        super().complete_chat_request(
            request_id, student_id, claim_token, response
        )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_chat_returns_result_when_lease_is_stolen_mid_flight(
    learning_service, tmp_path
) -> None:
    provider = BlockingMockModelProvider()
    provider.release.set()
    sessions = StolenLeaseRepository(tmp_path / "sessions.json")
    app = create_app(
        Settings(model_timeout_seconds=2),
        tools=LocalLearningTools(learning_service),
        provider=provider,
        sessions=sessions,
    )
    body = {
        "student_id": "retry-student",
        "message": "Quiero aprender embeddings",
        "request_id": "browser-send-stolen-lease",
    }

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://agent.local",
    ) as client:
        stolen = await client.post("/api/chat", json=body)
        retried = await client.post("/api/chat", json=body)

    # El trabajo terminó y el orquestador ya persistió la respuesta: perder el
    # lease no debe convertirse en un 403 para el alumno.
    assert stolen.status_code == 200
    assert retried.status_code == 200
    assert retried.json()["answer"] == stolen.json()["answer"]
    assert provider.calls == 1
    record = sessions.get_chat_request(body["request_id"], body["student_id"])
    assert record is not None
    assert record.status.value == "completed"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_chat_retry_reuses_persisted_idempotent_result(
    learning_service, tmp_path
) -> None:
    provider = BlockingMockModelProvider()
    sessions_path = tmp_path / "sessions.json"
    sessions = LocalSessionRepository(sessions_path)
    app = create_app(
        Settings(model_timeout_seconds=2),
        tools=LocalLearningTools(learning_service),
        provider=provider,
        sessions=sessions,
    )
    body = {
        "student_id": "retry-student",
        "message": "Quiero aprender embeddings",
        "request_id": "browser-send-1",
    }

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://agent.local"
    ) as client:
        original = asyncio.create_task(client.post("/api/chat", json=body))
        await provider.started.wait()
        retry = asyncio.create_task(client.post("/api/chat", json=body))
        await asyncio.sleep(0.01)
        provider.release.set()
        original_response, retry_response = await asyncio.gather(original, retry)
        sessions.chat_requests_path.unlink()
        recovered_after_interrupted_completion = await client.post(
            "/api/chat", json=body
        )

    assert original_response.status_code == 200
    assert retry_response.status_code == 200
    assert retry_response.json() == original_response.json()
    assert recovered_after_interrupted_completion.json() == original_response.json()
    assert provider.calls == 1
    session_id = original_response.json()["session_id"]
    recovered = LocalSessionRepository(sessions_path).get(
        session_id, "retry-student"
    )
    assert [message.content for message in recovered.messages].count(
        "Quiero aprender embeddings"
    ) == 1
    record = LocalSessionRepository(sessions_path).get_chat_request(
        "browser-send-1", "retry-student"
    )
    assert record is not None
    assert record.response is not None
    assert record.response.session_id == session_id


@pytest.mark.integration
@pytest.mark.asyncio
async def test_chat_retry_recovers_claim_left_before_session_save(
    learning_service, tmp_path
) -> None:
    now = datetime(2026, 9, 28, tzinfo=UTC)
    sessions = LocalSessionRepository(tmp_path / "sessions.json", clock=lambda: now)
    body = {
        "student_id": "retry-student",
        "message": "Quiero aprender embeddings",
        "request_id": "browser-send-before-save",
    }
    fingerprint = _chat_request_fingerprint(ChatRequest.model_validate(body))
    abandoned = sessions.claim_chat_request(
        body["request_id"], body["student_id"], "stable-session", fingerprint, 30
    )
    now += timedelta(seconds=31)
    provider = BlockingMockModelProvider()
    provider.release.set()
    app = create_app(
        Settings(model_timeout_seconds=2),
        tools=LocalLearningTools(learning_service),
        provider=provider,
        sessions=sessions,
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://agent.local"
    ) as client:
        response = await client.post("/api/chat", json=body)

    assert response.status_code == 200
    assert response.json()["session_id"] == "stable-session"
    assert provider.calls == 1
    recovered = sessions.get_chat_request(
        body["request_id"], body["student_id"]
    )
    assert recovered is not None
    assert recovered.response is not None
    assert recovered.claim_token is None
    assert recovered.claim_token != abandoned.claim_token


@pytest.mark.integration
@pytest.mark.asyncio
async def test_chat_retry_reconciles_crash_after_session_save(
    learning_service, tmp_path
) -> None:
    provider = BlockingMockModelProvider()
    provider.release.set()
    sessions = CrashAfterSessionSaveRepository(tmp_path / "sessions.json")
    app = create_app(
        Settings(model_timeout_seconds=2),
        tools=LocalLearningTools(learning_service),
        provider=provider,
        sessions=sessions,
    )
    body = {
        "student_id": "retry-student",
        "message": "Quiero aprender embeddings",
        "request_id": "browser-send-after-save",
    }

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://agent.local",
    ) as client:
        interrupted = await client.post("/api/chat", json=body)
        recovered = await client.post("/api/chat", json=body)

    assert interrupted.status_code == 500
    assert recovered.status_code == 200
    assert provider.calls == 1
    record = sessions.get_chat_request(
        body["request_id"], body["student_id"]
    )
    assert record is not None
    assert record.response is not None
    assert record.status.value == "completed"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_chat_rejects_reused_request_id_with_different_payload(
    learning_service, tmp_path
) -> None:
    sessions = LocalSessionRepository(tmp_path / "sessions.json")
    app = create_app(
        Settings(model_timeout_seconds=2),
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
        sessions=sessions,
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://agent.local"
    ) as client:
        first = await client.post(
            "/api/chat",
            json={
                "student_id": "retry-student",
                "message": "Quiero aprender embeddings",
                "request_id": "reused-browser-send",
            },
        )
        conflict = await client.post(
            "/api/chat",
            json={
                "student_id": "retry-student",
                "message": "Quiero aprender agentes",
                "request_id": "reused-browser-send",
            },
        )

    assert first.status_code == 200
    assert conflict.status_code == 422
    assert "mensaje o una sesión diferente" in conflict.json()["detail"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_readiness_reports_unavailable_learning_service(
    learning_service,
) -> None:
    app = create_app(
        Settings(mcp_use_local_adapter=True),
        tools=UnavailableLearningTools(learning_service),
        provider=MockModelProvider(),
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://agent.local",
    ) as client:
        response = await client.get("/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "service": "agent-app",
        "dependency": "learning-mcp",
    }


@pytest.mark.integration
@pytest.mark.asyncio
async def test_learning_tools_timeout_degrades_without_affecting_health(
    learning_service,
) -> None:
    app = create_app(
        Settings(mcp_use_local_adapter=True),
        tools=TimedOutLearningTools(learning_service),
        provider=MockModelProvider(),
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://agent.local",
    ) as client:
        chat = await client.post(
            "/api/chat",
            json={
                "student_id": "student-1",
                "message": "Quiero aprender embeddings",
            },
        )
        health = await client.get("/health")
        readiness = await client.get("/ready")

    assert chat.status_code == 503
    assert "detail" in chat.json()
    assert health.status_code == 200
    assert readiness.status_code == 503


@pytest.mark.integration
@pytest.mark.asyncio
async def test_model_timeout_is_not_reported_as_catalog_unavailable(
    learning_service,
) -> None:
    app = create_app(
        Settings(mcp_use_local_adapter=True),
        tools=LocalLearningTools(learning_service),
        provider=TimedOutModelProvider(),
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://agent.local",
    ) as client:
        response = await client.post(
            "/api/chat",
            json={
                "student_id": "student-1",
                "message": "Quiero aprender embeddings",
            },
        )

    assert response.status_code == 500
    assert "catálogo de aprendizaje" not in response.text


@pytest.mark.integration
@pytest.mark.asyncio
async def test_complete_text_flow_without_cloud_credentials(learning_service) -> None:
    settings = Settings(
        model_provider=ModelProviderName.MOCK,
        mcp_use_local_adapter=True,
    )
    app = create_app(
        settings,
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://agent.local"
    ) as client:
        health = await client.get("/health")
        readiness = await client.get("/ready")
        capabilities = await client.get("/api/capabilities")
        topics = await client.get(
            "/api/topics", params={"student_id": "student-1"}
        )
        voice_worklet = await client.get("/static/pcm-capture-worklet.js")
        assert health.status_code == 200
        assert readiness.json()["status"] == "ready"
        assert capabilities.json() == {
            "text": True,
            "voice": False,
            "voice_model": None,
            "authoring": False,
        }
        assert topics.status_code == 200
        catalog = topics.json()
        assert catalog["total_topics"] == len(Topic)
        assert {
            topic["subject"] for topic in catalog["topics"]
        } == {"artificial-intelligence", "english", "networks"}
        assert catalog["completed_topics"] == 0
        assert catalog["in_progress_topics"] == 0
        assert catalog["available_topics"] == 3
        assert catalog["blocked_topics"] == len(Topic) - 3
        assert catalog["completion_percentage"] == 0
        assert catalog["recommendation"]["topic"] == "artificial-intelligence"
        assert catalog["recommendation"]["reason"]
        assert len(catalog["topics"]) == catalog["total_topics"]
        assert {
            topic["category"] for topic in catalog["topics"]
        } == {
            "fundamentos",
            "modelos-y-datos",
            "agentes-y-herramientas",
            "calidad-y-seguridad",
            "produccion",
            "comunicacion",
            "vocabulario",
            "gramatica",
            "enrutamiento",
        }
        embedding = next(
            topic for topic in catalog["topics"] if topic["topic"] == "embeddings"
        )
        assert embedding["status"] == "blocked"
        assert embedding["prerequisites"] == ["tokens"]
        assert embedding["unmet_prerequisites"] == ["tokens"]
        assert embedding["available_levels"] == ["beginner", "intermediate"]
        assert "microphone=(self)" in topics.headers["permissions-policy"]
        assert topics.headers["content-encoding"] == "gzip"
        assert voice_worklet.status_code == 200
        assert voice_worklet.headers["cache-control"].startswith(
            "public, max-age=3600"
        )
        assert voice_worklet.headers["x-content-type-options"] == "nosniff"
        assert 'registerProcessor("pcm-capture"' in voice_worklet.text
        chat = await client.post(
            "/api/chat",
            headers={"x-correlation-id": "demo-123"},
            json={
                "student_id": "student-1",
                "message": f"Quiero aprender sobre {embedding['title']}",
            },
        )
        assert chat.status_code == 200, chat.text
        payload = chat.json()
        assert payload["correlation_id"] == "demo-123"
        assert payload["topic"] == "embeddings"
        assert payload["quiz"]["question"]
        assert "expected_keywords" not in payload["quiz"]
        assert chat.headers["x-correlation-id"] == "demo-123"

        evaluated = await client.post(
            "/api/evaluate",
            json={
                "student_id": "student-1",
                "session_id": payload["session_id"],
                "answer": "Un embedding es un vector de significado y se compara por similitud.",
            },
        )
        assert evaluated.status_code == 200, evaluated.text
        assert evaluated.json()["score"] == 100
        assert evaluated.json()["status"] == "mastered"
        assert evaluated.json()["rubric"]["evaluation_mode"] == (
            "deterministic_fallback"
        )
        assert evaluated.json()["result_explanation"]
        assert evaluated.json()["strengths"]
        assert evaluated.json()["learning_context"]
        assert "expected_keywords" not in evaluated.json()["next_quiz"]
        assert evaluated.json()["progress"]["studied_topics"] == ["embeddings"]
        mastery = evaluated.json()["progress"]["topic_progress"][0]
        assert mastery["topic"] == "embeddings"
        assert mastery["attempts"] == 1
        assert mastery["best_score"] == 100
        assert mastery["level"] == "advanced"
        assert mastery["mastery_status"] == "mastered"
        assert mastery["mastered_concepts"] == [
            "vector",
            "similitud",
            "significado",
        ]
        assert mastery["pending_concepts"] == []

        metrics = await client.get("/api/observability")
        observability = metrics.json()
        assert metrics.status_code == 200
        assert observability["status"] == "ok"
        assert observability["http"]["requests"] >= 6
        assert observability["model"]["provider"] == "mock"
        assert observability["model"]["calls"] >= 2
        assert observability["model"]["input_tokens"] > 0
        assert observability["model"]["tokens_estimated"] is True
        assert {
            item["name"] for item in observability["activities"]
        } >= {"guided_explanation", "topic_evaluation"}
        assert "student-1" not in metrics.text
        assert "embedding es un vector" not in metrics.text

        updated_topics = await client.get(
            "/api/topics", params={"student_id": "student-1"}
        )
        updated_catalog = updated_topics.json()
        completed_embedding = next(
            topic
            for topic in updated_catalog["topics"]
            if topic["topic"] == "embeddings"
        )
        assert updated_catalog["completed_topics"] == 1
        assert updated_catalog["completion_percentage"] == pytest.approx(round(100 / len(Topic), 2))
        assert completed_embedding["status"] == "completed"
        assert completed_embedding["progress"]["level"] == "advanced"
        assert completed_embedding["progress"]["mastery_status"] == "mastered"
        assert updated_catalog["recommendation"]["topic"] == "artificial-intelligence"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_recommendation_changes_after_mastering_prerequisite(
    learning_service,
) -> None:
    app = create_app(
        Settings(),
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://agent.local"
    ) as client:
        initial = await client.get(
            "/api/topics", params={"student_id": "adaptive-student"}
        )
        chat = await client.post(
            "/api/chat",
            json={
                "student_id": "adaptive-student",
                "message": "Quiero aprender artificial intelligence",
            },
        )
        evaluated = await client.post(
            "/api/evaluate",
            json={
                "student_id": "adaptive-student",
                "session_id": chat.json()["session_id"],
                "answer": (
                    "Artificial intelligence es un sistema que permite realizar "
                    "tareas que normalmente requieren capacidades humanas usando "
                    "reglas o patrones aprendidos."
                ),
            },
        )
        updated = await client.get(
            "/api/topics", params={"student_id": "adaptive-student"}
        )

    assert initial.json()["recommendation"]["topic"] == "artificial-intelligence"
    assert evaluated.json()["score"] == 100
    assert updated.json()["recommendation"]["topic"] == "machine-learning"
    assert updated.json()["completed_topics"] == 1
    assert {
        topic["topic"]
        for topic in updated.json()["topics"]
        if topic["status"] == "available"
    } == {
        "machine-learning",
        "nlp",
        "responsible-ai",
        "english-greetings-introductions",
        "routing-fundamentals",
    }


@pytest.mark.integration
@pytest.mark.asyncio
async def test_invalid_message_is_handled(learning_service) -> None:
    app = create_app(
        Settings(),
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://agent.local"
    ) as client:
        response = await client.post(
            "/api/chat",
            json={"student_id": "student-1", "message": "Hola, sorpréndeme"},
        )
    assert response.status_code == 422
    assert "tema" in response.json()["detail"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_session_recovers_after_restart_and_is_authorized(
    learning_service, tmp_path
) -> None:
    path = tmp_path / "sessions.json"
    settings = Settings(app_sessions_path=str(path))
    tools = LocalLearningTools(learning_service)
    first_app = create_app(
        settings,
        tools=tools,
        provider=MockModelProvider(),
        sessions=LocalSessionRepository(path),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=first_app),
        base_url="http://agent.local",
    ) as client:
        chat = await client.post(
            "/api/chat",
            json={
                "student_id": "persistent-student",
                "message": "Explícame embeddings",
            },
        )
        assert chat.status_code == 200
        session_id = chat.json()["session_id"]

    restarted_app = create_app(
        settings,
        tools=tools,
        provider=MockModelProvider(),
        sessions=LocalSessionRepository(path),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=restarted_app),
        base_url="http://agent.local",
    ) as client:
        listed = await client.get(
            "/api/sessions", params={"student_id": "persistent-student"}
        )
        recovered = await client.get(
            f"/api/sessions/{session_id}",
            params={"student_id": "persistent-student"},
        )
        forbidden = await client.get(
            f"/api/sessions/{session_id}",
            params={"student_id": "other-student"},
        )
        evaluated = await client.post(
            "/api/evaluate",
            json={
                "student_id": "persistent-student",
                "session_id": session_id,
                "answer": (
                    "Es un vector que representa significado y permite comparar "
                    "elementos por similitud."
                ),
            },
        )

    assert listed.status_code == 200
    assert listed.json()["retention_days"] == 365
    assert listed.json()["sessions"][0]["id"] == session_id
    assert recovered.status_code == 200
    assert recovered.json()["topic"] == "embeddings"
    assert recovered.json()["message_count"] == 2
    assert recovered.json()["pending_quiz"]["attempt"] == 1
    assert len(recovered.json()["messages"]) == 2
    assert "expected_keywords" not in recovered.text
    assert forbidden.status_code == 403
    assert evaluated.status_code == 200
    assert evaluated.json()["score"] == 100


@pytest.mark.integration
@pytest.mark.asyncio
async def test_session_can_be_renamed_archived_restored_and_deleted(
    learning_service, tmp_path
) -> None:
    repository = LocalSessionRepository(tmp_path / "sessions.json")
    app = create_app(
        Settings(),
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
        sessions=repository,
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://agent.local"
    ) as client:
        chat = await client.post(
            "/api/chat",
            json={"student_id": "student-1", "message": "Explícame embeddings"},
        )
        session_id = chat.json()["session_id"]
        renamed = await client.patch(
            f"/api/sessions/{session_id}",
            json={"student_id": "student-1", "title": "Vectores semánticos"},
        )
        archived = await client.patch(
            f"/api/sessions/{session_id}",
            json={"student_id": "student-1", "archived": True},
        )
        active = await client.get(
            "/api/sessions", params={"student_id": "student-1"}
        )
        all_sessions = await client.get(
            "/api/sessions",
            params={"student_id": "student-1", "include_archived": True},
        )
        blocked_chat = await client.post(
            "/api/chat",
            json={
                "student_id": "student-1",
                "session_id": session_id,
                "message": "Explícamelo más fácil",
            },
        )
        restored = await client.patch(
            f"/api/sessions/{session_id}",
            json={"student_id": "student-1", "archived": False},
        )
        deleted = await client.delete(
            f"/api/sessions/{session_id}",
            params={"student_id": "student-1"},
        )
        missing = await client.get(
            f"/api/sessions/{session_id}",
            params={"student_id": "student-1"},
        )

    assert renamed.json()["title"] == "Vectores semánticos"
    assert archived.json()["archived_at"] is not None
    assert active.json()["sessions"] == []
    assert len(all_sessions.json()["sessions"]) == 1
    assert blocked_chat.status_code == 422
    assert restored.json()["archived_at"] is None
    assert deleted.status_code == 204
    assert missing.status_code == 404


@pytest.mark.integration
@pytest.mark.asyncio
async def test_practice_and_projects_are_available_without_losing_main_quiz(
    learning_service,
    tmp_path,
) -> None:
    sessions_path = tmp_path / "sessions.json"
    app = create_app(
        Settings(app_sessions_path=str(sessions_path)),
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://agent.local"
    ) as client:
        projects = await client.get("/api/projects")
        chat = await client.post(
            "/api/chat",
            json={"student_id": "practice-api", "message": "Explícame embeddings"},
        )
        session_id = chat.json()["session_id"]
        main_question = chat.json()["quiz"]["question"]
        practice = await client.post(
            "/api/practice/start",
            json={
                "student_id": "practice-api",
                "session_id": session_id,
            },
        )
        practice_evaluation = await client.post(
            "/api/practice/evaluate",
            json={
                "student_id": "practice-api",
                "session_id": session_id,
                "answer": (
                    "Un vector representa el significado y la similitud permite "
                    "comparar elementos relacionados."
                ),
            },
        )
        recovered = await client.get(
            f"/api/sessions/{session_id}",
            params={"student_id": "practice-api"},
        )
        project = projects.json()["projects"][0]
        project_evaluation = await client.post(
            f"/api/projects/{project['id']}/evaluate",
            json={
                "student_id": "practice-api",
                "submission": (
                    "Primero recupera evidencia y después genera una respuesta. "
                    "Cita las fuentes, valida permisos y mide errores y latencia."
                ),
            },
        )

    assert projects.status_code == 200
    assert len(projects.json()["projects"]) == 3
    assert all(len(item["topics"]) >= 2 for item in projects.json()["projects"])
    assert practice.status_code == 200
    assert practice.json()["main_quiz"]["question"] == main_question
    assert practice.json()["exercise"]["focus_concepts"]
    assert practice_evaluation.status_code == 200
    assert practice_evaluation.json()["main_quiz"]["question"] == main_question
    assert practice_evaluation.json()["next_exercise"]["round"] == 2
    assert recovered.json()["pending_quiz"]["question"] == main_question
    assert recovered.json()["pending_practice"]["exercise"]["round"] == 2
    assert "expected_keywords" not in recovered.text
    assert project_evaluation.status_code == 200
    assert len(project_evaluation.json()["rubric"]) == 4


@pytest.mark.integration
@pytest.mark.asyncio
async def test_authoring_api_is_protected_versioned_and_updates_published_content(
    learning_service,
    tmp_path,
) -> None:
    store = InMemoryContentStore()
    authoring_service = ContentAuthoringService(
        LocalContentAuthoringRepository(tmp_path / "authoring.json", []),
        store,
    )
    app = create_app(
        Settings(app_authoring_token="panel-secret"),
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
        authoring=LocalAuthoringGateway(authoring_service),
    )
    content = LearningContent(
        id="mcp-authoring-test",
        topic="model-context-protocol",
        title="MCP desde autoría",
        level="beginner",
        text=(
            "MCP define un protocolo para descubrir recursos y herramientas "
            "con contratos explícitos entre aplicaciones y servidores."
        ),
        source="Equipo curricular AITeacher",
        keywords=["protocolo", "herramientas"],
    ).model_dump(mode="json")
    headers = {"x-authoring-token": "panel-secret"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://agent.local",
    ) as client:
        unauthorized = await client.get("/api/authoring/lessons")
        created = await client.post(
            "/api/authoring/lessons",
            headers=headers,
            json={"content": content, "author": "editora"},
        )
        preview = await client.get(
            "/api/authoring/lessons/mcp-authoring-test/preview",
            headers=headers,
        )
        published = await client.post(
            "/api/authoring/lessons/mcp-authoring-test/publish",
            headers=headers,
            json={"author": "editora"},
        )
        reverted = await client.post(
            "/api/authoring/lessons/mcp-authoring-test/revert",
            headers=headers,
            json={"author": "revisor", "version": 1},
        )

    assert unauthorized.status_code == 401
    assert created.status_code == 201
    assert created.json()["published"] is False
    assert preview.json()["title"] == "MCP desde autoría"
    assert published.json()["published"] is True
    assert published.json()["version"] == 2
    assert published.json()["published_content"]["id"] == "mcp-authoring-test"
    assert reverted.json()["published"] is False
    assert reverted.json()["version"] == 3
    assert store.all() == ()

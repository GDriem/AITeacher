import httpx
import pytest

from agent_app.api.main import create_app
from agent_app.config import Settings
from agent_app.providers.mock import MockModelProvider
from agent_app.services.learning_tools import LocalLearningTools
from agent_app.services.rate_limit import StudentRateLimiter


def build_test_app(learning_service, tmp_path, limit: int):
    return create_app(
        Settings(
            app_sessions_path=str(tmp_path / "sessions.json"),
            model_rate_limit_requests_per_minute=limit,
        ),
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
    )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_exceeding_rate_limit_returns_429_with_retry_after(
    learning_service, tmp_path
) -> None:
    app = build_test_app(learning_service, tmp_path, limit=1)
    payload = {"student_id": "alumno-limitado", "message": "Explícame embeddings"}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://agent.local",
    ) as client:
        accepted = await client.post("/api/chat", json=payload)
        rejected = await client.post("/api/chat", json=payload)

    assert accepted.status_code == 200
    assert rejected.status_code == 429
    assert rejected.json() == {
        "detail": "Has enviado demasiadas solicitudes. Inténtalo de nuevo más tarde."
    }
    assert int(rejected.headers["Retry-After"]) >= 1


@pytest.mark.integration
@pytest.mark.asyncio
async def test_rate_limit_is_separate_for_each_student(
    learning_service, tmp_path
) -> None:
    app = build_test_app(learning_service, tmp_path, limit=1)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://agent.local",
    ) as client:
        first = await client.post(
            "/api/chat",
            json={"student_id": "alumno-uno", "message": "Explícame embeddings"},
        )
        second = await client.post(
            "/api/chat",
            json={"student_id": "alumno-dos", "message": "Explícame embeddings"},
        )

    assert first.status_code == 200
    assert second.status_code == 200


def test_zero_disables_rate_limit_for_a_thousand_requests() -> None:
    limiter = StudentRateLimiter(0)

    for _ in range(1_000):
        limiter.check("alumno-demo")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_health_and_capabilities_never_receive_429(
    learning_service, tmp_path
) -> None:
    app = build_test_app(learning_service, tmp_path, limit=1)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://agent.local",
    ) as client:
        health_responses = [await client.get("/healthz") for _ in range(3)]
        capabilities_responses = [
            await client.get("/api/capabilities") for _ in range(3)
        ]

    assert all(response.status_code == 200 for response in health_responses)
    assert all(response.status_code == 200 for response in capabilities_responses)

import httpx
import pytest

from agent_app.api.main import create_app
from agent_app.config import ModelProviderName, Settings
from agent_app.providers.mock import MockModelProvider
from agent_app.services.auth import (
    AuthService,
    AuthenticationError,
    GoogleIdentity,
    InMemoryStudentProfileRepository,
    SessionSigner,
)
from agent_app.services.learning_tools import LocalLearningTools
from agent_app.services.sessions import LocalSessionRepository


class FakeGoogleVerifier:
    def verify(self, credential: str) -> GoogleIdentity:
        if credential != "valid-google-credential-" + "x" * 100:
            raise AuthenticationError("La credencial de Google no es válida")
        return GoogleIdentity(
            subject="verified-google-subject",
            email="student@example.com",
            display_name="Estudiante Verificada",
            picture_url="https://example.com/student.jpg",
        )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_google_session_owns_student_routes_and_rejects_spoofing(
    learning_service, tmp_path
) -> None:
    settings = Settings(
        google_client_id="web-client.apps.googleusercontent.com",
        app_session_secret="s" * 32,
    )
    auth = AuthService(
        FakeGoogleVerifier(),
        InMemoryStudentProfileRepository(),
        SessionSigner("s" * 32),
    )
    app = create_app(
        settings,
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
        sessions=LocalSessionRepository(tmp_path / "sessions.json"),
        auth_service=auth,
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://agent.local",
    ) as client:
        anonymous_status = await client.get("/api/auth/status")
        unauthorized = await client.get(
            "/api/topics", params={"student_id": "student-selected-by-browser"}
        )
        login = await client.post(
            "/api/auth/google",
            json={"credential": "valid-google-credential-" + "x" * 100},
        )
        profile = login.json()
        topics = await client.get(
            "/api/topics", params={"student_id": "impersonated-student"}
        )
        chat = await client.post(
            "/api/chat",
            json={
                "student_id": "impersonated-student",
                "message": "Explícame embeddings",
            },
        )
        session = await client.get(
            f"/api/sessions/{chat.json()['session_id']}",
            params={"student_id": "impersonated-student"},
        )
        authenticated_status = await client.get("/api/auth/status")
        logout = await client.post("/api/auth/logout")
        after_logout = await client.get("/api/topics")

    assert anonymous_status.json() == {
        "enabled": True,
        "authenticated": False,
        "google_client_id": "web-client.apps.googleusercontent.com",
        "profile": None,
    }
    assert "https://accounts.google.com" in anonymous_status.headers[
        "content-security-policy"
    ]
    assert anonymous_status.headers["cross-origin-opener-policy"] == (
        "same-origin-allow-popups"
    )
    assert unauthorized.status_code == 401
    assert login.status_code == 200
    assert "HttpOnly" in login.headers["set-cookie"]
    assert "SameSite=lax" in login.headers["set-cookie"]
    assert profile["student_id"].startswith("google-")
    assert topics.status_code == 200
    assert topics.json()["progress"]["student_id"] == profile["student_id"]
    assert chat.status_code == 200
    assert chat.json()["progress"]["student_id"] == profile["student_id"]
    assert session.status_code == 200
    assert session.json()["student_id"] == profile["student_id"]
    assert authenticated_status.json()["profile"] == profile
    assert logout.status_code == 204
    assert after_logout.status_code == 401


@pytest.mark.integration
@pytest.mark.asyncio
async def test_auth_bootstrap_contracts_support_disabled_guest_and_expired_session(
    learning_service,
) -> None:
    disabled_app = create_app(
        Settings(
            google_client_id=None,
            app_session_secret=None,
            model_provider=ModelProviderName.MOCK,
        ),
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=disabled_app),
        base_url="http://agent.local",
    ) as client:
        disabled_status = await client.get("/api/auth/status")
        capabilities = await client.get("/api/capabilities")

    enabled_app = create_app(
        Settings(
            google_client_id="web-client.apps.googleusercontent.com",
            app_session_secret="s" * 32,
        ),
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
        auth_service=AuthService(
            FakeGoogleVerifier(),
            InMemoryStudentProfileRepository(),
            SessionSigner("s" * 32),
        ),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=enabled_app),
        base_url="http://agent.local",
    ) as client:
        guest_status = await client.get("/api/auth/status")
        client.cookies.set("ait_session", "expired-or-invalid")
        expired_status = await client.get("/api/auth/status")
        protected = await client.get(
            "/api/topics",
            params={"student_id": "browser-student"},
        )

    assert disabled_status.json() == {
        "enabled": False,
        "authenticated": False,
        "google_client_id": None,
        "profile": None,
    }
    assert capabilities.json() == {
        "text": True,
        "voice": False,
        "voice_model": None,
        "authoring": False,
    }
    assert guest_status.json() == expired_status.json() == {
        "enabled": True,
        "authenticated": False,
        "google_client_id": "web-client.apps.googleusercontent.com",
        "profile": None,
    }
    assert protected.status_code == 401
    assert protected.json()["detail"] == "La sesión no es válida"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_observability_requires_session_only_when_auth_is_enabled(
    learning_service,
) -> None:
    disabled_app = create_app(
        Settings(
            google_client_id=None,
            app_session_secret=None,
            model_provider=ModelProviderName.MOCK,
        ),
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=disabled_app),
        base_url="http://agent.local",
    ) as client:
        local_observability = await client.get("/api/observability")

    enabled_app = create_app(
        Settings(
            google_client_id="web-client.apps.googleusercontent.com",
            app_session_secret="s" * 32,
        ),
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
        auth_service=AuthService(
            FakeGoogleVerifier(),
            InMemoryStudentProfileRepository(),
            SessionSigner("s" * 32),
        ),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=enabled_app),
        base_url="http://agent.local",
    ) as client:
        anonymous_observability = await client.get("/api/observability")
        login = await client.post(
            "/api/auth/google",
            json={"credential": "valid-google-credential-" + "x" * 100},
        )
        authenticated_observability = await client.get("/api/observability")

    assert local_observability.status_code == 200
    assert anonymous_observability.status_code == 401
    assert login.status_code == 200
    assert authenticated_observability.status_code == 200


def test_google_auth_requires_a_session_secret() -> None:
    with pytest.raises(RuntimeError, match="APP_SESSION_SECRET"):
        create_app(
            Settings(
                google_client_id="configured-client",
                app_session_secret=None,
            )
        )

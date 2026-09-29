from types import SimpleNamespace

import pytest

from agent_app.config import (
    DEVELOPER_GEMINI_LIVE_MODEL,
    VERTEX_GEMINI_LIVE_MODEL,
    ModelProviderName,
    Settings,
)
from agent_app.services.live_voice import GeminiLiveBridge, VoiceUnavailable
from agent_app.services.learning_tools import RemoteMcpLearningTools


def test_voice_is_disabled_by_default_without_credentials(monkeypatch) -> None:
    for var in (
        "GOOGLE_API_KEY",
        "MODEL_PROVIDER",
        "GOOGLE_CLOUD_PROJECT",
        "GOOGLE_GENAI_USE_VERTEXAI",
    ):
        monkeypatch.delenv(var, raising=False)
    settings = Settings(_env_file=None)
    assert settings.voice_enabled is False
    with pytest.raises(VoiceUnavailable):
        GeminiLiveBridge(settings)


def test_voice_can_be_enabled_for_gemini_without_exposing_key() -> None:
    settings = Settings(
        _env_file=None,
        model_provider=ModelProviderName.GEMINI,
        google_api_key="test-only-key",
    )
    assert settings.voice_enabled is True
    assert settings.resolved_gemini_live_model == DEVELOPER_GEMINI_LIVE_MODEL
    assert "google_api_key" not in {
        "text": True,
        "voice": settings.voice_enabled,
        "voice_model": settings.gemini_live_model,
    }


def test_vertex_text_and_live_models_use_compatible_default_locations() -> None:
    settings = Settings(_env_file=None, google_genai_use_vertexai=True)

    assert settings.gemini_model == "gemini-3.5-flash-lite"
    assert settings.google_cloud_location == "us"
    assert settings.resolved_gemini_live_model == VERTEX_GEMINI_LIVE_MODEL
    assert settings.google_cloud_live_location == "us-central1"


def test_voice_is_disabled_when_vertex_project_is_missing() -> None:
    settings = Settings(
        _env_file=None,
        model_provider=ModelProviderName.GEMINI,
        google_genai_use_vertexai=True,
    )

    assert settings.voice_enabled is False


@pytest.mark.parametrize("use_vertex", [False, True])
def test_explicit_live_model_overrides_backend_default(use_vertex: bool) -> None:
    settings = Settings(
        _env_file=None,
        google_genai_use_vertexai=use_vertex,
        gemini_live_model="gemini-live-custom-release",
    )

    assert settings.resolved_gemini_live_model == "gemini-live-custom-release"


def test_bridge_uses_developer_api_default_with_api_key() -> None:
    bridge = GeminiLiveBridge(
        Settings(
            _env_file=None,
            model_provider=ModelProviderName.GEMINI,
            google_api_key="test-only-key",
        )
    )

    assert bridge.model == DEVELOPER_GEMINI_LIVE_MODEL


def test_bridge_uses_vertex_default_with_cloud_project() -> None:
    bridge = GeminiLiveBridge(
        Settings(
            _env_file=None,
            model_provider=ModelProviderName.GEMINI,
            google_genai_use_vertexai=True,
            google_cloud_project="test-project",
        )
    )

    assert bridge.model == VERTEX_GEMINI_LIVE_MODEL


def test_voice_prompt_is_conversational_and_receives_bounded_session_context() -> None:
    settings = Settings(
        _env_file=None,
        model_provider=ModelProviderName.GEMINI,
        google_api_key="test-only-key",
    )
    bridge = GeminiLiveBridge(
        settings,
        session_context="Tema actual: embeddings. " + ("detalle " * 400),
    )

    instruction = bridge._system_instruction()

    assert "turnos breves" in instruction
    assert "puede interrumpirte" in instruction
    assert "Tema actual: embeddings" in instruction
    assert len(bridge.session_context) <= 2_000


@pytest.mark.asyncio
async def test_voice_receiver_stays_connected_across_model_turns() -> None:
    def live_message(*, transcript: str | None = None, turn_complete: bool = False):
        return SimpleNamespace(
            server_content=SimpleNamespace(
                input_transcription=None,
                output_transcription=(
                    SimpleNamespace(text=transcript) if transcript else None
                ),
                model_turn=None,
                interrupted=False,
                turn_complete=turn_complete,
            )
        )

    class FakeSession:
        def __init__(self) -> None:
            self.turns = iter(
                [
                    [live_message(transcript="Primera respuesta"), live_message(turn_complete=True)],
                    [live_message(transcript="Segunda respuesta"), live_message(turn_complete=True)],
                    [],
                ]
            )

        def receive(self):
            async def messages():
                for message in next(self.turns):
                    yield message

            return messages()

    class FakeWebSocket:
        def __init__(self) -> None:
            self.messages = []

        async def send_json(self, message) -> None:
            self.messages.append(message)

        async def send_bytes(self, _data: bytes) -> None:
            raise AssertionError("Esta prueba no envía audio")

    websocket = FakeWebSocket()

    await GeminiLiveBridge._model_to_browser(websocket, FakeSession())

    assert websocket.messages == [
        {"type": "transcript", "role": "tutor", "text": "Primera respuesta"},
        {"type": "turn_complete"},
        {"type": "transcript", "role": "tutor", "text": "Segunda respuesta"},
        {"type": "turn_complete"},
    ]


@pytest.mark.asyncio
async def test_cloud_run_identity_token_uses_configured_audience(monkeypatch) -> None:
    from google.oauth2 import id_token

    audiences = []

    def fake_fetch(request, audience):
        audiences.append(audience)
        return "signed-test-token"

    monkeypatch.setattr(id_token, "fetch_id_token", fake_fetch)
    client = RemoteMcpLearningTools(
        "https://mcp.example/mcp/", auth_audience="https://mcp.example"
    )
    assert await client._identity_token() == "signed-test-token"
    assert audiences == ["https://mcp.example"]

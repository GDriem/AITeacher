import pytest

from agent_app.config import ModelProviderName, Settings
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
        model_provider=ModelProviderName.GEMINI,
        google_api_key="test-only-key",
    )
    assert settings.voice_enabled is True
    assert "google_api_key" not in {
        "text": True,
        "voice": settings.voice_enabled,
        "voice_model": settings.gemini_live_model,
    }


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

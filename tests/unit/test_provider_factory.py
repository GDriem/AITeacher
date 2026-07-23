import pytest

from agent_app.config import ModelProviderName, Settings
from agent_app.providers.factory import create_model_provider
from agent_app.providers.foundry import FoundryModelProvider
from agent_app.providers.mock import MockModelProvider


def test_mock_provider_is_selected_without_credentials() -> None:
    provider = create_model_provider(Settings(model_provider=ModelProviderName.MOCK))
    assert isinstance(provider, MockModelProvider)


def test_foundry_provider_is_isolated_behind_factory() -> None:
    provider = create_model_provider(
        Settings(
            model_provider=ModelProviderName.FOUNDRY,
            foundry_endpoint="https://example.services.ai.azure.com/api/projects/demo",
            foundry_model_deployment="demo-model",
        )
    )
    assert isinstance(provider, FoundryModelProvider)


def test_foundry_requires_project_endpoint_and_deployment() -> None:
    with pytest.raises(ValueError, match="FOUNDRY_ENDPOINT"):
        create_model_provider(Settings(model_provider=ModelProviderName.FOUNDRY))


def test_gemini_requires_explicit_credentials() -> None:
    with pytest.raises(ValueError, match="GOOGLE_API_KEY"):
        create_model_provider(
            Settings(model_provider=ModelProviderName.GEMINI, google_api_key=None)
        )


def test_unknown_provider_is_rejected_by_settings() -> None:
    with pytest.raises(ValueError):
        Settings(model_provider="unknown")

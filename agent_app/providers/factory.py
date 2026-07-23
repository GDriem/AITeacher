from agent_app.config import ModelProviderName, Settings
from agent_app.providers.base import ModelProvider
from agent_app.providers.foundry import FoundryModelProvider
from agent_app.providers.gemini import GeminiModelProvider
from agent_app.providers.mock import MockModelProvider


def create_model_provider(settings: Settings) -> ModelProvider:
    match settings.model_provider:
        case ModelProviderName.GEMINI:
            return GeminiModelProvider(settings)
        case ModelProviderName.FOUNDRY:
            return FoundryModelProvider(settings)
        case ModelProviderName.MOCK:
            return MockModelProvider()
    raise ValueError(f"Proveedor no soportado: {settings.model_provider}")

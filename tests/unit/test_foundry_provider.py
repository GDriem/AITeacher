from types import SimpleNamespace

import pytest

from agent_app.config import ModelProviderName, Settings
from agent_app.providers.base import ModelRequest
from agent_app.providers.foundry import FoundryModelProvider, _responses_base_url


class FakeCredential:
    def __init__(self):
        self.scopes = []

    def get_token(self, scope):
        self.scopes.append(scope)
        return SimpleNamespace(token="entra-test-token")


class FakeResponses:
    def __init__(self):
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(output_text="Respuesta desde Foundry")


class FakeClient:
    def __init__(self):
        self.responses = FakeResponses()
        self.closed = False

    async def close(self):
        self.closed = True


def test_project_endpoint_is_converted_to_stable_responses_base_url() -> None:
    assert _responses_base_url(
        "https://demo.services.ai.azure.com/api/projects/tutor"
    ) == "https://demo.services.ai.azure.com/api/projects/tutor/openai/v1/"
    assert _responses_base_url(
        "https://demo.services.ai.azure.com/api/projects/tutor/openai/v1/"
    ).endswith("/openai/v1/")


@pytest.mark.asyncio
async def test_foundry_uses_entra_and_responses_api_contract() -> None:
    credential = FakeCredential()
    fake_client = FakeClient()
    client_args = []

    def factory(token, base_url, timeout):
        client_args.append((token, base_url, timeout))
        return fake_client

    provider = FoundryModelProvider(
        Settings(
            model_provider=ModelProviderName.FOUNDRY,
            foundry_endpoint="https://demo.services.ai.azure.com/api/projects/tutor",
            foundry_model_deployment="gpt-demo",
        ),
        credential=credential,
        client_factory=factory,
    )
    result = await provider.generate(
        ModelRequest(system_instruction="Sé breve", prompt="Explica embeddings")
    )
    assert result == "Respuesta desde Foundry"
    assert credential.scopes == ["https://ai.azure.com/.default"]
    assert client_args[0][0] == "entra-test-token"
    assert fake_client.responses.calls == [
        {
            "model": "gpt-demo",
            "instructions": "Sé breve",
            "input": "Explica embeddings",
        }
    ]
    assert fake_client.closed is True

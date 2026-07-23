from types import SimpleNamespace

import pytest

from agent_app.providers.base import ModelRequest
from agent_app.providers.gemini import GeminiModelProvider


class FakeModels:
    def __init__(self) -> None:
        self.calls = []

    async def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(text='{"score": 4}')


@pytest.mark.asyncio
async def test_gemini_requests_native_json_schema_output() -> None:
    models = FakeModels()
    provider = GeminiModelProvider.__new__(GeminiModelProvider)
    provider.client = SimpleNamespace(aio=SimpleNamespace(models=models))
    provider.model = "gemini-test"
    provider.timeout = 1
    schema = {
        "type": "object",
        "properties": {"score": {"type": "integer"}},
        "required": ["score"],
    }

    result = await provider.generate(
        ModelRequest(
            system_instruction="Devuelve JSON.",
            prompt="Evalúa esta respuesta.",
            temperature=0,
            response_json_schema=schema,
        )
    )

    assert result == '{"score": 4}'
    config = models.calls[0]["config"]
    assert config.response_mime_type == "application/json"
    assert config.response_json_schema == schema

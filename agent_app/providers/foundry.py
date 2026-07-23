"""Microsoft Foundry mediante endpoint de proyecto y Responses API estable."""

import asyncio
import inspect
from typing import Any, Callable

from agent_app.config import Settings
from agent_app.providers.base import ModelRequest


class FoundryModelProvider:
    name = "foundry"

    def __init__(
        self,
        settings: Settings,
        credential: Any | None = None,
        client_factory: Callable[[str, str, float], Any] | None = None,
    ) -> None:
        if not settings.foundry_endpoint:
            raise ValueError("FOUNDRY_ENDPOINT es requerido")
        if not settings.foundry_model_deployment:
            raise ValueError("FOUNDRY_MODEL_DEPLOYMENT es requerido")
        if credential is None:
            from azure.identity import DefaultAzureCredential

            credential = DefaultAzureCredential()
        self.credential = credential
        self.endpoint = _responses_base_url(settings.foundry_endpoint)
        self.deployment = settings.foundry_model_deployment
        self.scope = settings.foundry_scope
        self.timeout = settings.model_timeout_seconds
        self.client_factory = client_factory or _default_client_factory

    async def generate(self, request: ModelRequest) -> str:
        async with asyncio.timeout(self.timeout):
            token = await asyncio.to_thread(self.credential.get_token, self.scope)
            client = self.client_factory(token.token, self.endpoint, self.timeout)
            try:
                response = await client.responses.create(
                    model=self.deployment,
                    instructions=request.system_instruction,
                    input=request.prompt,
                )
            finally:
                close = getattr(client, "close", None)
                if close:
                    result = close()
                    if inspect.isawaitable(result):
                        await result
        text = response.output_text
        if not text or not text.strip():
            raise ValueError("Foundry devolvió una respuesta vacía")
        return text.strip()


def _responses_base_url(endpoint: str) -> str:
    normalized = endpoint.rstrip("/")
    if normalized.endswith("/openai/v1"):
        return f"{normalized}/"
    return f"{normalized}/openai/v1/"


def _default_client_factory(token: str, base_url: str, timeout: float):
    from openai import AsyncOpenAI

    return AsyncOpenAI(api_key=token, base_url=base_url, timeout=timeout)

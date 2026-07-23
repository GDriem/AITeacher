"""Proveedor Gemini mediante el Google Gen AI SDK oficial."""

import asyncio

from google import genai
from google.genai import types

from agent_app.config import Settings
from agent_app.providers.base import ModelRequest


class GeminiModelProvider:
    name = "gemini"

    def __init__(self, settings: Settings) -> None:
        if settings.google_genai_use_vertexai:
            if not settings.google_cloud_project:
                raise ValueError("GOOGLE_CLOUD_PROJECT es requerido para Vertex AI")
            self.client = genai.Client(
                vertexai=True,
                project=settings.google_cloud_project,
                location=settings.google_cloud_location,
            )
        else:
            if not settings.google_api_key:
                raise ValueError("GOOGLE_API_KEY es requerido para Gemini Developer API")
            self.client = genai.Client(api_key=settings.google_api_key)
        self.model = settings.gemini_model
        self.timeout = settings.model_timeout_seconds

    async def generate(self, request: ModelRequest) -> str:
        response_config = {
            "system_instruction": request.system_instruction,
            "temperature": request.temperature,
        }
        if request.response_json_schema is not None:
            response_config.update(
                {
                    "response_mime_type": "application/json",
                    "response_json_schema": request.response_json_schema,
                }
            )
        async with asyncio.timeout(self.timeout):
            response = await self.client.aio.models.generate_content(
                model=self.model,
                contents=request.prompt,
                config=types.GenerateContentConfig(**response_config),
            )
        text = response.text
        if not text or not text.strip():
            raise ValueError("Gemini devolvió una respuesta vacía")
        return text.strip()


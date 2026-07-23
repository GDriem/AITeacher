"""Cliente de herramientas: adaptador local y cliente MCP remoto intercambiables."""

from __future__ import annotations

import asyncio
import json
from typing import Any, Protocol

import httpx

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from mcp_learning_server.models import (
    LearningLevel,
    LearningPath,
    SaveResultResponse,
    SearchResult,
    StudentProgress,
    TopicSummary,
)
from mcp_learning_server.services.learning import LearningService


class LearningTools(Protocol):
    async def get_student_progress(self, student_id: str) -> StudentProgress: ...

    async def search_learning_content(
        self, topic: str, level: LearningLevel
    ) -> list[SearchResult]: ...

    async def get_learning_path(self, student_id: str) -> LearningPath: ...

    async def save_learning_result(
        self,
        student_id: str,
        topic: str,
        score: float,
        feedback: str,
        recommendation: str,
        mastered_concepts: list[str] | None = None,
        pending_concepts: list[str] | None = None,
    ) -> SaveResultResponse: ...

    async def list_available_topics(self) -> list[TopicSummary]: ...


class LocalLearningTools:
    """Mismo contrato que MCP, sin transporte; se usa para pruebas y plan B."""

    def __init__(self, service: LearningService) -> None:
        self.service = service

    async def get_student_progress(self, student_id: str) -> StudentProgress:
        return self.service.get_student_progress(student_id)

    async def search_learning_content(
        self, topic: str, level: LearningLevel
    ) -> list[SearchResult]:
        return self.service.search_learning_content(topic, level)

    async def get_learning_path(self, student_id: str) -> LearningPath:
        return self.service.get_learning_path(student_id)

    async def save_learning_result(
        self,
        student_id: str,
        topic: str,
        score: float,
        feedback: str,
        recommendation: str,
        mastered_concepts: list[str] | None = None,
        pending_concepts: list[str] | None = None,
    ) -> SaveResultResponse:
        return self.service.save_learning_result(
            student_id,
            topic,
            score,
            feedback,
            recommendation,
            mastered_concepts,
            pending_concepts,
        )

    async def list_available_topics(self) -> list[TopicSummary]:
        return self.service.list_available_topics()


class RemoteMcpLearningTools:
    def __init__(
        self,
        url: str,
        timeout_seconds: float = 5,
        auth_audience: str | None = None,
    ) -> None:
        self.url = url
        self.timeout_seconds = timeout_seconds
        self.auth_audience = auth_audience

    async def _call(self, name: str, arguments: dict[str, Any]) -> Any:
        headers: dict[str, str] = {}
        if self.auth_audience:
            headers["Authorization"] = f"Bearer {await self._identity_token()}"
        async with asyncio.timeout(self.timeout_seconds):
            async with httpx.AsyncClient(headers=headers) as http_client:
                async with streamable_http_client(
                    self.url, http_client=http_client
                ) as (read, write, _):
                    async with ClientSession(read, write) as session:
                        await session.initialize()
                        result = await session.call_tool(name, arguments=arguments)
        if result.isError:
            message = result.content[0].text if result.content else "Error MCP"
            raise RuntimeError(f"{name}: {message}")
        structured = result.structuredContent
        if structured is None:
            text_blocks = [
                block.text for block in result.content if hasattr(block, "text")
            ]
            if not text_blocks:
                raise RuntimeError(f"{name}: respuesta MCP sin datos estructurados")
            try:
                structured = json.loads(text_blocks[0])
            except json.JSONDecodeError as exc:
                raise RuntimeError(
                    f"{name}: el contenido MCP no contiene JSON válido"
                ) from exc
        return structured.get("result", structured)

    async def _identity_token(self) -> str:
        from google.auth.transport.requests import Request
        from google.oauth2 import id_token

        return await asyncio.to_thread(
            id_token.fetch_id_token, Request(), self.auth_audience
        )

    async def get_student_progress(self, student_id: str) -> StudentProgress:
        data = await self._call("get_student_progress", {"student_id": student_id})
        return StudentProgress.model_validate(data)

    async def search_learning_content(
        self, topic: str, level: LearningLevel
    ) -> list[SearchResult]:
        data = await self._call(
            "search_learning_content", {"topic": topic, "level": level.value}
        )
        return [SearchResult.model_validate(item) for item in data]

    async def get_learning_path(self, student_id: str) -> LearningPath:
        data = await self._call("get_learning_path", {"student_id": student_id})
        return LearningPath.model_validate(data)

    async def save_learning_result(
        self,
        student_id: str,
        topic: str,
        score: float,
        feedback: str,
        recommendation: str,
        mastered_concepts: list[str] | None = None,
        pending_concepts: list[str] | None = None,
    ) -> SaveResultResponse:
        data = await self._call(
            "save_learning_result",
            {
                "student_id": student_id,
                "topic": topic,
                "score": score,
                "feedback": feedback,
                "recommendation": recommendation,
                "mastered_concepts": mastered_concepts or [],
                "pending_concepts": pending_concepts or [],
            },
        )
        return SaveResultResponse.model_validate(data)

    async def list_available_topics(self) -> list[TopicSummary]:
        data = await self._call("list_available_topics", {})
        return [TopicSummary.model_validate(item) for item in data]

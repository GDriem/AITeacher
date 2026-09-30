"""Cliente de herramientas: adaptador local y cliente MCP remoto intercambiables."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import Callable
from typing import Any, Protocol

import httpx

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from mcp_learning_server.models import (
    EvaluationRubric,
    LearningLevel,
    LearningPath,
    SaveResultResponse,
    SearchResult,
    StudentProgress,
    TopicSummary,
)
from mcp_learning_server.services.learning import LearningService


class LearningToolsUnavailable(RuntimeError):
    """Las herramientas de aprendizaje no están disponibles temporalmente."""


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
        rubric: EvaluationRubric | None = None,
        result_explanation: str | None = None,
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
        rubric: EvaluationRubric | None = None,
        result_explanation: str | None = None,
    ) -> SaveResultResponse:
        return self.service.save_learning_result(
            student_id,
            topic,
            score,
            feedback,
            recommendation,
            mastered_concepts,
            pending_concepts,
            rubric,
            result_explanation,
        )

    async def list_available_topics(self) -> list[TopicSummary]:
        return self.service.list_available_topics()


class RemoteMcpLearningTools:
    _TOKEN_LIFETIME_SECONDS = 60 * 60
    _TOKEN_REFRESH_MARGIN_SECONDS = 5 * 60

    def __init__(
        self,
        url: str,
        timeout_seconds: float = 5,
        auth_audience: str | None = None,
        *,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.url = url
        self.timeout_seconds = timeout_seconds
        self.auth_audience = auth_audience
        self._clock = clock
        self._cached_identity_token: str | None = None
        self._identity_token_expires_at = 0.0
        self._identity_token_lock = asyncio.Lock()
        self._http_client: httpx.AsyncClient | None = None

    def _get_http_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient()
        return self._http_client

    async def aclose(self) -> None:
        client = self._http_client
        self._http_client = None
        self._cached_identity_token = None
        self._identity_token_expires_at = 0.0
        if client is not None:
            await client.aclose()

    async def _call(self, name: str, arguments: dict[str, Any]) -> Any:
        http_client = self._get_http_client()
        if self.auth_audience:
            # La obtención del token queda fuera del presupuesto de la llamada MCP.
            token = await self._identity_token()
            http_client.headers["Authorization"] = f"Bearer {token}"
        try:
            async with asyncio.timeout(self.timeout_seconds):
                async with streamable_http_client(
                    self.url, http_client=http_client
                ) as (read, write, _):
                    async with ClientSession(read, write) as session:
                        await session.initialize()
                        result = await session.call_tool(name, arguments=arguments)
        except (TimeoutError, httpx.HTTPError) as exc:
            raise LearningToolsUnavailable(
                "Las herramientas de aprendizaje no están disponibles"
            ) from exc
        if result.isError:
            message = result.content[0].text if result.content else "Error MCP"
            exc = RuntimeError(f"{name}: {message}")
            raise LearningToolsUnavailable(
                "Las herramientas de aprendizaje no están disponibles"
            ) from exc
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
        now = self._clock()
        if (
            self._cached_identity_token is not None
            and now
            < self._identity_token_expires_at - self._TOKEN_REFRESH_MARGIN_SECONDS
        ):
            return self._cached_identity_token

        async with self._identity_token_lock:
            now = self._clock()
            if (
                self._cached_identity_token is not None
                and now
                < self._identity_token_expires_at
                - self._TOKEN_REFRESH_MARGIN_SECONDS
            ):
                return self._cached_identity_token

            token = await self._fetch_identity_token()
            self._cached_identity_token = token
            self._identity_token_expires_at = self._token_expiration(token, now)
            return token

    async def _fetch_identity_token(self) -> str:
        from google.auth.transport.requests import Request
        from google.oauth2 import id_token

        return await asyncio.to_thread(
            id_token.fetch_id_token, Request(), self.auth_audience
        )

    def _token_expiration(self, token: str, fetched_at: float) -> float:
        from google.auth import jwt

        try:
            expiration = jwt.decode(token, verify=False).get("exp")
            if isinstance(expiration, (int, float)):
                return float(expiration)
        except Exception:
            # Algunos proveedores de prueba entregan tokens opacos sin claim exp.
            pass
        return fetched_at + self._TOKEN_LIFETIME_SECONDS

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
        rubric: EvaluationRubric | None = None,
        result_explanation: str | None = None,
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
                "rubric": rubric.model_dump(mode="json") if rubric else None,
                "result_explanation": result_explanation,
            },
        )
        return SaveResultResponse.model_validate(data)

    async def list_available_topics(self) -> list[TopicSummary]:
        data = await self._call("list_available_topics", {})
        return [TopicSummary.model_validate(item) for item in data]

"""Gateway de autoría local o remoto para mantener MCP como fuente de verdad."""

from __future__ import annotations

import asyncio
from typing import Protocol

import httpx

from mcp_learning_server.models import (
    AuthoredLesson,
    LearningContent,
    LessonActionRequest,
    LessonMutationRequest,
    LessonRevertRequest,
)
from mcp_learning_server.services.authoring import ContentAuthoringService


class AuthoringGateway(Protocol):
    async def list_lessons(self) -> list[AuthoredLesson]: ...

    async def get_lesson(self, lesson_id: str) -> AuthoredLesson: ...

    async def preview_lesson(self, lesson_id: str) -> LearningContent: ...

    async def create_lesson(
        self, payload: LessonMutationRequest
    ) -> AuthoredLesson: ...

    async def update_lesson(
        self, lesson_id: str, payload: LessonMutationRequest
    ) -> AuthoredLesson: ...

    async def publish_lesson(
        self, lesson_id: str, payload: LessonActionRequest
    ) -> AuthoredLesson: ...

    async def unpublish_lesson(
        self, lesson_id: str, payload: LessonActionRequest
    ) -> AuthoredLesson: ...

    async def revert_lesson(
        self, lesson_id: str, payload: LessonRevertRequest
    ) -> AuthoredLesson: ...


class LocalAuthoringGateway:
    def __init__(self, service: ContentAuthoringService) -> None:
        self.service = service

    async def list_lessons(self) -> list[AuthoredLesson]:
        return self.service.list_lessons()

    async def get_lesson(self, lesson_id: str) -> AuthoredLesson:
        return self.service.get_lesson(lesson_id)

    async def preview_lesson(self, lesson_id: str) -> LearningContent:
        return self.service.preview_lesson(lesson_id)

    async def create_lesson(
        self, payload: LessonMutationRequest
    ) -> AuthoredLesson:
        return self.service.create_lesson(payload.content, payload.author)

    async def update_lesson(
        self, lesson_id: str, payload: LessonMutationRequest
    ) -> AuthoredLesson:
        return self.service.update_lesson(
            lesson_id, payload.content, payload.author
        )

    async def publish_lesson(
        self, lesson_id: str, payload: LessonActionRequest
    ) -> AuthoredLesson:
        return self.service.publish_lesson(lesson_id, payload.author)

    async def unpublish_lesson(
        self, lesson_id: str, payload: LessonActionRequest
    ) -> AuthoredLesson:
        return self.service.unpublish_lesson(lesson_id, payload.author)

    async def revert_lesson(
        self, lesson_id: str, payload: LessonRevertRequest
    ) -> AuthoredLesson:
        return self.service.revert_lesson(
            lesson_id, payload.version, payload.author
        )


class RemoteAuthoringGateway:
    def __init__(
        self,
        url: str,
        token: str,
        timeout_seconds: float = 5,
        auth_audience: str | None = None,
    ) -> None:
        self.url = url.rstrip("/")
        self.token = token
        self.timeout_seconds = timeout_seconds
        self.auth_audience = auth_audience

    async def list_lessons(self) -> list[AuthoredLesson]:
        data = await self._request("GET", "/lessons")
        return [AuthoredLesson.model_validate(item) for item in data]

    async def get_lesson(self, lesson_id: str) -> AuthoredLesson:
        data = await self._request("GET", f"/lessons/{lesson_id}")
        return AuthoredLesson.model_validate(data)

    async def preview_lesson(self, lesson_id: str) -> LearningContent:
        data = await self._request("GET", f"/lessons/{lesson_id}/preview")
        return LearningContent.model_validate(data)

    async def create_lesson(
        self, payload: LessonMutationRequest
    ) -> AuthoredLesson:
        data = await self._request(
            "POST", "/lessons", payload.model_dump(mode="json")
        )
        return AuthoredLesson.model_validate(data)

    async def update_lesson(
        self, lesson_id: str, payload: LessonMutationRequest
    ) -> AuthoredLesson:
        data = await self._request(
            "PUT",
            f"/lessons/{lesson_id}",
            payload.model_dump(mode="json"),
        )
        return AuthoredLesson.model_validate(data)

    async def publish_lesson(
        self, lesson_id: str, payload: LessonActionRequest
    ) -> AuthoredLesson:
        return await self._action(lesson_id, "publish", payload)

    async def unpublish_lesson(
        self, lesson_id: str, payload: LessonActionRequest
    ) -> AuthoredLesson:
        return await self._action(lesson_id, "unpublish", payload)

    async def revert_lesson(
        self, lesson_id: str, payload: LessonRevertRequest
    ) -> AuthoredLesson:
        data = await self._request(
            "POST",
            f"/lessons/{lesson_id}/revert",
            payload.model_dump(mode="json"),
        )
        return AuthoredLesson.model_validate(data)

    async def _action(
        self,
        lesson_id: str,
        action: str,
        payload: LessonActionRequest,
    ) -> AuthoredLesson:
        data = await self._request(
            "POST",
            f"/lessons/{lesson_id}/{action}",
            payload.model_dump(mode="json"),
        )
        return AuthoredLesson.model_validate(data)

    async def _request(
        self,
        method: str,
        path: str,
        payload: dict | None = None,
    ):
        headers = {"x-authoring-token": self.token}
        if self.auth_audience:
            headers["Authorization"] = f"Bearer {await self._identity_token()}"
        async with httpx.AsyncClient(
            base_url=self.url,
            headers=headers,
            timeout=self.timeout_seconds,
        ) as client:
            response = await client.request(method, path, json=payload)
        if response.status_code >= 400:
            try:
                detail = response.json().get("detail", response.text)
            except ValueError:
                detail = response.text
            if response.status_code == 404:
                raise KeyError(detail)
            if response.status_code in {401, 403}:
                raise PermissionError(detail)
            raise ValueError(detail)
        return response.json()

    async def _identity_token(self) -> str:
        from google.auth.transport.requests import Request
        from google.oauth2 import id_token

        return await asyncio.to_thread(
            id_token.fetch_id_token, Request(), self.auth_audience
        )

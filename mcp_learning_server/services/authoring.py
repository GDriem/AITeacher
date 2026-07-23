"""Casos de uso de autoría: borradores, publicación y reversión trazable."""

from __future__ import annotations

import threading

from mcp_learning_server.models import (
    AuthoredLesson,
    ContentRevision,
    ContentRevisionAction,
    LearningContent,
    utc_now,
)
from mcp_learning_server.repositories.content_authoring import (
    LocalContentAuthoringRepository,
)
from mcp_learning_server.services.content_store import ContentStore


class ContentAuthoringService:
    def __init__(
        self,
        repository: LocalContentAuthoringRepository,
        content_store: ContentStore,
    ) -> None:
        self.repository = repository
        self.content_store = content_store
        self._lock = threading.RLock()
        self._refresh_published()

    def list_lessons(self) -> list[AuthoredLesson]:
        return sorted(self.repository.list(), key=lambda lesson: lesson.id)

    def get_lesson(self, lesson_id: str) -> AuthoredLesson:
        return self._find(self.repository.list(), lesson_id).model_copy(deep=True)

    def create_lesson(
        self,
        content: LearningContent,
        author: str,
    ) -> AuthoredLesson:
        with self._lock:
            lessons = self.repository.list()
            if any(lesson.id == content.id for lesson in lessons):
                raise ValueError("ya existe una lección con ese identificador")
            now = utc_now()
            lesson = AuthoredLesson(
                id=content.id,
                draft=content,
                published=False,
                version=1,
                revisions=[
                    ContentRevision(
                        version=1,
                        action=ContentRevisionAction.CREATED,
                        author=author,
                        draft=content,
                        published=False,
                        created_at=now,
                    )
                ],
                created_at=now,
                updated_at=now,
            )
            lessons.append(lesson)
            self.repository.save(lessons)
            return lesson.model_copy(deep=True)

    def update_lesson(
        self,
        lesson_id: str,
        content: LearningContent,
        author: str,
    ) -> AuthoredLesson:
        if content.id != lesson_id:
            raise ValueError("el identificador de una lección no puede cambiar")
        return self._mutate(
            lesson_id,
            ContentRevisionAction.UPDATED,
            author,
            content=content,
        )

    def publish_lesson(self, lesson_id: str, author: str) -> AuthoredLesson:
        return self._mutate(
            lesson_id,
            ContentRevisionAction.PUBLISHED,
            author,
            published=True,
        )

    def unpublish_lesson(self, lesson_id: str, author: str) -> AuthoredLesson:
        return self._mutate(
            lesson_id,
            ContentRevisionAction.UNPUBLISHED,
            author,
            published=False,
        )

    def revert_lesson(
        self,
        lesson_id: str,
        version: int,
        author: str,
    ) -> AuthoredLesson:
        with self._lock:
            lessons = self.repository.list()
            lesson = self._find(lessons, lesson_id)
            target = next(
                (
                    revision
                    for revision in lesson.revisions
                    if revision.version == version
                ),
                None,
            )
            if target is None:
                raise KeyError("No existe la versión solicitada")
            lesson = self._append_revision(
                lesson,
                ContentRevisionAction.REVERTED,
                author,
                target.draft,
                target.published,
                published_content=target.published_content,
                reverted_from=version,
            )
            self._replace(lessons, lesson)
            self.repository.save(lessons)
            self._refresh_published(lessons)
            return lesson.model_copy(deep=True)

    def preview_lesson(self, lesson_id: str) -> LearningContent:
        return self.get_lesson(lesson_id).draft

    def _mutate(
        self,
        lesson_id: str,
        action: ContentRevisionAction,
        author: str,
        *,
        content: LearningContent | None = None,
        published: bool | None = None,
    ) -> AuthoredLesson:
        with self._lock:
            lessons = self.repository.list()
            lesson = self._find(lessons, lesson_id)
            next_content = content or lesson.draft
            next_published = lesson.published if published is None else published
            if action == ContentRevisionAction.UPDATED:
                published_content = lesson.published_content
            elif next_published:
                published_content = next_content
            else:
                published_content = None
            lesson = self._append_revision(
                lesson,
                action,
                author,
                next_content,
                next_published,
                published_content=published_content,
            )
            self._replace(lessons, lesson)
            self.repository.save(lessons)
            self._refresh_published(lessons)
            return lesson.model_copy(deep=True)

    @staticmethod
    def _append_revision(
        lesson: AuthoredLesson,
        action: ContentRevisionAction,
        author: str,
        content: LearningContent,
        published: bool,
        *,
        published_content: LearningContent | None = None,
        reverted_from: int | None = None,
    ) -> AuthoredLesson:
        now = utc_now()
        version = lesson.version + 1
        return AuthoredLesson(
            id=lesson.id,
            draft=content,
            published_content=published_content,
            published=published,
            version=version,
            revisions=[
                *lesson.revisions,
                ContentRevision(
                    version=version,
                    action=action,
                    author=author,
                    draft=content,
                    published_content=published_content,
                    published=published,
                    created_at=now,
                    reverted_from=reverted_from,
                ),
            ],
            created_at=lesson.created_at,
            updated_at=now,
        )

    def _refresh_published(
        self,
        lessons: list[AuthoredLesson] | None = None,
    ) -> None:
        current = lessons if lessons is not None else self.repository.list()
        self.content_store.replace(
            [
                lesson.published_content
                for lesson in current
                if lesson.published and lesson.published_content is not None
            ]
        )

    @staticmethod
    def _find(
        lessons: list[AuthoredLesson],
        lesson_id: str,
    ) -> AuthoredLesson:
        lesson = next((item for item in lessons if item.id == lesson_id), None)
        if lesson is None:
            raise KeyError("No existe la lección solicitada")
        return lesson

    @staticmethod
    def _replace(
        lessons: list[AuthoredLesson],
        updated: AuthoredLesson,
    ) -> None:
        index = next(
            index for index, lesson in enumerate(lessons) if lesson.id == updated.id
        )
        lessons[index] = updated

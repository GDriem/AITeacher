"""Persistencia JSON atómica para borradores y versiones del currículo."""

from __future__ import annotations

import json
import os
import tempfile
import threading
from pathlib import Path
from typing import Sequence

from pydantic import TypeAdapter

from mcp_learning_server.models import (
    AuthoredLesson,
    ContentRevision,
    ContentRevisionAction,
    LearningContent,
    utc_now,
)

_lesson_list = TypeAdapter(list[AuthoredLesson])


class LocalContentAuthoringRepository:
    """Conserva el historial completo sin modificar el corpus fuente versionado."""

    def __init__(
        self,
        path: str | Path,
        bootstrap_content: Sequence[LearningContent],
    ) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._bootstrap_content = tuple(bootstrap_content)

    def list(self) -> list[AuthoredLesson]:
        with self._lock:
            if not self.path.exists():
                lessons = self._bootstrap()
                self._write(lessons)
                return lessons
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            lessons = _lesson_list.validate_python(raw.get("lessons", []))
            return [lesson.model_copy(deep=True) for lesson in lessons]

    def save(self, lessons: Sequence[AuthoredLesson]) -> None:
        with self._lock:
            self._write(list(lessons))

    def _bootstrap(self) -> list[AuthoredLesson]:
        now = utc_now()
        return [
            AuthoredLesson(
                id=content.id,
                draft=content,
                published_content=content,
                published=True,
                version=1,
                revisions=[
                    ContentRevision(
                        version=1,
                        action=ContentRevisionAction.BOOTSTRAPPED,
                        author="sistema",
                        draft=content,
                        published_content=content,
                        published=True,
                        created_at=now,
                    )
                ],
                created_at=now,
                updated_at=now,
            )
            for content in self._bootstrap_content
        ]

    def _write(self, lessons: Sequence[AuthoredLesson]) -> None:
        payload = {
            "schema_version": 1,
            "lessons": [
                lesson.model_dump(mode="json") for lesson in lessons
            ],
        }
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f"{self.path.name}.",
            suffix=".tmp",
            dir=self.path.parent,
        )
        temporary_path = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False, indent=2)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary_path, self.path)
        finally:
            temporary_path.unlink(missing_ok=True)

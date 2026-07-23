"""Repositorio JSON local, atómico y apropiado para desarrollo y pruebas."""

from __future__ import annotations

import json
import os
import tempfile
import threading
from pathlib import Path

from pydantic import TypeAdapter, ValidationError

from mcp_learning_server.models import (
    Assessment,
    LearningLevel,
    StudentProgress,
    Topic,
    level_for_score,
    utc_now,
)
from mcp_learning_server.repositories.base import ProgressRepositoryError

_progress_map = TypeAdapter(dict[str, StudentProgress])


class LocalProgressRepository:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self._lock = threading.RLock()

    def get(self, student_id: str) -> StudentProgress:
        normalized_id = _validate_student_id(student_id)
        with self._lock:
            progress = self._read_all().get(normalized_id)
            return progress.model_copy(deep=True) if progress else StudentProgress(
                student_id=normalized_id
            )

    def save_assessment(
        self, student_id: str, assessment: Assessment
    ) -> StudentProgress:
        normalized_id = _validate_student_id(student_id)
        with self._lock:
            students = self._read_all()
            progress = students.get(normalized_id, StudentProgress(student_id=normalized_id))
            progress.assessments.append(assessment)
            if assessment.topic not in progress.studied_topics:
                progress.studied_topics.append(assessment.topic)
            progress.recommendations.append(assessment.recommendation)
            progress.recommendations = progress.recommendations[-10:]
            progress.refresh_summary()
            progress.updated_at = utc_now()
            students[normalized_id] = progress
            self._write_all(students)
            return progress.model_copy(deep=True)

    def _read_all(self) -> dict[str, StudentProgress]:
        if not self.path.exists():
            return {}
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            return _progress_map.validate_python(raw)
        except (OSError, json.JSONDecodeError, ValidationError) as exc:
            raise ProgressRepositoryError(
                f"No se pudo leer el progreso local en {self.path}"
            ) from exc

    def _write_all(self, students: dict[str, StudentProgress]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        serialized = {
            student_id: progress.model_dump(mode="json")
            for student_id, progress in students.items()
        }
        temporary_path: str | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=self.path.parent,
                prefix=f".{self.path.name}.",
                suffix=".tmp",
                delete=False,
            ) as handle:
                json.dump(serialized, handle, ensure_ascii=False, indent=2)
                handle.flush()
                os.fsync(handle.fileno())
                temporary_path = handle.name
            os.replace(temporary_path, self.path)
        except OSError as exc:
            if temporary_path:
                Path(temporary_path).unlink(missing_ok=True)
            raise ProgressRepositoryError(
                f"No se pudo guardar el progreso local en {self.path}"
            ) from exc


def _validate_student_id(student_id: str) -> str:
    normalized = student_id.strip()
    if not normalized or len(normalized) > 100:
        raise ValueError("student_id debe contener entre 1 y 100 caracteres")
    return normalized


def _estimate_level(assessments: list[Assessment]) -> LearningLevel:
    """Compatibilidad para adaptadores: promedio de mejores puntajes por tema."""

    if not assessments:
        return LearningLevel.BEGINNER
    best_scores: dict[Topic, float] = {}
    for assessment in assessments:
        best_scores[assessment.topic] = max(
            assessment.score,
            best_scores.get(assessment.topic, 0),
        )
    return level_for_score(sum(best_scores.values()) / len(best_scores))

"""Puertos de persistencia para no acoplar el dominio a Firestore."""

from typing import Protocol

from mcp_learning_server.models import Assessment, StudentProgress


class ProgressRepository(Protocol):
    def get(self, student_id: str) -> StudentProgress: ...

    def save_assessment(
        self, student_id: str, assessment: Assessment
    ) -> StudentProgress: ...


class ProgressRepositoryError(RuntimeError):
    """La persistencia local contiene datos inválidos o no se pudo escribir."""


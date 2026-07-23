"""Persistencia de conversaciones, tema y evaluación pendiente."""

from __future__ import annotations

import json
import os
import tempfile
import threading
import uuid
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

from agent_app.models.chat import Quiz
from mcp_learning_server.models import Topic, utc_now


class SessionModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MessageRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"


class ConversationMessage(SessionModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: MessageRole
    label: str = Field(min_length=1, max_length=80)
    content: str = Field(min_length=1, max_length=12_000)
    sources: list[str] = Field(default_factory=list, max_length=20)
    note: str = Field(default="", max_length=2_000)
    created_at: datetime = Field(default_factory=utc_now)


class PendingEvaluation(SessionModel):
    student_id: str
    topic: Topic
    quiz: Quiz
    attempt: int = Field(default=1, ge=1)


class StoredConversation(SessionModel):
    id: str
    student_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=100)
    topic: Topic
    messages: list[ConversationMessage] = Field(default_factory=list)
    pending_evaluation: PendingEvaluation
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    archived_at: datetime | None = None


class PendingQuizResponse(SessionModel):
    question: str
    attempt: int = Field(ge=1)


class ConversationSummary(SessionModel):
    id: str
    title: str
    topic: Topic
    message_count: int = Field(ge=0)
    pending_quiz: PendingQuizResponse
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class ConversationDetail(ConversationSummary):
    student_id: str
    messages: list[ConversationMessage]


class ConversationListResponse(SessionModel):
    sessions: list[ConversationSummary]
    retention_days: int = Field(ge=1)


class SessionRepository(Protocol):
    retention_days: int

    def get(self, session_id: str, student_id: str) -> StoredConversation: ...

    def list(
        self, student_id: str, include_archived: bool = False
    ) -> list[StoredConversation]: ...

    def save(self, session: StoredConversation) -> StoredConversation: ...

    def rename(
        self, session_id: str, student_id: str, title: str
    ) -> StoredConversation: ...

    def set_archived(
        self, session_id: str, student_id: str, archived: bool
    ) -> StoredConversation: ...

    def delete(self, session_id: str, student_id: str) -> None: ...


class SessionRepositoryError(RuntimeError):
    """La persistencia de sesiones es inválida o no se pudo escribir."""


_session_map = TypeAdapter(dict[str, StoredConversation])


class LocalSessionRepository:
    """Repositorio JSON atómico con eliminación automática por antigüedad."""

    def __init__(
        self,
        path: str | Path,
        retention_days: int = 365,
        *,
        clock=utc_now,
    ) -> None:
        if retention_days < 1:
            raise ValueError("retention_days debe ser al menos 1")
        self.path = Path(path)
        self.retention_days = retention_days
        self._clock = clock
        self._lock = threading.RLock()

    def get(self, session_id: str, student_id: str) -> StoredConversation:
        normalized_student = _validate_student_id(student_id)
        with self._lock:
            sessions = self._read_current()
            session = sessions.get(session_id)
            if session is None:
                raise KeyError("No existe la conversación solicitada")
            _authorize(session, normalized_student)
            return session.model_copy(deep=True)

    def list(
        self, student_id: str, include_archived: bool = False
    ) -> list[StoredConversation]:
        normalized_student = _validate_student_id(student_id)
        with self._lock:
            sessions = [
                session.model_copy(deep=True)
                for session in self._read_current().values()
                if session.student_id == normalized_student
                and (include_archived or session.archived_at is None)
            ]
        return sorted(sessions, key=lambda item: item.updated_at, reverse=True)

    def save(self, session: StoredConversation) -> StoredConversation:
        with self._lock:
            sessions = self._read_current()
            existing = sessions.get(session.id)
            if existing is not None and existing.student_id != session.student_id:
                raise PermissionError("La conversación pertenece a otro estudiante")
            session.updated_at = self._clock()
            sessions[session.id] = session.model_copy(deep=True)
            self._write_all(sessions)
            return session.model_copy(deep=True)

    def rename(
        self, session_id: str, student_id: str, title: str
    ) -> StoredConversation:
        normalized_title = _validate_title(title)
        with self._lock:
            sessions = self._read_current()
            session = _get_authorized(sessions, session_id, student_id)
            session.title = normalized_title
            session.updated_at = self._clock()
            self._write_all(sessions)
            return session.model_copy(deep=True)

    def set_archived(
        self, session_id: str, student_id: str, archived: bool
    ) -> StoredConversation:
        with self._lock:
            sessions = self._read_current()
            session = _get_authorized(sessions, session_id, student_id)
            session.archived_at = self._clock() if archived else None
            session.updated_at = self._clock()
            self._write_all(sessions)
            return session.model_copy(deep=True)

    def delete(self, session_id: str, student_id: str) -> None:
        with self._lock:
            sessions = self._read_current()
            _get_authorized(sessions, session_id, student_id)
            del sessions[session_id]
            self._write_all(sessions)

    def _read_current(self) -> dict[str, StoredConversation]:
        sessions = self._read_all()
        cutoff = self._clock() - timedelta(days=self.retention_days)
        retained = {
            session_id: session
            for session_id, session in sessions.items()
            if _as_utc(session.updated_at) >= cutoff
        }
        if len(retained) != len(sessions):
            self._write_all(retained)
        return retained

    def _read_all(self) -> dict[str, StoredConversation]:
        if not self.path.exists():
            return {}
        try:
            return _session_map.validate_python(
                json.loads(self.path.read_text(encoding="utf-8"))
            )
        except (OSError, json.JSONDecodeError, ValidationError) as exc:
            raise SessionRepositoryError(
                f"No se pudieron leer las sesiones locales en {self.path}"
            ) from exc

    def _write_all(self, sessions: dict[str, StoredConversation]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        serialized = {
            session_id: _serialize_session(session)
            for session_id, session in sessions.items()
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
            raise SessionRepositoryError(
                f"No se pudieron guardar las sesiones locales en {self.path}"
            ) from exc


class InMemorySessionRepository:
    """Adaptador rápido para pruebas unitarias."""

    retention_days = 365

    def __init__(self) -> None:
        self._items: dict[str, StoredConversation] = {}
        self._lock = threading.RLock()

    def get(self, session_id: str, student_id: str) -> StoredConversation:
        with self._lock:
            session = _get_authorized(self._items, session_id, student_id)
            return session.model_copy(deep=True)

    def list(
        self, student_id: str, include_archived: bool = False
    ) -> list[StoredConversation]:
        normalized = _validate_student_id(student_id)
        with self._lock:
            items = [
                item.model_copy(deep=True)
                for item in self._items.values()
                if item.student_id == normalized
                and (include_archived or item.archived_at is None)
            ]
        return sorted(items, key=lambda item: item.updated_at, reverse=True)

    def save(self, session: StoredConversation) -> StoredConversation:
        with self._lock:
            existing = self._items.get(session.id)
            if existing is not None and existing.student_id != session.student_id:
                raise PermissionError("La conversación pertenece a otro estudiante")
            session.updated_at = utc_now()
            self._items[session.id] = session.model_copy(deep=True)
            return session.model_copy(deep=True)

    def rename(
        self, session_id: str, student_id: str, title: str
    ) -> StoredConversation:
        with self._lock:
            session = _get_authorized(self._items, session_id, student_id)
            session.title = _validate_title(title)
            session.updated_at = utc_now()
            return session.model_copy(deep=True)

    def set_archived(
        self, session_id: str, student_id: str, archived: bool
    ) -> StoredConversation:
        with self._lock:
            session = _get_authorized(self._items, session_id, student_id)
            session.archived_at = utc_now() if archived else None
            session.updated_at = utc_now()
            return session.model_copy(deep=True)

    def delete(self, session_id: str, student_id: str) -> None:
        with self._lock:
            _get_authorized(self._items, session_id, student_id)
            del self._items[session_id]


class FirestoreSessionRepository:
    """Adaptador administrado para sesiones durables en despliegues Cloud Run."""

    def __init__(
        self,
        client,
        collection: str = "learning_sessions",
        retention_days: int = 365,
        *,
        clock=utc_now,
    ) -> None:
        if retention_days < 1:
            raise ValueError("retention_days debe ser al menos 1")
        self.client = client
        self.collection = collection
        self.retention_days = retention_days
        self._clock = clock

    def get(self, session_id: str, student_id: str) -> StoredConversation:
        snapshot = self._document(session_id).get()
        if not snapshot.exists:
            raise KeyError("No existe la conversación solicitada")
        session = StoredConversation.model_validate(snapshot.to_dict())
        _authorize(session, _validate_student_id(student_id))
        if self._expired(session):
            self._document(session_id).delete()
            raise KeyError("No existe la conversación solicitada")
        return session

    def list(
        self, student_id: str, include_archived: bool = False
    ) -> list[StoredConversation]:
        normalized = _validate_student_id(student_id)
        snapshots = (
            self.client.collection(self.collection)
            .where(field_path="student_id", op_string="==", value=normalized)
            .stream()
        )
        sessions: list[StoredConversation] = []
        for snapshot in snapshots:
            session = StoredConversation.model_validate(snapshot.to_dict())
            if self._expired(session):
                snapshot.reference.delete()
            elif include_archived or session.archived_at is None:
                sessions.append(session)
        return sorted(sessions, key=lambda item: item.updated_at, reverse=True)

    def save(self, session: StoredConversation) -> StoredConversation:
        document = self._document(session.id)
        snapshot = document.get()
        if snapshot.exists:
            _authorize(
                StoredConversation.model_validate(snapshot.to_dict()),
                session.student_id,
            )
        session.updated_at = self._clock()
        document.set(_serialize_session(session))
        return session.model_copy(deep=True)

    def rename(
        self, session_id: str, student_id: str, title: str
    ) -> StoredConversation:
        session = self.get(session_id, student_id)
        session.title = _validate_title(title)
        return self.save(session)

    def set_archived(
        self, session_id: str, student_id: str, archived: bool
    ) -> StoredConversation:
        session = self.get(session_id, student_id)
        session.archived_at = self._clock() if archived else None
        return self.save(session)

    def delete(self, session_id: str, student_id: str) -> None:
        self.get(session_id, student_id)
        self._document(session_id).delete()

    def _document(self, session_id: str):
        return self.client.collection(self.collection).document(session_id)

    def _expired(self, session: StoredConversation) -> bool:
        cutoff = self._clock() - timedelta(days=self.retention_days)
        return _as_utc(session.updated_at) < cutoff


def conversation_summary(session: StoredConversation) -> ConversationSummary:
    return ConversationSummary(
        id=session.id,
        title=session.title,
        topic=session.topic,
        message_count=len(session.messages),
        pending_quiz=PendingQuizResponse(
            question=session.pending_evaluation.quiz.question,
            attempt=session.pending_evaluation.attempt,
        ),
        created_at=session.created_at,
        updated_at=session.updated_at,
        archived_at=session.archived_at,
    )


def conversation_detail(session: StoredConversation) -> ConversationDetail:
    return ConversationDetail(
        **conversation_summary(session).model_dump(),
        student_id=session.student_id,
        messages=session.messages,
    )


def _serialize_session(session: StoredConversation) -> dict:
    payload = session.model_dump(mode="json")
    pending = session.pending_evaluation
    payload["pending_evaluation"]["quiz"]["expected_keywords"] = list(
        pending.quiz.expected_keywords
    )
    return payload


def _get_authorized(
    sessions: dict[str, StoredConversation], session_id: str, student_id: str
) -> StoredConversation:
    session = sessions.get(session_id)
    if session is None:
        raise KeyError("No existe la conversación solicitada")
    _authorize(session, _validate_student_id(student_id))
    return session


def _authorize(session: StoredConversation, student_id: str) -> None:
    if session.student_id != student_id:
        raise PermissionError("La conversación pertenece a otro estudiante")


def _validate_student_id(student_id: str) -> str:
    normalized = student_id.strip()
    if not normalized or len(normalized) > 100:
        raise ValueError("student_id debe contener entre 1 y 100 caracteres")
    return normalized


def _validate_title(title: str) -> str:
    normalized = " ".join(title.split())
    if not normalized or len(normalized) > 100:
        raise ValueError("title debe contener entre 1 y 100 caracteres")
    return normalized


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)

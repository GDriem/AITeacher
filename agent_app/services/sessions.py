"""Persistencia de conversaciones, tema y evaluación pendiente."""

from __future__ import annotations

import json
import os
import tempfile
import threading
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from pathlib import Path
from typing import Protocol

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    ValidationError,
    field_validator,
)

from agent_app.models.activities import PracticeExercise
from agent_app.models.chat import ChatResponse, Quiz
from mcp_learning_server.models import LearningLevel, Topic, utc_now


# Respuestas previas del alumno que se conservan y recibe el evaluador como contexto.
EVALUATOR_ANSWERS_LIMIT = 5


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
    model_config = ConfigDict(validate_assignment=True)

    student_id: str
    topic: Topic
    quiz: Quiz
    attempt: int = Field(default=1, ge=1)
    student_answers: list[str] = Field(default_factory=list)

    @field_validator("student_answers")
    @classmethod
    def _keep_recent_answers(cls, answers: list[str]) -> list[str]:
        # Única fuente del recorte: la sesión persistida no crece con cada intento.
        return answers[-EVALUATOR_ANSWERS_LIMIT:]


class PendingPractice(SessionModel):
    exercise: PracticeExercise
    quiz: Quiz


class StoredConversation(SessionModel):
    id: str
    student_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=100)
    topic: Topic
    preferred_level: LearningLevel | None = None
    messages: list[ConversationMessage] = Field(default_factory=list)
    pending_evaluation: PendingEvaluation
    pending_practice: PendingPractice | None = None
    completed_chat_requests: dict[str, ChatResponse] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    archived_at: datetime | None = None


class ChatRequestStatus(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"


class ChatRequestRecord(SessionModel):
    request_id: str
    student_id: str
    session_id: str
    request_fingerprint: str = ""
    status: ChatRequestStatus = ChatRequestStatus.PENDING
    claim_token: str | None = None
    lease_expires_at: datetime | None = None
    expires_at: datetime | None = None
    response: ChatResponse | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ChatRequestClaim(SessionModel):
    acquired: bool
    session_id: str
    claim_token: str | None = None
    response: ChatResponse | None = None


class PendingQuizResponse(SessionModel):
    question: str
    attempt: int = Field(ge=1)


class PendingPracticeResponse(SessionModel):
    exercise: PracticeExercise


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
    pending_practice: PendingPracticeResponse | None = None


class ConversationListResponse(SessionModel):
    sessions: list[ConversationSummary]
    retention_days: int = Field(ge=1)


class SessionRepository(Protocol):
    """Puerto **síncrono y bloqueante** de persistencia de conversaciones.

    Todas las implementaciones hacen E/S: disco local en `LocalSessionRepository`
    y red en `FirestoreSessionRepository`. Por eso ningún método debe invocarse
    directamente desde una corrutina: el código asíncrono los ejecuta con
    `asyncio.to_thread` (el orquestador) o con `agent_app.api.main._in_thread`
    (los handlers), para no congelar el event loop —y con él el WebSocket de
    voz— durante toda la ida y vuelta.
    """

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

    def claim_chat_request(
        self,
        request_id: str,
        student_id: str,
        session_id: str,
        request_fingerprint: str,
        lease_seconds: float,
    ) -> ChatRequestClaim: ...

    def get_chat_request(
        self, request_id: str, student_id: str
    ) -> ChatRequestRecord | None: ...

    def complete_chat_request(
        self,
        request_id: str,
        student_id: str,
        claim_token: str,
        response: ChatResponse,
    ) -> None: ...

    def reconcile_chat_request(
        self, request_id: str, student_id: str, response: ChatResponse
    ) -> None: ...

    def release_chat_request(
        self, request_id: str, student_id: str, claim_token: str
    ) -> None: ...


CHAT_REQUEST_RETENTION_HOURS = 24.0
"""Cuánto sobrevive un registro idempotente antes de purgarse.

Sólo sirve para deduplicar reintentos del navegador, que ocurren en segundos o
minutos. Un día cubre de sobra ese caso sin dejar crecer el almacenamiento.
"""

LEGACY_LEASE_GRACE_SECONDS = 300.0
"""Gracia para registros PENDING escritos antes de que existieran los leases.

Durante un rollout conviven registros sin `lease_expires_at`. Tratarlos como
vencidos de inmediato permitiría robarle el lease a una petición que sigue en
vuelo, así que se les concede una ventana contada desde su última escritura.
"""


class ChatRequestLeaseLost(PermissionError):
    """El lease de una solicitud de chat expiró y otro proceso la reclamó.

    Hereda de `PermissionError` para conservar la respuesta 403 de la API
    cuando nadie la trata de forma explícita, pero permite distinguirla de un
    intento real de acceder a la solicitud de otro estudiante.
    """


class SessionRepositoryError(RuntimeError):
    """La persistencia de sesiones es inválida o no se pudo escribir."""


_session_map = TypeAdapter(dict[str, StoredConversation])
_chat_request_map = TypeAdapter(dict[str, ChatRequestRecord])


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
        self.chat_requests_path = self.path.with_suffix(
            f"{self.path.suffix}.chat_requests.json"
        )
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

    def claim_chat_request(
        self,
        request_id: str,
        student_id: str,
        session_id: str,
        request_fingerprint: str,
        lease_seconds: float,
    ) -> ChatRequestClaim:
        normalized_student = _validate_student_id(student_id)
        storage_key = _chat_request_storage_key(normalized_student, request_id)
        now = self._clock()
        with self._chat_requests_lock():
            requests = self._read_chat_requests()
            existing = requests.get(storage_key)
            if existing is not None:
                _authorize_chat_request(existing, normalized_student)
                _validate_chat_request_fingerprint(existing, request_fingerprint)
                if (
                    existing.status == ChatRequestStatus.PENDING
                    and _lease_expired(existing, now)
                ):
                    existing.claim_token = str(uuid.uuid4())
                    existing.lease_expires_at = now + timedelta(seconds=lease_seconds)
                    existing.expires_at = _chat_request_expires_at(now)
                    existing.updated_at = now
                    if not existing.request_fingerprint:
                        existing.request_fingerprint = request_fingerprint
                    self._write_chat_requests(requests)
                    return ChatRequestClaim(
                        acquired=True,
                        session_id=existing.session_id,
                        claim_token=existing.claim_token,
                    )
                return ChatRequestClaim(
                    acquired=False,
                    session_id=existing.session_id,
                    response=existing.response,
                )
            claim_token = str(uuid.uuid4())
            requests[storage_key] = ChatRequestRecord(
                request_id=request_id,
                student_id=normalized_student,
                session_id=session_id,
                request_fingerprint=request_fingerprint,
                claim_token=claim_token,
                lease_expires_at=now + timedelta(seconds=lease_seconds),
                expires_at=_chat_request_expires_at(now),
                created_at=now,
                updated_at=now,
            )
            self._write_chat_requests(requests)
            return ChatRequestClaim(
                acquired=True, session_id=session_id, claim_token=claim_token
            )

    def get_chat_request(
        self, request_id: str, student_id: str
    ) -> ChatRequestRecord | None:
        with self._chat_requests_lock():
            record = self._read_chat_requests().get(
                _chat_request_storage_key(student_id, request_id)
            )
            if record is None:
                return None
            _authorize_chat_request(record, _validate_student_id(student_id))
            return record.model_copy(deep=True)

    def complete_chat_request(
        self,
        request_id: str,
        student_id: str,
        claim_token: str,
        response: ChatResponse,
    ) -> None:
        with self._chat_requests_lock():
            requests = self._read_chat_requests()
            record = requests.get(_chat_request_storage_key(student_id, request_id))
            if record is None:
                raise KeyError("No existe la solicitud de chat")
            _authorize_chat_request(record, _validate_student_id(student_id))
            if record.status == ChatRequestStatus.COMPLETED:
                return
            _authorize_chat_request_claim(record, claim_token)
            _complete_chat_request_record(record, response, self._clock())
            self._write_chat_requests(requests)

    def reconcile_chat_request(
        self, request_id: str, student_id: str, response: ChatResponse
    ) -> None:
        with self._chat_requests_lock():
            requests = self._read_chat_requests()
            record = requests.get(_chat_request_storage_key(student_id, request_id))
            if record is None:
                raise KeyError("No existe la solicitud de chat")
            _authorize_chat_request(record, _validate_student_id(student_id))
            _complete_chat_request_record(record, response, self._clock())
            self._write_chat_requests(requests)

    def release_chat_request(
        self, request_id: str, student_id: str, claim_token: str
    ) -> None:
        with self._chat_requests_lock():
            requests = self._read_chat_requests()
            storage_key = _chat_request_storage_key(student_id, request_id)
            record = requests.get(storage_key)
            if record is None:
                return
            _authorize_chat_request(record, _validate_student_id(student_id))
            if record.status == ChatRequestStatus.PENDING:
                if record.claim_token != claim_token:
                    return
                del requests[storage_key]
                self._write_chat_requests(requests)

    @contextmanager
    def _chat_requests_lock(self):
        lock_path = self.chat_requests_path.with_suffix(
            f"{self.chat_requests_path.suffix}.lock"
        )
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock, lock_path.open("a+") as lock_file:
            try:
                import fcntl
            except ImportError:  # pragma: no cover - Windows usa el lock del proceso
                yield
                return

            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

    def _read_chat_requests(self) -> dict[str, ChatRequestRecord]:
        """Lee los registros idempotentes vigentes y purga los caducados.

        Sigue el mismo patrón que `_read_current` para las conversaciones: sin
        esta purga el archivo crecería sin límite, porque un registro
        completado nunca se borra por sí solo.
        """

        requests = self._read_all_chat_requests()
        now = self._clock()
        retained = {
            storage_key: record
            for storage_key, record in requests.items()
            if not _chat_request_is_purgeable(record, now)
        }
        if len(retained) != len(requests):
            self._write_chat_requests(retained)
        return retained

    def _read_all_chat_requests(self) -> dict[str, ChatRequestRecord]:
        if not self.chat_requests_path.exists():
            return {}
        try:
            return _chat_request_map.validate_python(
                json.loads(self.chat_requests_path.read_text(encoding="utf-8"))
            )
        except (OSError, json.JSONDecodeError, ValidationError) as exc:
            raise SessionRepositoryError(
                f"No se pudieron leer las solicitudes en {self.chat_requests_path}"
            ) from exc

    def _write_chat_requests(self, requests: dict[str, ChatRequestRecord]) -> None:
        _atomic_json_write(
            self.chat_requests_path,
            {
                request_id: _serialize_chat_request(record)
                for request_id, record in requests.items()
            },
        )

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
        self._chat_requests: dict[str, ChatRequestRecord] = {}
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

    def claim_chat_request(
        self,
        request_id: str,
        student_id: str,
        session_id: str,
        request_fingerprint: str,
        lease_seconds: float,
    ) -> ChatRequestClaim:
        with self._lock:
            storage_key = _chat_request_storage_key(student_id, request_id)
            existing = self._chat_requests.get(storage_key)
            if existing is not None:
                _authorize_chat_request(existing, _validate_student_id(student_id))
                _validate_chat_request_fingerprint(existing, request_fingerprint)
                if (
                    existing.status == ChatRequestStatus.PENDING
                    and _lease_expired(existing, utc_now())
                ):
                    existing.claim_token = str(uuid.uuid4())
                    existing.lease_expires_at = utc_now() + timedelta(
                        seconds=lease_seconds
                    )
                    existing.expires_at = _chat_request_expires_at(utc_now())
                    existing.updated_at = utc_now()
                    if not existing.request_fingerprint:
                        existing.request_fingerprint = request_fingerprint
                    return ChatRequestClaim(
                        acquired=True,
                        session_id=existing.session_id,
                        claim_token=existing.claim_token,
                    )
                return ChatRequestClaim(
                    acquired=False,
                    session_id=existing.session_id,
                    response=existing.response,
                )
            claim_token = str(uuid.uuid4())
            self._chat_requests[storage_key] = ChatRequestRecord(
                request_id=request_id,
                student_id=_validate_student_id(student_id),
                session_id=session_id,
                request_fingerprint=request_fingerprint,
                claim_token=claim_token,
                lease_expires_at=utc_now() + timedelta(seconds=lease_seconds),
                expires_at=_chat_request_expires_at(utc_now()),
                created_at=utc_now(),
                updated_at=utc_now(),
            )
            return ChatRequestClaim(
                acquired=True, session_id=session_id, claim_token=claim_token
            )

    def get_chat_request(
        self, request_id: str, student_id: str
    ) -> ChatRequestRecord | None:
        with self._lock:
            record = self._chat_requests.get(
                _chat_request_storage_key(student_id, request_id)
            )
            if record is None:
                return None
            _authorize_chat_request(record, _validate_student_id(student_id))
            return record.model_copy(deep=True)

    def complete_chat_request(
        self,
        request_id: str,
        student_id: str,
        claim_token: str,
        response: ChatResponse,
    ) -> None:
        with self._lock:
            record = self._chat_requests[
                _chat_request_storage_key(student_id, request_id)
            ]
            _authorize_chat_request(record, _validate_student_id(student_id))
            if record.status == ChatRequestStatus.COMPLETED:
                return
            _authorize_chat_request_claim(record, claim_token)
            _complete_chat_request_record(record, response, utc_now())

    def reconcile_chat_request(
        self, request_id: str, student_id: str, response: ChatResponse
    ) -> None:
        with self._lock:
            record = self._chat_requests[
                _chat_request_storage_key(student_id, request_id)
            ]
            _authorize_chat_request(record, _validate_student_id(student_id))
            _complete_chat_request_record(record, response, utc_now())

    def release_chat_request(
        self, request_id: str, student_id: str, claim_token: str
    ) -> None:
        with self._lock:
            storage_key = _chat_request_storage_key(student_id, request_id)
            record = self._chat_requests.get(storage_key)
            if record is None:
                return
            _authorize_chat_request(record, _validate_student_id(student_id))
            if record.status == ChatRequestStatus.PENDING:
                if record.claim_token != claim_token:
                    return
                del self._chat_requests[storage_key]


class FirestoreSessionRepository:
    """Adaptador administrado para sesiones durables en despliegues Cloud Run.

    El cliente de Firestore es síncrono: cada `get`, `set`, `delete` o `stream`
    es una llamada de red bloqueante. Llámalo siempre desde un hilo de trabajo
    (ver `SessionRepository`), nunca desde el hilo del event loop.
    """

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

    def claim_chat_request(
        self,
        request_id: str,
        student_id: str,
        session_id: str,
        request_fingerprint: str,
        lease_seconds: float,
    ) -> ChatRequestClaim:
        from google.api_core.exceptions import (
            AlreadyExists,
            FailedPrecondition,
            NotFound,
        )
        from google.cloud.firestore_v1 import LastUpdateOption

        document = self._chat_request_document(student_id, request_id)
        now = self._clock()
        claim_token = str(uuid.uuid4())
        record = ChatRequestRecord(
            request_id=request_id,
            student_id=_validate_student_id(student_id),
            session_id=session_id,
            request_fingerprint=request_fingerprint,
            claim_token=claim_token,
            lease_expires_at=now + timedelta(seconds=lease_seconds),
            expires_at=_chat_request_expires_at(now),
            created_at=now,
            updated_at=now,
        )
        try:
            document.create(_serialize_chat_request_for_firestore(record))
            return ChatRequestClaim(
                acquired=True, session_id=session_id, claim_token=claim_token
            )
        except AlreadyExists:
            pass

        for _ in range(5):
            snapshot = document.get()
            if not snapshot.exists:
                try:
                    document.create(_serialize_chat_request_for_firestore(record))
                    return ChatRequestClaim(
                        acquired=True,
                        session_id=session_id,
                        claim_token=claim_token,
                    )
                except AlreadyExists:
                    continue
            existing = ChatRequestRecord.model_validate(snapshot.to_dict())
            _authorize_chat_request(existing, record.student_id)
            _validate_chat_request_fingerprint(existing, request_fingerprint)
            if (
                existing.status != ChatRequestStatus.PENDING
                or not _lease_expired(existing, now)
            ):
                return ChatRequestClaim(
                    acquired=False,
                    session_id=existing.session_id,
                    response=existing.response,
                )
            existing.claim_token = claim_token
            existing.lease_expires_at = now + timedelta(seconds=lease_seconds)
            existing.expires_at = _chat_request_expires_at(now)
            existing.updated_at = now
            if not existing.request_fingerprint:
                existing.request_fingerprint = request_fingerprint
            try:
                document.update(
                    _serialize_chat_request_for_firestore(existing),
                    option=LastUpdateOption(snapshot.update_time),
                )
                return ChatRequestClaim(
                    acquired=True,
                    session_id=existing.session_id,
                    claim_token=claim_token,
                )
            except (FailedPrecondition, NotFound):
                continue
        raise SessionRepositoryError("No se pudo reclamar la solicitud de chat")

    def get_chat_request(
        self, request_id: str, student_id: str
    ) -> ChatRequestRecord | None:
        document = self._chat_request_document(student_id, request_id)
        snapshot = document.get()
        if not snapshot.exists:
            return None
        record = ChatRequestRecord.model_validate(snapshot.to_dict())
        _authorize_chat_request(record, _validate_student_id(student_id))
        if _chat_request_is_purgeable(record, self._clock()):
            # La política TTL de Firestore borra en diferido; aquí el registro
            # caducado se retira en cuanto se lee, igual que las sesiones.
            self._delete_chat_request(document, snapshot)
            return None
        return record

    def _delete_chat_request(self, document, snapshot) -> None:
        from google.api_core.exceptions import FailedPrecondition, NotFound
        from google.cloud.firestore_v1 import LastUpdateOption

        try:
            document.delete(option=LastUpdateOption(snapshot.update_time))
        except (FailedPrecondition, NotFound):
            # Otro proceso lo reescribió o lo borró: no hay nada que purgar.
            return

    def complete_chat_request(
        self,
        request_id: str,
        student_id: str,
        claim_token: str,
        response: ChatResponse,
    ) -> None:
        from google.api_core.exceptions import FailedPrecondition, NotFound
        from google.cloud.firestore_v1 import LastUpdateOption

        document = self._chat_request_document(student_id, request_id)
        for _ in range(5):
            snapshot = document.get()
            if not snapshot.exists:
                raise KeyError("No existe la solicitud de chat")
            record = ChatRequestRecord.model_validate(snapshot.to_dict())
            _authorize_chat_request(record, _validate_student_id(student_id))
            if record.status == ChatRequestStatus.COMPLETED:
                return
            _authorize_chat_request_claim(record, claim_token)
            _complete_chat_request_record(record, response, self._clock())
            try:
                document.update(
                    _serialize_chat_request_for_firestore(record),
                    option=LastUpdateOption(snapshot.update_time),
                )
                return
            except (FailedPrecondition, NotFound):
                continue
        raise SessionRepositoryError("No se pudo completar la solicitud de chat")

    def reconcile_chat_request(
        self, request_id: str, student_id: str, response: ChatResponse
    ) -> None:
        from google.api_core.exceptions import FailedPrecondition, NotFound
        from google.cloud.firestore_v1 import LastUpdateOption

        document = self._chat_request_document(student_id, request_id)
        for _ in range(5):
            snapshot = document.get()
            if not snapshot.exists:
                raise KeyError("No existe la solicitud de chat")
            record = ChatRequestRecord.model_validate(snapshot.to_dict())
            _authorize_chat_request(record, _validate_student_id(student_id))
            if record.status == ChatRequestStatus.COMPLETED:
                return
            _complete_chat_request_record(record, response, self._clock())
            try:
                document.update(
                    _serialize_chat_request_for_firestore(record),
                    option=LastUpdateOption(snapshot.update_time),
                )
                return
            except (FailedPrecondition, NotFound):
                continue
        raise SessionRepositoryError("No se pudo reconciliar la solicitud de chat")

    def release_chat_request(
        self, request_id: str, student_id: str, claim_token: str
    ) -> None:
        from google.api_core.exceptions import FailedPrecondition, NotFound
        from google.cloud.firestore_v1 import LastUpdateOption

        document = self._chat_request_document(student_id, request_id)
        snapshot = document.get()
        if not snapshot.exists:
            return
        record = ChatRequestRecord.model_validate(snapshot.to_dict())
        _authorize_chat_request(record, _validate_student_id(student_id))
        if record.status == ChatRequestStatus.PENDING:
            if record.claim_token != claim_token:
                return
            try:
                document.delete(option=LastUpdateOption(snapshot.update_time))
            except (FailedPrecondition, NotFound):
                return

    def _document(self, session_id: str):
        return self.client.collection(self.collection).document(session_id)

    def _chat_request_document(self, student_id: str, request_id: str):
        return self.client.collection(f"{self.collection}_chat_requests").document(
            _chat_request_storage_key(student_id, request_id)
        )

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
        pending_practice=(
            PendingPracticeResponse(exercise=session.pending_practice.exercise)
            if session.pending_practice
            else None
        ),
    )


def _serialize_session(session: StoredConversation) -> dict:
    payload = session.model_dump(mode="json")
    pending = session.pending_evaluation
    payload["pending_evaluation"]["quiz"]["expected_keywords"] = list(
        pending.quiz.expected_keywords
    )
    if session.pending_practice:
        payload["pending_practice"]["quiz"]["expected_keywords"] = list(
            session.pending_practice.quiz.expected_keywords
        )
    for request_id, response in session.completed_chat_requests.items():
        payload["completed_chat_requests"][request_id]["quiz"][
            "expected_keywords"
        ] = list(response.quiz.expected_keywords)
    return payload


def _serialize_chat_request(record: ChatRequestRecord) -> dict:
    payload = record.model_dump(mode="json")
    if record.response is not None:
        payload["response"]["quiz"]["expected_keywords"] = list(
            record.response.quiz.expected_keywords
        )
    return payload


def _serialize_chat_request_for_firestore(record: ChatRequestRecord) -> dict:
    """Serializa el registro dejando `expires_at` como Timestamp nativo.

    Firestore sólo aplica su política TTL sobre campos de tipo Timestamp, y
    `model_dump(mode="json")` produce cadenas ISO. Ver el README para
    habilitar la política con `gcloud firestore fields ttls update`.
    """

    payload = _serialize_chat_request(record)
    payload["expires_at"] = record.expires_at
    return payload


def _atomic_json_write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
            temporary_path = handle.name
        os.replace(temporary_path, path)
    except OSError as exc:
        if temporary_path:
            Path(temporary_path).unlink(missing_ok=True)
        raise SessionRepositoryError(f"No se pudo guardar {path}") from exc


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


def _authorize_chat_request(record: ChatRequestRecord, student_id: str) -> None:
    if record.student_id != student_id:
        raise PermissionError("La solicitud de chat pertenece a otro estudiante")


def _validate_chat_request_fingerprint(
    record: ChatRequestRecord, request_fingerprint: str
) -> None:
    if (
        record.request_fingerprint
        and record.request_fingerprint != request_fingerprint
    ):
        raise ValueError(
            "request_id ya fue utilizado con un mensaje o una sesión diferente"
        )


def _authorize_chat_request_claim(
    record: ChatRequestRecord, claim_token: str
) -> None:
    if record.claim_token != claim_token:
        raise ChatRequestLeaseLost(
            "El lease de la solicitud de chat ya no pertenece al proceso"
        )


def _lease_expired(record: ChatRequestRecord, now: datetime) -> bool:
    lease_expires_at = record.lease_expires_at
    if lease_expires_at is None:
        # Registro heredado, sin lease: se cuenta la gracia desde su última
        # escritura en lugar de declararlo vencido al instante.
        lease_expires_at = _as_utc(record.updated_at) + timedelta(
            seconds=LEGACY_LEASE_GRACE_SECONDS
        )
    return _as_utc(lease_expires_at) <= _as_utc(now)


def _chat_request_expires_at(now: datetime) -> datetime:
    return _as_utc(now) + timedelta(hours=CHAT_REQUEST_RETENTION_HOURS)


def _chat_request_is_purgeable(record: ChatRequestRecord, now: datetime) -> bool:
    expires_at = record.expires_at
    if expires_at is None:
        # Registro heredado, sin caducidad declarada: se deduce de su última
        # escritura para que el rollout también purgue lo anterior.
        expires_at = _chat_request_expires_at(record.updated_at)
    return _as_utc(expires_at) <= _as_utc(now)


def _complete_chat_request_record(
    record: ChatRequestRecord, response: ChatResponse, now: datetime
) -> None:
    record.status = ChatRequestStatus.COMPLETED
    record.response = response
    record.claim_token = None
    record.lease_expires_at = None
    record.expires_at = _chat_request_expires_at(now)
    record.updated_at = now


def _chat_request_storage_key(student_id: str, request_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"ait-chat:{student_id}:{request_id}"))


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

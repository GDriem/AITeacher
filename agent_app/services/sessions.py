"""Estado efímero de evaluaciones; Firestore lo sustituirá en producción."""

from __future__ import annotations

import threading
from dataclasses import dataclass

from agent_app.models.chat import Quiz
from mcp_learning_server.models import Topic


@dataclass(frozen=True)
class PendingEvaluation:
    student_id: str
    topic: Topic
    quiz: Quiz
    attempt: int = 1


class InMemoryEvaluationStore:
    def __init__(self) -> None:
        self._items: dict[str, PendingEvaluation] = {}
        self._lock = threading.RLock()

    def put(self, session_id: str, evaluation: PendingEvaluation) -> None:
        with self._lock:
            self._items[session_id] = evaluation

    def get(self, session_id: str) -> PendingEvaluation:
        with self._lock:
            try:
                return self._items[session_id]
            except KeyError as exc:
                raise KeyError("No existe una evaluación pendiente para la sesión") from exc

    def get_optional(self, session_id: str) -> PendingEvaluation | None:
        with self._lock:
            return self._items.get(session_id)


class SessionTopicStore:
    """Recuerda el último tema detectado por sesión.

    Permite que un mensaje de seguimiento sin palabras clave de tema
    (p. ej. "explícame por favor") continúe la conversación en vez de
    fallar la detección de intención.
    """

    def __init__(self) -> None:
        self._items: dict[str, Topic] = {}
        self._lock = threading.RLock()

    def put(self, session_id: str, topic: Topic) -> None:
        with self._lock:
            self._items[session_id] = topic

    def get(self, session_id: str) -> Topic | None:
        with self._lock:
            return self._items.get(session_id)

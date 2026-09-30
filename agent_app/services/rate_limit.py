"""Límite de tasa en memoria para las operaciones que invocan al modelo."""

from __future__ import annotations

import math
import time
from collections import deque
from collections.abc import Callable
from threading import Lock


class RateLimitExceeded(Exception):
    """Indica cuánto debe esperar el alumno antes de volver a intentar."""

    def __init__(self, retry_after: int) -> None:
        super().__init__(
            "Has enviado demasiadas solicitudes. Inténtalo de nuevo más tarde."
        )
        self.retry_after = retry_after


class StudentRateLimiter:
    """Ventana deslizante segura para varios hilos, separada por alumno.

    El estado vive únicamente en esta instancia. Con varias instancias de
    Cloud Run, el techo efectivo es el límite configurado multiplicado por el
    número de instancias; esta aproximación es suficiente para este proyecto.
    """

    def __init__(
        self,
        requests_per_minute: int,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._requests_per_minute = requests_per_minute
        self._clock = clock
        self._lock = Lock()
        self._requests: dict[str, deque[float]] = {}

    def check(self, student_id: str) -> None:
        """Registra una solicitud o lanza ``RateLimitExceeded``."""

        if self._requests_per_minute == 0:
            return

        now = self._clock()
        cutoff = now - 60
        with self._lock:
            requests = self._requests.setdefault(student_id, deque())
            while requests and requests[0] <= cutoff:
                requests.popleft()
            if len(requests) >= self._requests_per_minute:
                retry_after = max(1, math.ceil(60 - (now - requests[0])))
                raise RateLimitExceeded(retry_after)
            requests.append(now)


class StudentConcurrencyLimiter:
    """Reserva cupos de conexiones activas de forma atómica por alumno."""

    def __init__(self, max_concurrent: int) -> None:
        self._max_concurrent = max_concurrent
        self._lock = Lock()
        self._active: dict[str, int] = {}

    def acquire(self, student_id: str) -> bool:
        """Reserva un cupo si aún hay capacidad para el alumno."""

        with self._lock:
            active = self._active.get(student_id, 0)
            if active >= self._max_concurrent:
                return False
            self._active[student_id] = active + 1
            return True

    def release(self, student_id: str) -> None:
        """Libera un cupo previamente reservado."""

        with self._lock:
            active = self._active.get(student_id, 0)
            if active <= 1:
                self._active.pop(student_id, None)
            else:
                self._active[student_id] = active - 1

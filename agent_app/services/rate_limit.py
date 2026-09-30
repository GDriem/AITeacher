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

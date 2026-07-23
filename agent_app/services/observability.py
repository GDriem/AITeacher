"""Métricas agregadas en memoria, sin contenido ni identificadores de estudiantes."""

from __future__ import annotations

import math
import time
from collections import defaultdict, deque
from contextlib import contextmanager
from datetime import UTC, datetime
from threading import Lock
from typing import Iterator

from agent_app.providers.base import ModelProvider, ModelRequest


def _estimated_tokens(value: str) -> int:
    """Estimación conservadora cuando el puerto del proveedor sólo entrega texto."""

    return max(1, math.ceil(len(value) / 4))


def _latency_summary(samples: list[float]) -> dict[str, float]:
    if not samples:
        return {"average": 0.0, "p95": 0.0}
    ordered = sorted(samples)
    p95_index = max(0, math.ceil(len(ordered) * 0.95) - 1)
    return {
        "average": round(sum(ordered) / len(ordered), 2),
        "p95": round(ordered[p95_index], 2),
    }


class ObservabilityRegistry:
    """Registro acotado y seguro para varios hilos de métricas operativas."""

    def __init__(
        self,
        *,
        provider_name: str,
        input_cost_per_million_usd: float = 0,
        output_cost_per_million_usd: float = 0,
        max_latency_samples: int = 1_000,
    ) -> None:
        self.provider_name = provider_name
        self.input_cost_per_million_usd = input_cost_per_million_usd
        self.output_cost_per_million_usd = output_cost_per_million_usd
        self._started_at = datetime.now(UTC)
        self._started_monotonic = time.monotonic()
        self._lock = Lock()
        self._http_total = 0
        self._http_errors = 0
        self._http_latency: deque[float] = deque(maxlen=max_latency_samples)
        self._routes: dict[str, dict[str, int | deque[float]]] = {}
        self._model_calls = 0
        self._model_errors = 0
        self._model_input_tokens = 0
        self._model_output_tokens = 0
        self._model_latency: deque[float] = deque(maxlen=max_latency_samples)
        self._activities: dict[str, dict[str, int]] = defaultdict(
            lambda: {"started": 0, "completed": 0, "errors": 0}
        )
        self._max_latency_samples = max_latency_samples

    def record_http(
        self,
        *,
        method: str,
        route: str,
        status_code: int,
        duration_ms: float,
    ) -> None:
        key = f"{method.upper()} {route}"
        with self._lock:
            self._http_total += 1
            self._http_errors += int(status_code >= 400)
            self._http_latency.append(duration_ms)
            route_metrics = self._routes.setdefault(
                key,
                {
                    "requests": 0,
                    "errors": 0,
                    "latency": deque(maxlen=self._max_latency_samples),
                },
            )
            route_metrics["requests"] = int(route_metrics["requests"]) + 1
            route_metrics["errors"] = int(route_metrics["errors"]) + int(
                status_code >= 400
            )
            latency = route_metrics["latency"]
            assert isinstance(latency, deque)
            latency.append(duration_ms)

    def record_model(
        self,
        *,
        input_tokens: int,
        output_tokens: int,
        duration_ms: float,
        failed: bool,
    ) -> None:
        with self._lock:
            self._model_calls += 1
            self._model_errors += int(failed)
            self._model_input_tokens += input_tokens
            self._model_output_tokens += output_tokens
            self._model_latency.append(duration_ms)

    @contextmanager
    def activity(self, name: str) -> Iterator[None]:
        with self._lock:
            self._activities[name]["started"] += 1
        try:
            yield
        except Exception:
            with self._lock:
                self._activities[name]["errors"] += 1
            raise
        else:
            with self._lock:
                self._activities[name]["completed"] += 1

    def snapshot(self) -> dict:
        with self._lock:
            routes = []
            for route, values in sorted(self._routes.items()):
                requests = int(values["requests"])
                errors = int(values["errors"])
                latency = values["latency"]
                assert isinstance(latency, deque)
                routes.append(
                    {
                        "route": route,
                        "requests": requests,
                        "errors": errors,
                        "error_rate": round(errors / requests, 4)
                        if requests
                        else 0,
                        "latency_ms": _latency_summary(list(latency)),
                    }
                )
            activities = []
            for name, values in sorted(self._activities.items()):
                started = values["started"]
                completed = values["completed"]
                activities.append(
                    {
                        "name": name,
                        **values,
                        "completion_rate": round(completed / started, 4)
                        if started
                        else 0,
                    }
                )
            input_tokens = self._model_input_tokens
            output_tokens = self._model_output_tokens
            estimated_cost = (
                input_tokens * self.input_cost_per_million_usd
                + output_tokens * self.output_cost_per_million_usd
            ) / 1_000_000
            return {
                "status": "ok",
                "generated_at": datetime.now(UTC).isoformat(),
                "started_at": self._started_at.isoformat(),
                "uptime_seconds": round(
                    max(0, time.monotonic() - self._started_monotonic), 2
                ),
                "http": {
                    "requests": self._http_total,
                    "errors": self._http_errors,
                    "error_rate": round(self._http_errors / self._http_total, 4)
                    if self._http_total
                    else 0,
                    "latency_ms": _latency_summary(list(self._http_latency)),
                    "routes": routes,
                },
                "model": {
                    "provider": self.provider_name,
                    "calls": self._model_calls,
                    "errors": self._model_errors,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "tokens_estimated": True,
                    "estimated_cost_usd": round(estimated_cost, 6),
                    "pricing_configured": bool(
                        self.input_cost_per_million_usd
                        or self.output_cost_per_million_usd
                    ),
                    "latency_ms": _latency_summary(list(self._model_latency)),
                },
                "activities": activities,
            }


class ObservableModelProvider:
    """Decorador que mide el puerto de modelos sin cambiar su contrato."""

    def __init__(
        self,
        provider: ModelProvider,
        registry: ObservabilityRegistry,
    ) -> None:
        self._provider = provider
        self._registry = registry
        self.name = provider.name

    async def generate(self, request: ModelRequest) -> str:
        started = time.perf_counter()
        request_text = f"{request.system_instruction}\n{request.prompt}"
        input_tokens = _estimated_tokens(request_text)
        try:
            response = await self._provider.generate(request)
        except Exception:
            self._registry.record_model(
                input_tokens=input_tokens,
                output_tokens=0,
                duration_ms=(time.perf_counter() - started) * 1_000,
                failed=True,
            )
            raise
        self._registry.record_model(
            input_tokens=input_tokens,
            output_tokens=_estimated_tokens(response),
            duration_ms=(time.perf_counter() - started) * 1_000,
            failed=False,
        )
        return response

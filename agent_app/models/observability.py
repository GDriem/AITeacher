"""Contrato tipado del panel de salud y telemetría agregada."""

from pydantic import BaseModel


class LatencySummary(BaseModel):
    average: float
    p95: float


class RouteMetrics(BaseModel):
    route: str
    requests: int
    errors: int
    error_rate: float
    latency_ms: LatencySummary


class HttpMetrics(BaseModel):
    requests: int
    errors: int
    error_rate: float
    latency_ms: LatencySummary
    routes: list[RouteMetrics]


class ModelMetrics(BaseModel):
    provider: str
    calls: int
    errors: int
    input_tokens: int
    output_tokens: int
    tokens_estimated: bool
    estimated_cost_usd: float
    pricing_configured: bool
    latency_ms: LatencySummary


class ActivityMetrics(BaseModel):
    name: str
    started: int
    completed: int
    errors: int
    completion_rate: float


class ObservabilitySnapshot(BaseModel):
    status: str
    generated_at: str
    started_at: str
    uptime_seconds: float
    http: HttpMetrics
    model: ModelMetrics
    activities: list[ActivityMetrics]

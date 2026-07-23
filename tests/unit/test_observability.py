import pytest

from agent_app.providers.base import ModelRequest
from agent_app.services.observability import (
    ObservableModelProvider,
    ObservabilityRegistry,
)


class StubProvider:
    name = "stub"

    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail

    async def generate(self, _: ModelRequest) -> str:
        if self.fail:
            raise RuntimeError("provider unavailable")
        return "respuesta medible"


def test_registry_aggregates_latency_errors_cost_and_activity_completion() -> None:
    registry = ObservabilityRegistry(
        provider_name="stub",
        input_cost_per_million_usd=2,
        output_cost_per_million_usd=4,
    )
    registry.record_http(
        method="GET", route="/api/topics", status_code=200, duration_ms=10
    )
    registry.record_http(
        method="GET", route="/api/topics", status_code=503, duration_ms=30
    )
    registry.record_model(
        input_tokens=1_000,
        output_tokens=500,
        duration_ms=25,
        failed=False,
    )
    with registry.activity("topic_evaluation"):
        pass
    with pytest.raises(RuntimeError):
        with registry.activity("topic_evaluation"):
            raise RuntimeError("evaluation failed")

    snapshot = registry.snapshot()

    assert snapshot["http"]["requests"] == 2
    assert snapshot["http"]["errors"] == 1
    assert snapshot["http"]["error_rate"] == 0.5
    assert snapshot["http"]["latency_ms"] == {"average": 20.0, "p95": 30}
    assert snapshot["http"]["routes"][0]["route"] == "GET /api/topics"
    assert snapshot["model"]["input_tokens"] == 1_000
    assert snapshot["model"]["output_tokens"] == 500
    assert snapshot["model"]["tokens_estimated"] is True
    assert snapshot["model"]["estimated_cost_usd"] == 0.004
    assert snapshot["model"]["pricing_configured"] is True
    assert snapshot["activities"] == [
        {
            "name": "topic_evaluation",
            "started": 2,
            "completed": 1,
            "errors": 1,
            "completion_rate": 0.5,
        }
    ]


@pytest.mark.asyncio
async def test_observable_provider_counts_success_and_failure_without_prompts() -> None:
    registry = ObservabilityRegistry(provider_name="stub")
    request = ModelRequest(
        system_instruction="Instrucción privada",
        prompt="Respuesta privada del estudiante",
    )

    result = await ObservableModelProvider(
        StubProvider(), registry
    ).generate(request)
    with pytest.raises(RuntimeError, match="provider unavailable"):
        await ObservableModelProvider(
            StubProvider(fail=True), registry
        ).generate(request)

    assert result == "respuesta medible"
    snapshot = registry.snapshot()
    assert snapshot["model"]["calls"] == 2
    assert snapshot["model"]["errors"] == 1
    assert snapshot["model"]["input_tokens"] > 0
    assert snapshot["model"]["output_tokens"] > 0
    assert "privada" not in str(snapshot).lower()

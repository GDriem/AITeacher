import type { ObservabilitySnapshot } from "../../features/observability/observabilityApi";

export const observabilityFixture = {
  status: "ok",
  generated_at: "2026-08-15T16:00:00Z",
  started_at: "2026-08-15T12:00:00Z",
  uptime_seconds: 14_400,
  http: {
    requests: 42,
    errors: 1,
    error_rate: 0.0238,
    latency_ms: { average: 120.5, p95: 340.2 },
    routes: [
      { route: "GET /api/topics", requests: 20, errors: 0, error_rate: 0, latency_ms: { average: 80, p95: 150 } },
    ],
  },
  model: {
    provider: "mock",
    calls: 8,
    errors: 0,
    input_tokens: 2_400,
    output_tokens: 1_100,
    tokens_estimated: true,
    estimated_cost_usd: 0,
    pricing_configured: false,
    latency_ms: { average: 900.4, p95: 1_500.1 },
  },
  activities: [
    { name: "guided_explanation", started: 5, completed: 5, errors: 0, completion_rate: 1 },
    { name: "topic_evaluation", started: 2, completed: 2, errors: 0, completion_rate: 1 },
  ],
} satisfies ObservabilitySnapshot;

import { apiClient, apiError } from "../../api/client";
import type { components } from "../../api/generated/schema";

export type ObservabilitySnapshot = components["schemas"]["ObservabilitySnapshot"];

export async function getObservabilitySnapshot(signal?: AbortSignal) {
  const result = await apiClient.GET("/api/observability", { signal });

  if (!result.data) {
    throw apiError(result.response, result.error);
  }

  return result.data;
}

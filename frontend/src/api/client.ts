import createClient from "openapi-fetch";

import { ApiError, errorMessage } from "./ApiError";
import type { paths } from "./generated/schema";

const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;

export const apiClient = createClient<paths>({
  baseUrl: origin,
  credentials: "same-origin",
  headers: {
    Accept: "application/json",
  },
});

export function apiError(response: Response, error: unknown): ApiError {
  return new ApiError(errorMessage(error, response.status), {
    status: response.status,
    correlationId: response.headers.get("x-correlation-id"),
    details: error,
  });
}

import createClient from "openapi-fetch";
import { ApiError, errorMessage } from "../../api/ApiError";
import { notifyUnauthorized } from "../../api/authEvents";
import type { paths, components } from "../../api/generated/backend-schema";

export type Schema = components["schemas"];
// The middleware owns the mandatory CSRF header; callers retain all other contract types.
type ManagedOperation<T> = T extends { parameters: infer P }
  ? Omit<T, "parameters"> & { parameters: Omit<P, "header"> & { header?: P extends { header: infer H } ? Omit<H, "X-CSRF-TOKEN"> : never } }
  : T;
type ManagedPaths = { [Path in keyof paths]: { [Method in keyof paths[Path]]: ManagedOperation<paths[Path][Method]> } };
export const backend = createClient<ManagedPaths>({ baseUrl: window.location.origin, credentials: "same-origin", cache: "no-store" });
backend.use({
  async onRequest({ request }) {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const response = await fetch("/api/auth/csrf", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new ApiError("No pudimos preparar la solicitud segura.", { status: response.status });
      const tokens: unknown = await response.json();
      if (!tokens || typeof tokens !== "object" || !("requestToken" in tokens) || typeof tokens.requestToken !== "string" || !tokens.requestToken)
        throw new ApiError("No pudimos preparar la solicitud segura.", { status: 502 });
      request.headers.set("X-CSRF-TOKEN", tokens.requestToken);
    }
    return request;
  },
  onResponse({ response }) {
    if (response.status === 401) notifyUnauthorized();
    return response;
  },
});

// ASP.NET Core añade `traceId` a cada ProblemDetails; se muestra para que el alumno pueda citarlo.
function traceId(error: unknown) {
  return typeof error === "object" && error !== null && "traceId" in error && typeof error.traceId === "string" ? error.traceId : null;
}

export function result<T>(response: { data?: T; error?: unknown; response: Response }): T {
  if (response.data !== undefined) return response.data;
  throw new ApiError(errorMessage(response.error, response.response.status), { status: response.response.status, correlationId: traceId(response.error) });
}

export function message(error: unknown) {
  return error instanceof ApiError ? error.message : "No pudimos completar la operación. Intenta nuevamente.";
}

export function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing selection");
  return value;
}

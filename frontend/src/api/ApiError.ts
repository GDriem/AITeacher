export class ApiError extends Error {
  readonly status: number;
  readonly correlationId: string | null;
  readonly details: unknown;

  constructor(
    message: string,
    options: {
      status: number;
      correlationId?: string | null;
      details?: unknown;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.correlationId = options.correlationId ?? null;
    this.details = options.details;
  }
}

function validationMessage(detail: unknown): string | null {
  if (!Array.isArray(detail)) return null;
  const first: unknown = detail.at(0);
  if (typeof first !== "object" || first === null || !("msg" in first)) return null;
  return typeof first.msg === "string" ? first.msg : null;
}

export function errorMessage(error: unknown, status: number): string {
  if (typeof error === "object" && error !== null && "detail" in error) {
    const detail = error.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    const message = validationMessage(detail);
    if (message) return message;
  }

  if (status >= 500) {
    return "El servicio de aprendizaje no está disponible en este momento.";
  }

  return "La solicitud no pudo completarse.";
}

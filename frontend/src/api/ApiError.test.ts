import { describe, expect, it } from "vitest";

import { errorMessage } from "./ApiError";

describe("errorMessage", () => {
  it("normaliza errores FastAPI de detalle simple y validación", () => {
    expect(errorMessage({ detail: "Sesión no encontrada" }, 404)).toBe("Sesión no encontrada");
    expect(errorMessage({ detail: [{ msg: "Campo obligatorio" }] }, 422)).toBe("Campo obligatorio");
  });

  it("evita exponer respuestas internas del servidor", () => {
    expect(errorMessage({ internal: "trace" }, 500)).toBe(
      "El servicio de aprendizaje no está disponible en este momento.",
    );
  });
});

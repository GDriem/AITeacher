import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/ApiError";
import { result, statusMessage } from "./client";

describe("mensajes de error del backend .NET", () => {
  it("traduce el estado a un mensaje con acción", () => {
    expect(statusMessage(409)).toMatch(/Recarga la página/);
    expect(statusMessage(503)).toMatch(/vuelve a intentarlo/);
  });

  it("no expone el título en inglés ni el detalle de ProblemDetails", () => {
    const response = new Response(null, { status: 409 });
    expect(() => result({ error: { title: "Editorial unit has changed", detail: "unit-42", traceId: "00-abc-01" }, response })).toThrow(ApiError);
    try { result({ error: { title: "Editorial unit has changed", detail: "unit-42", traceId: "00-abc-01" }, response }); } catch (error) {
      expect(error).toMatchObject({ message: statusMessage(409), status: 409, correlationId: "00-abc-01" });
    }
  });
});

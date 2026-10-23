import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { Schema } from "./client";
import { appendTurn, messagesKey, type MessageHistory } from "./tutorQueries";

const message = (sequence: number): Schema["TutorMessage"] => ({ id: `m${String(sequence)}`, turnId: "t", sequence, role: sequence % 2 ? "assistant" : "user", text: `Mensaje ${String(sequence)}`,
  createdAt: new Date().toISOString(), sources: [] });
const turn = (...sequences: number[]) => ({ id: "t", conversationId: "c", state: "completed", version: 1, messages: sequences.map(message) }) as unknown as Schema["TutorTurnResult"];
// Dos ventanas cargadas: la anterior (2–5) y la más reciente (6–9) de 8 mensajes.
const cached = (): MessageHistory => ({
  pages: [{ items: [2, 3, 4, 5].map(message), total: 8, offset: 0, limit: 4 }, { items: [6, 7, 8, 9].map(message), total: 8, offset: 4, limit: 4 }],
  pageParams: [{ offset: 0, limit: 4 }, null],
});
const setup = () => {
  const queries = new QueryClient();
  queries.setQueryData(messagesKey("c"), cached());
  return { queries, reset: vi.spyOn(queries, "resetQueries") };
};

describe("appendTurn", () => {
  it("añade el turno contiguo a la ventana más reciente sin volver a pedir el historial", () => {
    const { queries, reset } = setup();
    appendTurn(queries, "c", turn(10, 11));
    const history = queries.getQueryData<MessageHistory>(messagesKey("c"));
    expect(history?.pages.map((page) => page.items.map((item) => item.sequence))).toEqual([[2, 3, 4, 5], [6, 7, 8, 9, 10, 11]]);
    expect(history?.pages.map((page) => page.total)).toEqual([10, 10]);
    expect(reset).not.toHaveBeenCalled();
  });

  it("no duplica el mensaje del alumno de un turno recuperado", () => {
    const { queries, reset } = setup();
    queries.setQueryData<MessageHistory>(messagesKey("c"), (history) => history && { ...history, pages: [history.pages[0], { ...history.pages[1], items: [7, 8].map(message) }] } as MessageHistory);
    appendTurn(queries, "c", turn(8, 9));
    expect(queries.getQueryData<MessageHistory>(messagesKey("c"))?.pages[1]?.items.map((item) => item.sequence)).toEqual([7, 8, 9]);
    expect(reset).not.toHaveBeenCalled();
  });

  it("vuelve a abrir en la ventana más reciente si hubo turnos desde otro dispositivo", () => {
    const { queries, reset } = setup();
    appendTurn(queries, "c", turn(12, 13));
    expect(reset).toHaveBeenCalledExactlyOnceWith({ queryKey: messagesKey("c") });
  });

  it("vuelve a pedir el historial si no había mensajes en caché", () => {
    const queries = new QueryClient();
    const reset = vi.spyOn(queries, "resetQueries");
    appendTurn(queries, "c", turn(2, 3));
    expect(reset).toHaveBeenCalledExactlyOnceWith({ queryKey: messagesKey("c") });
  });
});

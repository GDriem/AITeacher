import axe from "axe-core";
import { delay, http, HttpResponse } from "msw";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { observabilityFixture } from "../../test/fixtures/observability";
import { sessionDetail, sessionsFixture } from "../../test/fixtures/sessions";
import { chatResponseFixture } from "../../test/fixtures/tutor";
import {
  evaluationFixture,
  nextPracticeExerciseFixture,
  practiceEvaluationFixture,
  practiceExerciseFixture,
  practiceStartFixture,
} from "../../test/fixtures/learningCycle";
import { renderTutor } from "../../test/renderTutor";
import { server } from "../../test/server";

function useRestoredSession() {
  server.use(
    http.get("http://localhost:4173/api/sessions", () => HttpResponse.json(sessionsFixture)),
    http.get("http://localhost:4173/api/sessions/:sessionId", ({ params }) =>
      HttpResponse.json(sessionDetail(String(params.sessionId))),
    ),
  );
}

function detailForExchange(message: string, answer = chatResponseFixture.answer) {
  const detail = sessionDetail("session-vectors");
  return {
    ...detail,
    messages: [
      { id: "persisted-user", role: "user" as const, label: "Tú", content: message, sources: [], note: "", created_at: "2026-08-13T16:00:00Z" },
      { id: "persisted-tutor", role: "assistant" as const, label: "Tutor Agent", content: answer, sources: chatResponseFixture.sources, note: "", created_at: "2026-08-13T16:00:01Z" },
    ],
  };
}

describe("TutorScreen", () => {
  it("ofrece explorar o tomar la prueba sin pedir una respuesta automáticamente", async () => {
    useRestoredSession();
    const user = userEvent.setup();
    renderTutor({ activeSessionId: "session-vectors" });
    const explore = await screen.findByRole("button", { name: "Profundizar en el tema" });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(explore);
    expect(screen.getByRole("textbox", { name: "Escribe tu mensaje" })).toHaveFocus();
    expect(screen.queryByRole("textbox", { name: "Explícalo con tus propias palabras" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tomar la prueba" }));
    expect(screen.getByRole("textbox", { name: "Explícalo con tus propias palabras" })).toHaveFocus();
    expect(screen.queryByRole("textbox", { name: "Escribe tu mensaje" })).not.toBeInTheDocument();
  });

  it("al abrir una conversación guardada mantiene el foco en el encabezado", async () => {
    useRestoredSession();
    renderTutor({ activeSessionId: "session-vectors" });

    const heading = await screen.findByRole("heading", { level: 1, name: "Vectores semánticos" });
    expect(await screen.findByRole("button", { name: "Profundizar en el tema" })).toBeVisible();
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("restaura el feed, renderiza Markdown seguro, fuentes y foco sin hallazgos axe", async () => {
    useRestoredSession();
    const { container } = renderTutor({ activeSessionId: "session-vectors" });

    expect(await screen.findByRole("heading", { name: "Vectores semánticos" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "Profundizar en el tema" })).toBeVisible();
    expect(await screen.findByRole("heading", { level: 3, name: "Idea central" })).toBeVisible();
    expect(screen.getByText("representa significado con números.", { exact: false })).toBeVisible();
    expect(screen.queryByText("window.__xss = true")).not.toBeInTheDocument();
    expect(screen.getByText("Enlace bloqueado").closest("a")).toBeNull();
    expect(screen.getByRole("region", { name: "Fuentes de la respuesta" })).toHaveTextContent("Currículo AITeacher");
    expect(screen.getByText("Continúa con un ejemplo propio.")).toBeVisible();
    expect(screen.getByText("nunca razonamiento interno", { exact: false })).toBeVisible();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("envía una sola vez, conserva el orden, publica la traza y devuelve el foco", async () => {
    let chatCalls = 0;
    let created = false;
    const message = "Explícame cómo comparar embeddings";
    server.use(
      http.get("http://localhost:4173/api/sessions", () =>
        HttpResponse.json(created ? sessionsFixture : { sessions: [], retention_days: 365 }),
      ),
      http.get("http://localhost:4173/api/sessions/:sessionId", () => HttpResponse.json(detailForExchange(message))),
      http.post("http://localhost:4173/api/chat", async () => {
        chatCalls += 1;
        created = true;
        await delay(20);
        return HttpResponse.json(chatResponseFixture);
      }),
    );
    const user = userEvent.setup();
    renderTutor();
    const input = await screen.findByRole("textbox", { name: "Escribe tu mensaje" });
    await user.type(input, message);
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    const form = input.closest("form");
    if (!form) throw new Error("No se encontró el composer.");
    fireEvent.submit(form);

    expect(screen.getByRole("button", { name: "Cancelar envío" })).toBeVisible();
    expect(screen.getByText(message)).toBeVisible();
    expect(await screen.findByRole("heading", { level: 3, name: "Una representación útil" })).toBeVisible();
    const feed = screen.getByRole("heading", { name: "Conversación" }).parentElement;
    if (!feed) throw new Error("No se encontró el feed.");
    const messages = within(feed).getAllByRole("listitem");
    expect(messages.at(0)).toHaveTextContent(message);
    expect(messages.at(1)).toHaveTextContent("embedding convierte significado");
    expect(chatCalls).toBe(1);
    expect(window.localStorage.getItem("activeSession:student-test")).toBe("session-vectors");
    expect(screen.getByText("La explicación quedó preparada.")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Profundizar en el tema" })).toHaveFocus());
  });

  it("al dejar de esperar reintenta con la misma clave y descarta la respuesta tardía", async () => {
    let call = 0;
    const requests: { request_id?: string; message?: string }[] = [];
    let releaseFirst: () => void = () => undefined;
    const firstPending = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let created = false;
    server.use(
      http.get("http://localhost:4173/api/sessions", () =>
        HttpResponse.json(created ? sessionsFixture : { sessions: [], retention_days: 365 }),
      ),
      http.get("http://localhost:4173/api/sessions/:sessionId", () => HttpResponse.json(detailForExchange("Primer mensaje", "Respuesta vigente"))),
      http.post("http://localhost:4173/api/chat", async ({ request }) => {
        requests.push(await request.json() as { request_id?: string; message?: string });
        call += 1;
        if (call === 1) {
          await firstPending;
          return HttpResponse.json({ ...chatResponseFixture, answer: "Respuesta obsoleta" });
        }
        created = true;
        return HttpResponse.json({ ...chatResponseFixture, answer: "Respuesta vigente" });
      }),
    );
    const user = userEvent.setup();
    renderTutor();
    const input = await screen.findByRole("textbox", { name: "Escribe tu mensaje" });
    await user.type(input, "Primer mensaje");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar envío" }));
    expect(await screen.findByText("Dejaste de esperar la respuesta. El envío puede completarse; reintentar recupera el mismo resultado.")).toBeInTheDocument();
    expect(input).toHaveValue("Primer mensaje");

    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText("Respuesta vigente")).toBeVisible();
    releaseFirst();
    await delay(10);
    expect(screen.queryByText("Respuesta obsoleta")).not.toBeInTheDocument();
    expect(call).toBe(2);
    expect(requests[0]).toMatchObject({ message: "Primer mensaje" });
    expect(requests[0]?.request_id).toBeTruthy();
    expect(requests[1]?.request_id).toBe(requests[0]?.request_id);
  });

  it("al cambiar de conversación no afirma que el servidor canceló el envío", async () => {
    let releaseChat: () => void = () => undefined;
    const chatPending = new Promise<void>((resolve) => { releaseChat = resolve; });
    server.use(
      http.get("http://localhost:4173/api/sessions", () => HttpResponse.json(sessionsFixture)),
      http.get("http://localhost:4173/api/sessions/:sessionId", ({ params }) =>
        HttpResponse.json(sessionDetail(String(params.sessionId))),
      ),
      http.post("http://localhost:4173/api/chat", async () => {
        await chatPending;
        return HttpResponse.json({ ...chatResponseFixture, answer: "Respuesta de la sesión anterior" });
      }),
    );
    const user = userEvent.setup();
    renderTutor({ activeSessionId: "session-vectors" });
    await user.click(await screen.findByRole("button", { name: "Profundizar en el tema" }));
    const input = await screen.findByRole("textbox", { name: "Escribe tu mensaje" });
    await user.type(input, "Mensaje pendiente al cambiar");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(screen.getByRole("button", { name: "Cancelar envío" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Conversaciones" }));
    const agentsRow = screen.getByText("Agentes y herramientas").closest("li");
    if (!agentsRow) throw new Error("No se encontró la conversación alternativa.");
    await user.click(within(agentsRow).getByRole("button", { name: "Abrir" }));

    expect(await screen.findByText("Dejaste de esperar el envío anterior; puede completarse en su conversación original.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Escribe tu mensaje" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("activeSession:student-test")).toBe("session-agents");
    releaseChat();
    await delay(10);
    expect(screen.queryByText("Respuesta de la sesión anterior")).not.toBeInTheDocument();
  });

  it("recupera un fallo del historial mediante reintento", async () => {
    let calls = 0;
    server.use(
      http.get("http://localhost:4173/api/sessions", () => HttpResponse.json(sessionsFixture)),
      http.get("http://localhost:4173/api/sessions/:sessionId", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ detail: "No disponible" }, { status: 503 })
          : HttpResponse.json(sessionDetail("session-vectors"));
      }),
    );
    const user = userEvent.setup();
    renderTutor({ activeSessionId: "session-vectors" });

    expect(await screen.findByText("No pudimos recuperar la conversación.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Explícame los embeddings")).toBeVisible();
  });

  it("evalúa con rúbrica, conserva la respuesta al fallar y ofrece acciones pedagógicas", async () => {
    let evaluationCalls = 0;
    let tutorPrompt: unknown;
    const detail = sessionDetail("session-vectors");
    server.use(
      http.get("http://localhost:4173/api/sessions", () => HttpResponse.json(sessionsFixture)),
      http.get("http://localhost:4173/api/sessions/:sessionId", () => HttpResponse.json(detail)),
      http.post("http://localhost:4173/api/evaluate", () => {
        evaluationCalls += 1;
        if (evaluationCalls === 1) return HttpResponse.json({ detail: "Evaluador temporalmente ocupado" }, { status: 503 });
        detail.pending_quiz = { question: evaluationFixture.next_quiz.question, attempt: 2 };
        return HttpResponse.json(evaluationFixture);
      }),
      http.post("http://localhost:4173/api/chat", async ({ request }) => {
        tutorPrompt = await request.json();
        return HttpResponse.json({ ...chatResponseFixture, quiz_attempt: 2, quiz: evaluationFixture.next_quiz });
      }),
    );
    const user = userEvent.setup();
    renderTutor({ activeSessionId: "session-vectors" });

    await user.click(await screen.findByRole("button", { name: "Tomar la prueba" }));
    const answer = await screen.findByRole("textbox", { name: "Explícalo con tus propias palabras" });
    await user.type(answer, "Un embedding representa significado y permite comparar cercanía.");
    await user.click(screen.getByRole("button", { name: "Recibir feedback" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Evaluador temporalmente ocupado");
    expect(answer).toHaveValue("Un embedding representa significado y permite comparar cercanía.");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("heading", { name: "Conecta una idea más" })).toHaveFocus();
    expect(screen.getByLabelText("Puntuación 82 de 100")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Rúbrica de comprensión" })).toBeVisible();
    expect(screen.getByLabelText("Aplicación: 2 de 4")).toBeVisible();
    expect(screen.getAllByText("similitud vectorial", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Tu ruta viva" })).toBeVisible();
    expect(screen.getByText("Embeddings y similitud")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Explicación más simple" }));
    await waitFor(() => expect(tutorPrompt).toMatchObject({ message: "Explícamelo más fácil usando una analogía." }));
  });

  it("inicia, evalúa y continúa práctica sin perder la pregunta principal", async () => {
    const detail = sessionDetail("session-vectors");
    let practiceConcept: unknown;
    server.use(
      http.get("http://localhost:4173/api/sessions", () => HttpResponse.json(sessionsFixture)),
      http.get("http://localhost:4173/api/sessions/:sessionId", () => HttpResponse.json(detail)),
      http.post("http://localhost:4173/api/evaluate", () => {
        detail.pending_quiz = { question: evaluationFixture.next_quiz.question, attempt: 2 };
        return HttpResponse.json(evaluationFixture);
      }),
      http.post("http://localhost:4173/api/practice/start", async ({ request }) => {
        practiceConcept = await request.json();
        detail.pending_practice = { exercise: practiceExerciseFixture };
        return HttpResponse.json(practiceStartFixture);
      }),
      http.post("http://localhost:4173/api/practice/evaluate", () => {
        detail.pending_practice = { exercise: nextPracticeExerciseFixture };
        return HttpResponse.json(practiceEvaluationFixture);
      }),
    );
    const user = userEvent.setup();
    renderTutor({ activeSessionId: "session-vectors" });

    await user.click(await screen.findByRole("button", { name: "Tomar la prueba" }));
    await user.type(await screen.findByRole("textbox", { name: "Explícalo con tus propias palabras" }), "Los vectores cercanos conservan significados parecidos.");
    await user.click(screen.getByRole("button", { name: "Recibir feedback" }));
    await user.click(await screen.findByRole("button", { name: "Practicar similitud vectorial" }));
    expect(await screen.findByRole("heading", { name: "Compara dos intenciones" })).toBeVisible();
    expect(practiceConcept).toMatchObject({ focus_concept: "similitud vectorial" });

    await user.type(screen.getByRole("textbox", { name: "Tu resolución" }), "La consulta sobre vectores queda más cerca porque comparte intención.");
    await user.click(screen.getByRole("button", { name: "Comprobar práctica" }));
    expect(await screen.findByRole("heading", { name: "88/100 · Resultado de práctica" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Siguiente ejercicio" }));
    expect(screen.getByRole("heading", { name: "Diseña una búsqueda semántica" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Volver a la pregunta principal" }));
    expect(screen.getByText(evaluationFixture.next_quiz.question)).toBeVisible();
  });

  it("reanuda la práctica pendiente después de restaurar la conversación", async () => {
    const restored = { ...sessionDetail("session-vectors"), pending_practice: { exercise: nextPracticeExerciseFixture } };
    server.use(
      http.get("http://localhost:4173/api/sessions", () => HttpResponse.json(sessionsFixture)),
      http.get("http://localhost:4173/api/sessions/:sessionId", () => HttpResponse.json(restored)),
    );
    const user = userEvent.setup();
    renderTutor({ activeSessionId: "session-vectors" });

    await user.click(await screen.findByRole("button", { name: "Tomar la prueba" }));
    await user.click(await screen.findByRole("button", { name: "Reanudar práctica · ronda 2" }));
    expect(screen.getByRole("heading", { name: "Diseña una búsqueda semántica" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Tu resolución" })).toBeVisible();
  });

  it("muestra las señales de operación, recupera un fallo y permite actualizar manualmente", async () => {
    let calls = 0;
    server.use(
      http.get("http://localhost:4173/api/sessions", () => HttpResponse.json(sessionsFixture)),
      http.get("http://localhost:4173/api/sessions/:sessionId", ({ params }) =>
        HttpResponse.json(sessionDetail(String(params.sessionId))),
      ),
      http.get("http://localhost:4173/api/observability", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ detail: "No disponible" }, { status: 503 })
          : HttpResponse.json(observabilityFixture);
      }),
    );
    const user = userEvent.setup();
    renderTutor({ activeSessionId: "session-vectors" });

    expect(await screen.findByText("No pudimos consultar las señales.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Operación" })).toBeVisible();
    expect(screen.getByText("Servicio disponible")).toBeVisible();
    expect(screen.getByText("Explicaciones")).toBeVisible();
    expect(screen.getByText("5/5")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(calls).toBe(3);
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { server } from "../../test/server";
import { Tutor } from "./Tutor";
import { required, type Schema } from "./client";

const testUnit = { id: "unit", topicId: "topic", revision: { id: "r1", document: { readings: [{ id: "reading", title: "Vectores" }], exercises: [{ id: "exercise" }] } } } as Schema["UnitResponse"];
const page = <T,>(items: T[], total = items.length, offset = 0) => ({ items, total, offset, limit: 20 });

// Igual que la ruta del tutor: la conversación abierta es estado externo y cambiarla remonta el componente.
function RoutedTutor({ unit }: { unit: Schema["UnitResponse"] }) {
  const [id, setId] = useState<string | null>(null);
  return <Tutor key={id ?? "nueva"} unit={unit} mode="chat" conversationId={id} openConversation={setId} />;
}

it("recupera tras remontar la solicitud persistida, conserva el cuerpo en 409 y no crea otro turno", async () => {
  const origin = window.location.origin;
  const unit = testUnit;
  const original = { requestId: crypto.randomUUID(), version: 1, text: "Mi mensaje anterior" };
  const conversation = { id: "conversation", unitId: "unit", revisionId: "r1", mode: "chat", version: 2, activeTurnId: "turn", createdAt: new Date().toISOString() };
  let pending = true;
  const bodies: unknown[] = [];
  server.use(
    http.get(`${origin}/api/tutor/voice`, () => HttpResponse.json({ enabled: false })),
    http.get(`${origin}/api/tutor/conversations`, () => HttpResponse.json({ items: [conversation], total: 1 })),
    http.get(`${origin}/api/tutor/conversations/conversation`, () => HttpResponse.json({ ...conversation, activeTurnId: pending ? "turn" : null })),
    http.get(`${origin}/api/tutor/conversations/conversation/pending-turn`, () => HttpResponse.json({ request: pending ? original : null, leaseUntil: pending ? new Date().toISOString() : null })),
    http.get(`${origin}/api/tutor/conversations/conversation/messages`, () => HttpResponse.json({ items: [], total: pending ? 1 : 2 })),
    http.get(`${origin}/api/graphs/revisions`, () => HttpResponse.json({ items: [], total: 0 })),
    http.get(`${origin}/api/auth/csrf`, () => HttpResponse.json({ requestToken: "test" })),
    http.post(`${origin}/api/tutor/conversations/conversation/turns`, async ({ request }) => {
      bodies.push(await request.json());
      if (bodies.length === 1) return HttpResponse.json({ title: "Lease activo" }, { status: 409 });
      pending = false;
      if (bodies.length === 2) return HttpResponse.json({}, { status: 503 });
      return HttpResponse.json({ id: "turn", version: 2, messages: [] });
    }),
  );
  const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><RoutedTutor unit={unit} /></QueryClientProvider>);
  const user = userEvent.setup();
  const first = mount();
  await user.click(await screen.findByRole("button", { name: /^Conversación libre/ }));
  await screen.findByRole("button", { name: "Recuperar mensaje pendiente" });
  first.unmount(); // React loses all in-memory state, including its original request ref/cache.
  mount();
  await user.click(await screen.findByRole("button", { name: /^Conversación libre/ }));
  await user.click(await screen.findByRole("button", { name: "Recuperar mensaje pendiente" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Recuperar mensaje pendiente" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Recuperar mensaje pendiente" })).not.toBeInTheDocument());
  // A failed recovered request releases the server reservation; retry still uses the saved original.
  await user.click(screen.getByRole("button", { name: "Reintentar" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(bodies).toEqual([original, original, original]);
  expect(screen.getByLabelText("Tu mensaje")).toBeEnabled();
});

it("permite una nueva conversación después de un error de envío", async () => {
  const origin = window.location.origin;
  const unit = testUnit;
  let count = 0;
  server.use(
    http.get(`${origin}/api/tutor/voice`, () => HttpResponse.json({ enabled: false })),
    http.get(`${origin}/api/tutor/conversations`, () => HttpResponse.json({ items: [], total: 0 })),
    http.post(`${origin}/api/tutor/conversations`, () => HttpResponse.json({ id: `c${String(++count)}` })),
    http.get(`${origin}/api/tutor/conversations/:id`, ({ params }) => HttpResponse.json({ id: params.id, unitId: "unit", revisionId: "r1", mode: "chat", version: 1, activeTurnId: null })),
    http.get(`${origin}/api/tutor/conversations/:id/pending-turn`, () => HttpResponse.json({ request: null, leaseUntil: null })),
    http.get(`${origin}/api/tutor/conversations/:id/messages`, () => HttpResponse.json({ items: [], total: 0 })),
    http.get(`${origin}/api/graphs/revisions`, () => HttpResponse.json({ items: [], total: 0 })),
    http.get(`${origin}/api/auth/csrf`, () => HttpResponse.json({ requestToken: "test" })),
    http.post(`${origin}/api/tutor/conversations/:id/turns`, () => HttpResponse.json({}, { status: 503 })),
  );
  const user = userEvent.setup();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RoutedTutor unit={unit} /></QueryClientProvider>);
  await user.click(screen.getByRole("button", { name: "Nueva conversación" }));
  await waitFor(() => expect(screen.getByLabelText("Tu mensaje")).toBeEnabled());
  await user.type(screen.getByLabelText("Tu mensaje"), "Hola");
  await user.click(screen.getByRole("button", { name: "Enviar" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Nueva conversación" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(screen.getByLabelText("Tu mensaje")).toBeEnabled();
});

it("lista las conversaciones de la unidad con títulos legibles y abre la elegida", async () => {
  const origin = window.location.origin;
  const item = (id: string, mode: string, activityId: string | null, unitId = "unit", revisionId = "r1") => ({ id, unitId, revisionId, mode, activityId, version: 1, activeTurnId: null, createdAt: new Date().toISOString() });
  server.use(
    http.get(`${origin}/api/tutor/voice`, () => HttpResponse.json({ enabled: false })),
    http.get(`${origin}/api/tutor/conversations`, () => HttpResponse.json({ ...page([item("a", "reading", "reading"), item("b", "practice", "exercise"), item("c", "chat", null), item("d", "chat", null, "otra"), item("e", "chat", null, "unit", "r0")]), limit: 100 })),
  );
  const open = vi.fn();
  const user = userEvent.setup();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Tutor unit={testUnit} mode="reading" activityId="reading" conversationId={null} openConversation={open} /></QueryClientProvider>);
  const list = await screen.findByRole("navigation", { name: "Conversaciones de la unidad" });
  // Solo las de esta unidad y su publicación vigente.
  await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(3));
  expect(within(list).getByText("Lectura: Vectores")).toBeInTheDocument();
  expect(within(list).getByText("Práctica: Ejercicio 1")).toBeInTheDocument();
  expect(within(list).getByText("Conversación libre")).toBeInTheDocument();
  expect(screen.getByText(/tendrá el contexto de «Lectura: Vectores»/)).toBeInTheDocument();
  await user.click(within(list).getByRole("button", { name: /^Práctica: Ejercicio 1/ }));
  expect(open).toHaveBeenCalledExactlyOnceWith("b");
});

it("abre en la ventana más reciente, carga los mensajes anteriores y añade el turno sin volver a pedir el historial", async () => {
  const origin = window.location.origin;
  const conversation = { id: "larga", unitId: "unit", revisionId: "r1", mode: "chat", activityId: null, version: 25, activeTurnId: null, createdAt: new Date().toISOString() };
  const message = (sequence: number) => ({ id: `m${String(sequence)}`, turnId: "t", sequence, role: sequence % 2 ? "assistant" : "user", text: `Mensaje ${String(sequence)}`, createdAt: new Date().toISOString(),
    sources: sequence === 25 ? [{ id: "s", unitId: "unit", revisionId: "r1", title: "Lectura de vectores", source: "Material", excerpt: "Un vector representa características." }] : [] });
  const all = Array.from({ length: 25 }, (_, index) => message(index));
  const reads: string[] = [];
  const notes: unknown[] = [];
  server.use(
    http.get(`${origin}/api/tutor/voice`, () => HttpResponse.json({ enabled: false })),
    http.get(`${origin}/api/tutor/conversations`, () => HttpResponse.json(page([conversation]))),
    http.get(`${origin}/api/tutor/conversations/larga`, () => HttpResponse.json(conversation)),
    http.get(`${origin}/api/tutor/conversations/larga/pending-turn`, () => HttpResponse.json({ request: null, leaseUntil: null })),
    http.get(`${origin}/api/tutor/conversations/larga/messages`, ({ request }) => {
      const query = new URL(request.url).searchParams;
      const offset = Number(query.get("offset")), limit = Number(query.get("limit"));
      reads.push(`${String(offset)}+${String(limit)}`);
      return HttpResponse.json({ ...page(all.slice(offset, offset + limit), all.length, offset), limit });
    }),
    http.get(`${origin}/api/auth/csrf`, () => HttpResponse.json({ requestToken: "test" })),
    http.post(`${origin}/api/tutor/notes`, async ({ request }) => { notes.push(await request.json()); return HttpResponse.json({ id: "note" }); }),
    http.post(`${origin}/api/tutor/conversations/larga/turns`, () => HttpResponse.json({ id: "t2", conversationId: "larga", state: "completed", version: 26,
      messages: [{ ...message(25), text: "Mi pregunta nueva", role: "user", sources: [] }, { ...message(26), text: "Respuesta nueva", role: "assistant", sources: [] }] })),
  );
  const user = userEvent.setup();
  render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Tutor unit={testUnit} mode="chat" conversationId="larga" openConversation={() => undefined} /></QueryClientProvider></MemoryRouter>);
  await screen.findByText("Mensaje 24");
  expect(screen.queryByText("Mensaje 4")).not.toBeInTheDocument();
  expect(reads).toEqual(["0+20", "5+20"]);
  await user.click(screen.getByRole("button", { name: "Cargar mensajes anteriores" }));
  await screen.findByText("Mensaje 0");
  expect(reads).toEqual(["0+20", "5+20", "0+5"]);
  expect(screen.queryByRole("button", { name: "Cargar mensajes anteriores" })).not.toBeInTheDocument();
  // Guardar es una acción del mensaje del tutor; los propios no la tienen.
  const tutorMessage = screen.getByText("Mensaje 23").closest("li");
  await user.click(within(required(tutorMessage)).getByRole("button", { name: "Guardar en apuntes" }));
  await within(required(tutorMessage)).findByRole("button", { name: "Guardado en apuntes" });
  expect(notes).toEqual([{ kind: "savedMessage", conversationId: "larga", messageId: "m23" }]);
  expect(within(required(screen.getByText("Mensaje 22").closest("li"))).queryByRole("button")).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Tu mensaje"), "Mi pregunta nueva");
  await user.keyboard("{Control>}{Enter}{/Control}");
  await screen.findByText("Respuesta nueva");
  expect(screen.getAllByText("Mi pregunta nueva")).toHaveLength(1);
  expect(screen.getByText("Mensaje 0")).toBeInTheDocument();
  expect(reads).toHaveLength(3);
});

it("no muestra bajo esta unidad una conversación de otra unidad", async () => {
  const origin = window.location.origin;
  const unit = testUnit;
  server.use(
    http.get(`${origin}/api/tutor/voice`, () => HttpResponse.json({ enabled: true })),
    http.get(`${origin}/api/tutor/conversations`, () => HttpResponse.json({ items: [], total: 0 })),
    http.get(`${origin}/api/tutor/conversations/ajena`, () => HttpResponse.json({ id: "ajena", unitId: "otra", revisionId: "r9", mode: "practice", activityId: "act", version: 1, activeTurnId: null, createdAt: new Date().toISOString() })),
    http.get(`${origin}/api/tutor/conversations/ajena/pending-turn`, () => HttpResponse.json({ request: null, leaseUntil: null })),
    http.get(`${origin}/api/tutor/conversations/ajena/messages`, () => HttpResponse.json({ items: [{ id: "m", role: "assistant", text: "Mensaje de otra unidad", sources: [] }], total: 1 })),
  );
  render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Tutor unit={unit} mode="chat" conversationId="ajena" openConversation={() => undefined} /></QueryClientProvider></MemoryRouter>);
  await screen.findByRole("heading", { name: "Esta conversación pertenece a otra unidad" });
  expect(screen.getByRole("link", { name: "Ir a la unidad de la conversación" })).toHaveAttribute("href", "/unidades/otra/tutor/ajena?modo=practice&actividad=act");
  expect(screen.queryByText("Mensaje de otra unidad")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Tu mensaje")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Conversar por voz" })).not.toBeInTheDocument();
});

it("no muestra mensajes ni formulario mientras la conversación no confirma su unidad", async () => {
  const origin = window.location.origin;
  const unit = testUnit;
  server.use(
    http.get(`${origin}/api/tutor/voice`, () => HttpResponse.json({ enabled: false })),
    http.get(`${origin}/api/tutor/conversations`, () => HttpResponse.json({ items: [], total: 0 })),
    http.get(`${origin}/api/tutor/conversations/rota`, () => HttpResponse.json({ title: "Error" }, { status: 500 })),
    http.get(`${origin}/api/tutor/conversations/rota/pending-turn`, () => HttpResponse.json({ request: null, leaseUntil: null })),
    http.get(`${origin}/api/tutor/conversations/rota/messages`, () => HttpResponse.json({ items: [{ id: "m", role: "assistant", text: "Mensaje sin unidad confirmada", sources: [] }], total: 1 })),
  );
  render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Tutor unit={unit} mode="chat" conversationId="rota" openConversation={() => undefined} /></QueryClientProvider></MemoryRouter>);
  expect(screen.queryByLabelText("Tu mensaje")).not.toBeInTheDocument();
  await screen.findByRole("alert");
  expect(screen.queryByText("Mensaje sin unidad confirmada")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Tu mensaje")).not.toBeInTheDocument();
});

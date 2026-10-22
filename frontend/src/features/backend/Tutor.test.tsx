import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { expect, it } from "vitest";
import { server } from "../../test/server";
import { Tutor } from "./Tutor";
import type { Schema } from "./client";

// Igual que la ruta del tutor: la conversación abierta es estado externo y cambiarla remonta el componente.
function RoutedTutor({ unit }: { unit: Schema["UnitResponse"] }) {
  const [id, setId] = useState<string | null>(null);
  return <Tutor key={id ?? "nueva"} unit={unit} mode="chat" conversationId={id} openConversation={setId} />;
}

it("recupera tras remontar la solicitud persistida, conserva el cuerpo en 409 y no crea otro turno", async () => {
  const origin = window.location.origin;
  const unit = { id: "unit", topicId: "topic", revision: { id: "r1" } } as Schema["UnitResponse"];
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
  await user.selectOptions(await screen.findByLabelText("Retomar una conversación"), "conversation");
  await screen.findByRole("button", { name: "Recuperar mensaje pendiente" });
  first.unmount(); // React loses all in-memory state, including its original request ref/cache.
  mount();
  await user.selectOptions(await screen.findByLabelText("Retomar una conversación"), "conversation");
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
  const unit = { id: "unit", topicId: "topic", revision: { id: "r1" } } as Schema["UnitResponse"];
  let count = 0;
  server.use(
    http.get(`${origin}/api/tutor/voice`, () => HttpResponse.json({ enabled: false })),
    http.get(`${origin}/api/tutor/conversations`, () => HttpResponse.json({ items: [], total: 0 })),
    http.post(`${origin}/api/tutor/conversations`, () => HttpResponse.json({ id: `c${String(++count)}` })),
    http.get(`${origin}/api/tutor/conversations/:id`, () => HttpResponse.json({ version: 1, activeTurnId: null })),
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

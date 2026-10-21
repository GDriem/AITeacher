import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { server } from "../../test/server";
import { Tutor } from "./Tutor";
import type { Schema } from "./client";

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
      return HttpResponse.json({ id: "turn", version: 2, messages: [] });
    }),
  );
  const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><Tutor unit={unit} mode="chat" /></QueryClientProvider>);
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
  expect(bodies).toEqual([original, original]);
  expect(screen.getByLabelText("Tu mensaje")).toBeEnabled();
});

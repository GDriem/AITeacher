import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axe from "axe-core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { AppShell } from "../../app/AppShell";
import { AuthProvider } from "../auth/AuthProvider";
import { rememberActiveSession } from "./activeSession";
import type { ConversationSummary } from "./sessionsApi";
import { server } from "../../test/server";
import { sessionDetail, sessionsFixture } from "../../test/fixtures/sessions";

function renderSessions({ activeSessionId }: {
  activeSessionId?: string;
} = {}) {
  window.localStorage.setItem("studentAutoId", "student-test");
  if (activeSessionId) rememberActiveSession("student-test", activeSessionId);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [{
      path: "/",
      element: <AppShell />,
      children: [
        { index: true, element: <h1>Punto de partida</h1> },
        { path: "tutor", element: <h1>Tutor React</h1> },
      ],
    }],
    { initialEntries: ["/"] },
  );
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider><RouterProvider router={router} /></AuthProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient, router };
}

async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
  const trigger = await screen.findByRole("button", { name: "Conversaciones" });
  await user.click(trigger);
  expect(screen.getByRole("heading", { name: "Conversaciones" })).toHaveFocus();
  return trigger;
}

function sessionRow(title: string) {
  const row = screen.getByText(title).closest("li");
  if (!row) throw new Error(`No se encontró la fila de ${title}.`);
  return row;
}

describe("SessionDrawer", () => {
  it("presenta vacío accesible, contiene el foco y lo restaura al cerrar", async () => {
    const user = userEvent.setup();
    const { container } = renderSessions();
    const trigger = await openDrawer(user);

    expect(await screen.findByText("Aún no hay conversaciones")).toBeVisible();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("button", { name: /Archivadas/ })).toHaveFocus();
    await user.tab();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Cerrar conversaciones" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("recupera un fallo de listado mediante reintento", async () => {
    server.use(http.get("http://localhost:4173/api/sessions", async () => {
      await delay(5);
      return HttpResponse.json({ detail: "No disponible" }, { status: 503 });
    }));
    const user = userEvent.setup();
    const { queryClient } = renderSessions();
    await openDrawer(user);

    await waitFor(() => expect(
      queryClient.getQueryCache().getAll().map((query) => ({ key: query.queryKey, status: query.state.status, fetchStatus: query.state.fetchStatus })),
    ).toContainEqual({ key: ["sessions", "student-test", "list"], status: "error", fetchStatus: "idle" }));
    expect(await screen.findByText("No pudimos cargar las conversaciones.")).toBeVisible();
    server.use(http.get("http://localhost:4173/api/sessions", () => HttpResponse.json(sessionsFixture)));
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Vectores semánticos")).toBeVisible();
  });

  it("restaura continuidad, busca y evita que una apertura tardía reemplace la vigente", async () => {
    let releaseFirst: () => void = () => undefined;
    const firstPending = new Promise<void>((resolve) => { releaseFirst = resolve; });
    server.use(
      http.get("http://localhost:4173/api/sessions", () => HttpResponse.json(sessionsFixture)),
      http.get("http://localhost:4173/api/sessions/:sessionId", async ({ params }) => {
        const id = String(params.sessionId);
        if (id === "session-vectors") await firstPending;
        return HttpResponse.json(sessionDetail(id));
      }),
    );
    const user = userEvent.setup();
    const { router } = renderSessions({ activeSessionId: "session-vectors" });
    await openDrawer(user);

    await screen.findByText("Vectores semánticos");
    const vectors = sessionRow("Vectores semánticos");
    expect(within(vectors).getByText("Activa")).toBeVisible();

    const search = screen.getByRole("searchbox", { name: "Buscar por título o tema" });
    await user.type(search, "agentes");
    expect(screen.queryByText("Vectores semánticos")).not.toBeInTheDocument();
    await user.clear(search);

    await user.click(within(vectors).getByRole("button", { name: "Continuar" }));
    const agents = sessionRow("Agentes y herramientas");
    await user.click(within(agents).getByRole("button", { name: "Abrir" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/tutor"));
    releaseFirst();
    expect(window.localStorage.getItem("activeSession:student-test")).toBe("session-agents");
  });

  it("renombra, archiva, restaura y elimina con invalidaciones explícitas", async () => {
    let sessions: ConversationSummary[] = structuredClone(sessionsFixture.sessions);
    server.use(
      http.get("http://localhost:4173/api/sessions", () =>
        HttpResponse.json({ sessions, retention_days: 365 }),
      ),
      http.patch("http://localhost:4173/api/sessions/:sessionId", async ({ params, request }) => {
        const id = String(params.sessionId);
        const update = await request.json() as { title?: string; archived?: boolean };
        sessions = sessions.map((item) => item.id === id ? {
          ...item,
          ...(update.title ? { title: update.title } : {}),
          ...(typeof update.archived === "boolean"
            ? { archived_at: update.archived ? "2026-08-12T16:00:00Z" : null }
            : {}),
        } : item);
        return HttpResponse.json(sessionDetail(id));
      }),
      http.delete("http://localhost:4173/api/sessions/:sessionId", ({ params }) => {
        sessions = sessions.filter((item) => item.id !== String(params.sessionId));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderSessions({ activeSessionId: "session-vectors" });
    await openDrawer(user);

    await screen.findByText("Vectores semánticos");
    let vectors = sessionRow("Vectores semánticos");
    await user.click(within(vectors).getByRole("button", { name: "Renombrar" }));
    const title = within(vectors).getByRole("textbox", { name: "Nuevo nombre" });
    await user.clear(title);
    await user.type(title, "Embeddings aplicados");
    await user.click(within(vectors).getByRole("button", { name: "Guardar" }));
    await screen.findByText("Embeddings aplicados");
    vectors = sessionRow("Embeddings aplicados");

    await user.click(within(vectors).getByRole("button", { name: "Archivar" }));
    await waitFor(() => expect(screen.queryByText("Embeddings aplicados")).not.toBeInTheDocument());
    expect(window.localStorage.getItem("activeSession:student-test")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Archivadas/ }));
    await screen.findByText("Embeddings aplicados");
    vectors = sessionRow("Embeddings aplicados");
    await user.click(within(vectors).getByRole("button", { name: "Restaurar" }));
    await waitFor(() => expect(screen.queryByText("Embeddings aplicados")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Activas/ }));
    await screen.findByText("Embeddings aplicados");
    vectors = sessionRow("Embeddings aplicados");

    await user.click(within(vectors).getByRole("button", { name: "Eliminar" }));
    expect(within(vectors).getByRole("group", { name: "Eliminar Embeddings aplicados" })).toBeVisible();
    await user.click(within(vectors).getByRole("button", { name: "Eliminar definitivamente" }));
    await waitFor(() => expect(screen.queryByText("Embeddings aplicados")).not.toBeInTheDocument());
  });

  it("nueva conversación limpia sólo la continuidad de la identidad vigente", async () => {
    server.use(http.get("http://localhost:4173/api/sessions", () => HttpResponse.json(sessionsFixture)));
    const user = userEvent.setup();
    const { router } = renderSessions({ activeSessionId: "session-vectors" });
    await openDrawer(user);

    await user.click(screen.getByRole("button", { name: "Nueva conversación" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("activeSession:student-test")).toBeNull();
    await waitFor(() => expect(router.state.location.pathname).toBe("/tutor"));
  });
});

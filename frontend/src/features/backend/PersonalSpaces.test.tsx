import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { server } from "../../test/server";
import { ProfileContext } from "./profile";
import { HomeRoute } from "./HomeRoute";
import { Notes } from "./Notes";
import { Archive } from "./Archive";
import { Assessments } from "./Assessments";
import { createQueryClient } from "../../app/queryClient";
import type { Schema } from "./client";

const origin = window.location.origin;
function Location() { return <output aria-label="URL actual">{useLocation().search}</output>; }
function mount(children: React.ReactNode, initial = "/", queries = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(<MemoryRouter initialEntries={[initial]}><QueryClientProvider client={queries}>
    <ProfileContext value={{ studentId: "a", displayName: "Ana", email: "ana@example.test", canAuthor: false }}>{children}</ProfileContext><Location />
  </QueryClientProvider></MemoryRouter>);
}
function personalData(conversations: unknown[] = [], attempts: unknown[] = [], reviews: unknown[] = []) {
  for (const [path, items] of [["tutor/conversations", conversations], ["assessments/attempts", attempts], ["learning/reviews", reviews]] as const) {
    server.use(http.get(`${origin}/api/${path}`, () => HttpResponse.json({ items, total: items.length })));
  }
}
it("orienta el primer uso con tres pasos y acciones para los espacios vacíos", async () => {
  personalData(); mount(<HomeRoute />);
  await screen.findByRole("heading", { name: "Tu primer recorrido" });
  expect(screen.getByRole("heading", { name: "Elige una unidad" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Pregunta y guarda tus ideas" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Practica y vuelve a repasar" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Explorar el catálogo" })).toHaveAttribute("href", "/catalogo");
});
it("compara fechas propias y conserva todas las páginas para encontrar evaluaciones y repasos pendientes", async () => {
  personalData([{ id: "c", unitId: "u", mode: "reading", createdAt: "2026-10-22T10:00:00Z" }], [{ id: "a", definitionRevisionId: "d", title: "Álgebra", startedAt: "2026-10-23T10:00:00Z", submittedAt: null, status: "inProgress" }]);
  const offsets: string[] = [];
  server.use(http.get(`${origin}/api/assessments/definitions`, () => HttpResponse.json({ items: [{ id: "d", unitId: "unidad-a" }], total: 1 })),
    http.get(`${origin}/api/learning/reviews`, ({ request }) => {
      const offset = new URL(request.url).searchParams.get("offset") ?? ""; offsets.push(offset);
      return HttpResponse.json({ items: offset === "0" ? [{ id: "old", completedAt: "2026-10-22" }] : [{ id: "pending", completedAt: null, dueAt: "2026-10-24T10:00:00Z" }], total: 101 });
    }));
  mount(<HomeRoute />);
  expect(await screen.findByRole("link", { name: "Continuar en la unidad" })).toHaveAttribute("href", "/unidades/unidad-a?pestana=evaluar");
  expect(await screen.findByRole("link", { name: /^Repaso del/ })).toHaveAttribute("href", "/repasos?repaso=pending");
  expect(screen.getByRole("link", { name: "Retomar Álgebra" })).toHaveAttribute("href", "/evaluaciones/a");
  expect(offsets).toEqual(["0", "100"]);
});
it("retoma la conversación más reciente y permite reintentar una consulta fallida", async () => {
  personalData([{ id: "c", unitId: "u", mode: "chat", createdAt: "2026-10-23T10:00:00Z" }]);
  server.use(http.get(`${origin}/api/learning/reviews`, () => HttpResponse.json({}, { status: 503 })));
  mount(<HomeRoute />);
  expect(await screen.findByRole("link", { name: "Continuar con el tutor" })).toHaveAttribute("href", "/unidades/u/tutor/c");
  expect(await screen.findByRole("button", { name: "Reintentar" })).toBeEnabled();
});
it("actualiza Inicio e Historial al iniciar una evaluación sin recargar y con la caché de producción", async () => {
  personalData();
  let started = false;
  const attempt = { id: "a", definitionRevisionId: "d", title: "Álgebra", startedAt: "2026-10-23T10:00:00Z", submittedAt: null, status: "inProgress" };
  server.use(
    http.get(`${origin}/api/assessments/attempts`, () => HttpResponse.json({ items: started ? [attempt] : [], total: started ? 1 : 0 })),
    http.get(`${origin}/api/assessments/definitions`, () => HttpResponse.json({ items: [{ id: "d", unitId: "u", unitRevisionId: "r", title: "Álgebra", timeLimitMinutes: 30, maxAttempts: 5 }], total: 1 })),
    http.get(`${origin}/api/auth/csrf`, () => HttpResponse.json({ requestToken: "test" })),
    http.post(`${origin}/api/assessments/attempts`, () => { started = true; return HttpResponse.json(attempt); }),
    http.get(`${origin}/api/history/conversations`, () => HttpResponse.json({ items: [], total: 0 })),
    http.get(`${origin}/api/history/progress`, () => HttpResponse.json({ items: [], total: 0 })),
  );
  const unit = { id: "u", revision: { id: "r" } } as Schema["UnitResponse"];
  mount(<><Link to="/unidad">Abrir unidad</Link><Link to="/">Ir a Inicio</Link><Link to="/historial">Ir a Historial</Link>
    <Routes><Route path="/" element={<HomeRoute />} /><Route path="/unidad" element={<Assessments unit={unit} />} />
      <Route path="/evaluaciones/:id" element={<h1>Intento iniciado</h1>} /><Route path="/historial" element={<Archive />} /></Routes>
  </>, "/", createQueryClient());
  const user = userEvent.setup();
  await screen.findByRole("heading", { name: "Tu primer recorrido" });
  await user.click(screen.getByRole("link", { name: "Abrir unidad" }));
  await screen.findByText("Aún no has iniciado evaluaciones.");
  await user.click(await screen.findByRole("button", { name: "Iniciar Álgebra" }));
  await screen.findByRole("heading", { name: "Intento iniciado" });
  await user.click(screen.getByRole("link", { name: "Ir a Inicio" }));
  expect(await screen.findByRole("link", { name: "Retomar Álgebra" })).toHaveAttribute("href", "/evaluaciones/a");
  expect(screen.queryByRole("heading", { name: "Tu primer recorrido" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "Ir a Historial" }));
  expect(await screen.findByRole("link", { name: "Retomar evaluación" })).toHaveAttribute("href", "/evaluaciones/a");
  await user.click(screen.getByRole("link", { name: "Abrir unidad" }));
  await user.click(screen.getByText("Mis intentos anteriores"));
  expect(await screen.findByRole("button", { name: "Retomar" })).toBeVisible();
});
it("abre apuntes en la página indicada y conserva el editor y el enlace al origen en la URL", async () => {
  server.use(http.get(`${origin}/api/tutor/notes`, ({ request }) => {
    expect(new URL(request.url).searchParams.get("offset")).toBe("20");
    return HttpResponse.json({ items: [{ id: "n", kind: "savedMessage", text: "Mi nota", version: 1, conversationId: "c", messageId: "m", updatedAt: "2026-10-23T10:00:00Z" }], total: 21 });
  }), http.get(`${origin}/api/tutor/conversations/c`, () => HttpResponse.json({ id: "c", unitId: "u" })));
  mount(<Notes />, "/apuntes?pagina=20");
  expect(await screen.findByRole("link", { name: "Volver a la conversación de origen" })).toHaveAttribute("href", "/unidades/u/tutor/c");
  await userEvent.setup().click(screen.getByRole("button", { name: "Editar" }));
  expect(screen.getByLabelText("Editar apunte")).toHaveValue("Mi nota");
  expect(screen.getByLabelText("URL actual")).toHaveTextContent("pagina=20&editar=n");
});
it("conserva el acceso directo al mensaje aunque no pueda cargar la conversación", async () => {
  server.use(
    http.get(`${origin}/api/tutor/notes`, () => HttpResponse.json({ items: [{ id: "n", kind: "savedMessage", text: "Mi nota", version: 1, conversationId: "c", messageId: "m", updatedAt: "2026-10-23T10:00:00Z" }], total: 1 })),
    http.get(`${origin}/api/tutor/conversations/c`, () => HttpResponse.json({}, { status: 503 })),
  );
  mount(<Notes />);
  const source = await screen.findByRole("link", { name: "Consultar mensaje de origen" });
  expect(source).toHaveAttribute("href", "/api/graphs/conversations/c/messages/m");
  expect(source).toHaveAttribute("target", "_blank");
  await screen.findByRole("button", { name: "Reintentar" });
  expect(source).toBeVisible();
});
it("restaura la conversación importada y su página de mensajes desde la URL", async () => {
  personalData();
  server.use(http.get(`${origin}/api/history/conversations`, () => HttpResponse.json({ items: [{ id: "h", title: "Historia", messageCount: 21 }], total: 1 })),
    http.get(`${origin}/api/history/progress`, () => HttpResponse.json({ items: [], total: 0 })),
    http.get(`${origin}/api/history/conversations/h/messages`, ({ request }) => {
      expect(new URL(request.url).searchParams.get("offset")).toBe("20");
      return HttpResponse.json({ items: [{ id: "m", role: "assistant", content: "Recuerdo privado" }], total: 21 });
    }));
  mount(<Archive />, "/historial?conversacion=h&mensajes=20");
  expect(await screen.findByText("Recuerdo privado")).toBeVisible();
  expect(screen.getByRole("button", { name: "Historia · 21 mensajes" })).toHaveAttribute("aria-pressed", "true");
});

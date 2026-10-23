import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, matchRoutes, RouterProvider } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { beforeEach, expect, it } from "vitest";
import { server } from "../../test/server";
import { ProfileContext } from "./profile";
import { AuthorSpace, AuthorUnits } from "./AuthorSpace";
import { AuthorUnitRoute } from "./AuthorUnitRoute";
import { emptyDocument, readUnitDraft, writeUnitDraft } from "./authoringModel";
import type { Schema } from "./client";

const origin = window.location.origin;
const doc = { ...emptyDocument(), title: "Guardada", kind: "reading" as const, readings: [{ id: "r", title: "Lectura", text: "Texto", source: "Fuente", objectiveIds: [] }] };
const unit: Schema["UnitResponse"] = { id: "u", topicId: "t", version: 1, publishedRevisionId: null, revision: { id: "r", number: 1, document: doc, createdAt: "2026-10-23", createdBy: "a", origin: null } };
function mount(path: string, canAuthor = true) {
  const router = createMemoryRouter([{ path: "/autoria", Component: AuthorSpace, children: [
    { index: true, Component: AuthorUnits }, { path: "unidades/nueva", Component: AuthorUnitRoute }, { path: "unidades/:unitId", Component: AuthorUnitRoute },
  ] }], { initialEntries: [path] });
  const view = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ProfileContext value={{ studentId: "a", canAuthor, displayName: "Autor", email: "a@example.test" }}><RouterProvider router={router} /></ProfileContext></QueryClientProvider>);
  return { router, ...view };
}
beforeEach(() => {
  sessionStorage.clear();
  server.use(http.get(`${origin}/api/catalog/topics`, () => HttpResponse.json({ items: [{ id: "t", name: "Tema" }], total: 1 })),
    http.get(`${origin}/api/units/u`, () => HttpResponse.json(unit)),
    http.get(`${origin}/api/units`, () => HttpResponse.json({ items: [], total: 0 })));
});
it("muestra una explicación sin montar las herramientas cuando falta el permiso", async () => {
  mount("/autoria/unidades/u", false);
  expect(await screen.findByRole("heading", { name: "Autoría requiere permiso de autor" })).toBeVisible();
  expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
});
it("restaura la ruta directa, valida antes de avanzar y recupera el paso con Atrás", async () => {
  const { router } = mount("/autoria/unidades/nueva");
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Siguiente" }));
  expect(await screen.findByText("Selecciona un tema.")).toBeVisible();
  await user.selectOptions(screen.getByLabelText("Tema de la nueva unidad"), "t");
  await user.type(screen.getByLabelText("Título de la unidad"), "Borrador");
  await user.click(screen.getByRole("button", { name: "Siguiente" }));
  await waitFor(() => expect(router.state.location.search).toBe("?paso=objetivos"));
  expect(screen.getByRole("heading", { name: "Conceptos y objetivos" })).toHaveFocus();
  await router.navigate(-1);
  expect(await screen.findByLabelText("Título de la unidad")).toHaveValue("Borrador");
});
it("persiste cambios por unidad al desmontar y recargar con el mismo paso", async () => {
  const first = mount("/autoria/unidades/u?paso=datos");
  const user = userEvent.setup();
  const title = await screen.findByLabelText("Título de la unidad");
  await user.clear(title); await user.type(title, "Cambio sin guardar");
  expect(readUnitDraft("a", "u")?.version).toBe(1);
  first.unmount();
  mount("/autoria/unidades/u?paso=datos");
  expect(await screen.findByLabelText("Título de la unidad")).toHaveValue("Cambio sin guardar");
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Datos", "Lecturas", "Revisión"]);
});
it.each([
  ["publicar o retirar no invalidan el borrador de la misma revisión", "r", 2],
  ["un guardado de otro autor envía la versión del borrador para recibir 409", "otra", 1],
])("guarda con la versión según la revisión base: %s", async (_, revisionId, expected) => {
  const sent: unknown[] = [];
  server.use(http.get(`${origin}/api/auth/csrf`, () => HttpResponse.json({ requestToken: "test" })),
    http.get(`${origin}/api/units/u`, () => HttpResponse.json({ ...unit, version: 2 })),
    http.post(`${origin}/api/units/u/revisions`, async ({ request }) => { sent.push(await request.json()); return HttpResponse.json({ ...unit, version: 3, revision: { ...unit.revision, id: "r2", number: 2 } }); }));
  writeUnitDraft("a", "u", { document: { ...doc, title: "Cambio local" }, topicId: "t", version: 1, revisionId });
  mount("/autoria/unidades/u?paso=datos");
  expect(await screen.findByLabelText("Título de la unidad")).toHaveValue("Cambio local");
  await userEvent.setup().click(screen.getByRole("button", { name: "Guardar borrador" }));
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]).toMatchObject({ version: expected, document: { title: "Cambio local" } });
});
it("sin cambios locales muestra la revisión concurrente al recargar la unidad", async () => {
  let current = unit;
  server.use(http.get(`${origin}/api/units/u`, () => HttpResponse.json(current)));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: "/autoria/unidades/:unitId", Component: AuthorUnitRoute }], { initialEntries: ["/autoria/unidades/u?paso=datos"] });
  render(<QueryClientProvider client={client}><ProfileContext value={{ studentId: "a", canAuthor: true, displayName: "Autor", email: "a@example.test" }}><RouterProvider router={router} /></ProfileContext></QueryClientProvider>);
  expect(await screen.findByLabelText("Título de la unidad")).toHaveValue("Guardada");
  current = { ...unit, version: 2, revision: { ...unit.revision, id: "r2", number: 2, document: { ...doc, title: "Cambio concurrente" } } };
  await client.invalidateQueries({ queryKey: ["author-unit"] });
  await waitFor(() => expect(screen.getByLabelText("Título de la unidad")).toHaveValue("Cambio concurrente"));
  expect(screen.getByText("Borrador guardado.")).toBeVisible();
});
it("abre Revisión sin llamadas de alumno y conserva solo lectura", async () => {
  mount("/autoria/unidades/u?paso=revision");
  expect(await screen.findByRole("heading", { name: "Lectura" })).toBeVisible();
  expect(screen.queryByRole("button", { name: /Iniciar/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/PRIVATE/)).not.toBeInTheDocument();
});
it("guarda una unidad nueva y navega al ID creado sin abrir el aviso de cambios", async () => {
  server.use(http.get(`${origin}/api/auth/csrf`, () => HttpResponse.json({ requestToken: "test" })),
    http.post(`${origin}/api/units`, () => HttpResponse.json(unit, { status: 201 })));
  const { router } = mount("/autoria/unidades/nueva");
  const user = userEvent.setup();
  await user.selectOptions(await screen.findByLabelText("Tema de la nueva unidad"), "t");
  await user.selectOptions(screen.getByLabelText("Tipo de material"), "reading");
  await user.type(screen.getByLabelText("Título de la unidad"), "Guardada");
  await user.click(screen.getByRole("button", { name: "Siguiente" }));
  await user.click(screen.getByRole("button", { name: "Añadir lectura" }));
  await user.type(screen.getByLabelText("Título de lectura"), "Lectura");
  await user.type(screen.getByLabelText("Texto de lectura"), "Texto");
  await user.type(screen.getByLabelText("Fuente de lectura"), "Fuente");
  await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/autoria/unidades/u"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(readUnitDraft("a", "nueva")).toBeNull();
});

it("declara las rutas reales de autoría, incluida la entrega individual", async () => {
  const { router } = await import("./router");
  for (const [path, expected] of [["/autoria", undefined], ["/autoria/unidades/nueva", "unidades/nueva"], ["/autoria/unidades/u", "unidades/:unitId"], ["/autoria/unidades/u/evaluaciones", "unidades/:unitId/evaluaciones"], ["/autoria/correcciones", "correcciones/:attemptId?"], ["/autoria/correcciones/a", "correcciones/:attemptId?"], ["/autoria/catalogo", "catalogo"]] as const) {
    const matches = matchRoutes(router.routes, path);
    expect(matches?.at(-1)?.route.path).toBe(expected);
    expect(matches?.at(-1)?.route.lazy).toBeTypeOf("function");
  }
  router.dispose();
});

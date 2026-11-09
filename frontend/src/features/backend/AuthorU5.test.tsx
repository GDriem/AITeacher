import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { server } from "../../test/server";
import { ProfileContext } from "./profile";
import { AuthorSpace, AuthorUnits } from "./AuthorSpace";
import { AuthorUnitRoute } from "./AuthorUnitRoute";
import { AuthorAssessmentRoute } from "./AuthorAssessmentRoute";
import { ReviewQueue } from "./ReviewQueue";
import { emptyDocument } from "./authoringModel";
import type { Schema } from "./client";

const origin = window.location.origin;
const document = { ...emptyDocument(), title: "Unidad publicada", concepts: [{ id: "c", name: "Idea" }], objectives: [{ id: "o", description: "Explicar", conceptIds: ["c"] }], readings: [{ id: "l", title: "Lectura", text: "Texto", source: "Fuente", objectiveIds: ["o"] }] };
const unit: Schema["UnitResponse"] = { id: "u", topicId: "t", version: 2, publishedRevisionId: "r", revision: { id: "r", number: 1, document, createdAt: "2026-11-08", createdBy: "a", origin: null } };
const question: Schema["QuestionRevision"] = { id: "q", resourceId: "qb", number: 1, document: { unitId: "u", unitRevisionId: "r", objectiveIds: ["o"], conceptIds: ["c"], type: "openResponse", prompt: "Explica la idea", options: [], correctOptionIds: [], scoringPolicy: "rubric", rubric: { version: 1, privateGuidance: "PRIVATE-U5", criteria: [{ id: "criterion", description: "Claridad", maxPoints: 2 }] } }, createdAt: "2026-11-08", createdBy: "a" };
function mount(path: string) {
  const router = createMemoryRouter([{ path: "/autoria", Component: AuthorSpace, children: [
    { index: true, Component: AuthorUnits }, { path: "unidades/:unitId", Component: AuthorUnitRoute },
    { path: "unidades/:unitId/evaluaciones", Component: AuthorAssessmentRoute }, { path: "correcciones/:attemptId?", Component: ReviewQueue },
  ] }], { initialEntries: [path] });
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ProfileContext value={{ studentId: "a", canAuthor: true, displayName: "Autor", email: "a@example.test" }}><RouterProvider router={router} /></ProfileContext></QueryClientProvider>);
}
beforeAll(() => {
  if ("showModal" in HTMLDialogElement.prototype) return;
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { value(this: HTMLDialogElement) { this.setAttribute("open", ""); } },
    close: { value(this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); } },
  });
});
beforeEach(() => {
  sessionStorage.clear();
  server.use(http.get(`${origin}/api/auth/csrf`, () => HttpResponse.json({ requestToken: "test" })),
    http.get(`${origin}/api/catalog/topics`, () => HttpResponse.json({ items: [{ id: "t", name: "Tema" }], total: 1 })),
    http.get(`${origin}/api/units/u`, () => HttpResponse.json(unit)),
    http.get(`${origin}/api/units/u/revisions/r`, () => HttpResponse.json(unit)),
    http.get(`${origin}/api/assessments/questions`, () => HttpResponse.json({ items: [question], total: 1 })));
});
afterEach(() => vi.restoreAllMocks());

it("avisa del fallo de copia local y no promete conservarla al salir", async () => {
  mount("/autoria/unidades/u");
  const title = await screen.findByLabelText("Título de la unidad");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota", "QuotaExceededError"); });
  const user = userEvent.setup();
  await user.type(title, " cambio");
  expect(screen.getByRole("alert")).toHaveTextContent("No se pudo conservar la copia local");
  await user.click(screen.getByRole("link", { name: "Unidades" }));
  expect(screen.getByRole("button", { name: "Salir sin conservar cambios" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Salir y conservar borrador" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Seguir editando" }));
  expect(title).toHaveValue("Unidad publicada cambio");
});

it.each([true, false])("usa el tipo de la publicación, aunque el borrador tenga otro tipo: lectura=%s", async (publishedReading) => {
  server.use(http.get(`${origin}/api/units/u`, () => HttpResponse.json({ ...unit, revision: { ...unit.revision, id: "head", document: { ...document, kind: publishedReading ? "learningUnit" : "reading" } } })),
    http.get(`${origin}/api/units/u/revisions/r`, () => HttpResponse.json({ ...unit, revision: { ...unit.revision, document: { ...document, kind: publishedReading ? "reading" : "learningUnit" } } })));
  mount("/autoria/unidades/u/evaluaciones");
  if (publishedReading) {
    expect(await screen.findByRole("heading", { name: "Esta publicación es de solo lectura" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Añadir pregunta" })).not.toBeInTheDocument();
  } else expect(await screen.findByRole("button", { name: "Añadir pregunta" })).toBeVisible();
});

it("confirma la evaluación antes de publicar y conserva la selección al cancelar o fallar", async () => {
  const sent: unknown[] = [];
  server.use(http.post(`${origin}/api/assessments/definitions`, async ({ request }) => { sent.push(await request.json()); return HttpResponse.json({ title: "No disponible", status: 503 }, { status: 503 }); }));
  mount("/autoria/unidades/u/evaluaciones");
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Título de evaluación"), "Evaluación U5");
  await user.click(await screen.findByRole("checkbox", { name: "Explica la idea" }));
  await user.click(screen.getByRole("button", { name: "Publicar evaluación" }));
  const dialog = screen.getByRole("dialog", { name: "¿Publicar esta evaluación?" });
  expect(dialog).toHaveTextContent("Preguntas: 1 · Duración: 30 min · Intentos: 3.");
  expect(sent).toHaveLength(0);
  await user.click(within(dialog).getByRole("button", { name: "Seguir preparando" }));
  expect(screen.getByLabelText("Título de evaluación")).toHaveValue("Evaluación U5");
  await user.click(screen.getByRole("button", { name: "Publicar evaluación" }));
  await user.click(screen.getByRole("button", { name: "Confirmar publicación de evaluación" }));
  expect(await within(dialog).findByRole("alert")).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ document: { unitRevisionId: "r", questionRevisionIds: ["q"] } });
  await user.click(within(dialog).getByRole("button", { name: "Seguir preparando" }));
  expect(screen.getByRole("checkbox", { name: "Explica la idea" })).toBeChecked();
});

it("deja vacíos los puntos borrados y reintenta la misma corrección tras perder la respuesta", async () => {
  const sent: unknown[] = [];
  server.use(http.get(`${origin}/api/assessments/submissions`, () => HttpResponse.json({ items: [], total: 0 })),
    http.get(`${origin}/api/assessments/attempts/a/review`, () => HttpResponse.json({ attemptId: "a", definitionRevisionId: "d", submittedAt: "2026-11-08T12:00:00Z", questions: [{ revisionId: "q", document: question.document }], answers: [{ questionRevisionId: "q", text: "Primera línea\nSegunda línea", selectedOptionIds: [] }], review: null })),
    http.post(`${origin}/api/assessments/attempts/a/review`, async ({ request }) => { sent.push(await request.json()); return HttpResponse.json({ title: "No disponible", status: 503 }, { status: 503 }); }));
  mount("/autoria/correcciones/a");
  const user = userEvent.setup();
  const points = await screen.findByLabelText("Claridad · máximo 2");
  await user.type(points, "1"); await user.clear(points);
  expect(points).toHaveValue(null);
  await user.type(points, "1.5"); await user.type(screen.getByLabelText("Comentarios para el alumno"), "Explica el ejemplo.");
  await user.click(screen.getByRole("button", { name: "Confirmar corrección final" }));
  await user.click(screen.getByRole("button", { name: "Sí, confirmar corrección" }));
  const dialog = screen.getByRole("dialog");
  expect(await within(dialog).findByText(/Los campos quedan bloqueados/)).toBeVisible();
  expect(points).toBeDisabled();
  await user.click(within(dialog).getByRole("button", { name: "Reintentar" }));
  await waitFor(() => expect(sent).toHaveLength(2));
  expect(sent[1]).toEqual(sent[0]);
  expect(sent[0]).toMatchObject({ grades: [{ questionRevisionId: "q", criteria: [{ criterionId: "criterion", points: 1.5 }], feedback: "Explica el ejemplo." }] });
});

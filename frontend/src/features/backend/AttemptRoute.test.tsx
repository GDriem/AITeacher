import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeAll, expect, it } from "vitest";
import { server } from "../../test/server";
import { AttemptRoute } from "./AttemptRoute";
import type { Schema } from "./client";

const origin = window.location.origin;
const questions: Schema["StudentAssessmentQuestion"][] = [
  { revisionId: "q1", questionId: "q1", number: 1, objectiveIds: [], conceptIds: [], type: "singleChoice", prompt: "¿Qué representa un vector?", scoringPolicy: "exactMatch",
    options: [{ id: "a", text: "Características" }, { id: "b", text: "Una contraseña" }] },
  { revisionId: "q2", questionId: "q2", number: 1, objectiveIds: [], conceptIds: [], type: "multipleChoice", prompt: "¿Qué miden las distancias?", scoringPolicy: "partialCredit",
    options: [{ id: "c", text: "Similitud" }, { id: "d", text: "Diferencia" }] },
  { revisionId: "q3", questionId: "q3", number: 1, objectiveIds: [], conceptIds: [], type: "openResponse", prompt: "Justifica tu comparación.", scoringPolicy: "rubric", options: [] },
];
const attempt = (overrides: Partial<Schema["AssessmentAttempt"]> = {}): Schema["AssessmentAttempt"] => ({
  id: "intento", definitionRevisionId: "def", startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString(), submittedAt: null,
  status: "inProgress", title: "Evaluación de vectores", mode: "assessment", feedback: "afterSubmission", assistance: "none", questions, answers: null, scores: null, fraction: null, ...overrides,
});

// jsdom no implementa <dialog> modal.
beforeAll(() => {
  if ("showModal" in HTMLDialogElement.prototype) return;
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { value(this: HTMLDialogElement) { this.setAttribute("open", ""); } },
    close: { value(this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); } },
  });
});
afterEach(() => sessionStorage.clear());

function Location() { const location = useLocation(); return <p data-testid="ubicacion">{location.search}</p>; }

function mount(path = "/evaluaciones/intento") {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><Routes><Route path="/evaluaciones/:attemptId" element={<><AttemptRoute /><Location /></>} /></Routes></MemoryRouter>
  </QueryClientProvider>);
}

it("abre el paso de la URL, lo reemplaza al avanzar y conserva el borrador al remontar", async () => {
  server.use(http.get(`${origin}/api/assessments/attempts/intento`, () => HttpResponse.json(attempt())));
  const user = userEvent.setup();
  const first = mount("/evaluaciones/intento?pregunta=2");
  expect(await screen.findByRole("heading", { name: "Evaluación de vectores", level: 1 })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Pregunta 2 de 3" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Pregunta 2, sin responder" })).toHaveAttribute("aria-current", "step");
  await user.click(screen.getByRole("checkbox", { name: "Similitud" }));
  expect(screen.getByRole("progressbar", { name: "1 de 3 respondidas" })).toHaveAttribute("aria-valuenow", "1");
  await user.click(screen.getByRole("button", { name: "Siguiente" }));
  expect(screen.getByTestId("ubicacion")).toHaveTextContent("?pregunta=3");
  expect(screen.getByRole("heading", { name: "Pregunta 3 de 3" })).toHaveFocus();
  await user.type(screen.getByLabelText("Tu respuesta"), "Comparo características.");
  first.unmount();
  mount("/evaluaciones/intento?pregunta=3");
  expect(await screen.findByLabelText("Tu respuesta")).toHaveValue("Comparo características.");
  expect(screen.getByRole("button", { name: "Pregunta 2, respondida" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Anterior" }));
  expect(screen.getByRole("checkbox", { name: "Similitud" })).toBeChecked();
});

it("confirma antes de entregar, envía todas las preguntas y muestra el resultado inmediato", async () => {
  const bodies: unknown[] = [];
  const submitted = attempt({ status: "submitted", submittedAt: new Date().toISOString(), fraction: 0.5,
    answers: [{ questionRevisionId: "q1", selectedOptionIds: ["a"] }, { questionRevisionId: "q2", selectedOptionIds: [] }],
    scores: [{ questionRevisionId: "q1", fraction: 1, isCorrect: true }, { questionRevisionId: "q2", fraction: 0, isCorrect: false, feedback: "Revisa la lectura." }] });
  server.use(
    http.get(`${origin}/api/assessments/attempts/intento`, () => HttpResponse.json(attempt({ questions: questions.slice(0, 2) }))),
    http.get(`${origin}/api/auth/csrf`, () => HttpResponse.json({ requestToken: "test" })),
    http.post(`${origin}/api/assessments/attempts/intento/submit`, async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json(submitted); }),
  );
  const user = userEvent.setup();
  mount();
  await user.click(await screen.findByRole("radio", { name: "Características" }));
  await user.click(screen.getByRole("button", { name: "Entregar respuestas" }));
  const dialog = screen.getByRole("dialog", { name: "¿Entregar la evaluación?" });
  expect(dialog).toHaveTextContent("Respondiste 1 de 2 preguntas. La pregunta sin responder cuenta como cero.");
  await user.click(within(dialog).getByRole("button", { name: "Seguir respondiendo" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(bodies).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Entregar respuestas" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Sí, entregar" }));
  expect(await screen.findByText("Resultado: 50 %")).toBeInTheDocument();
  expect(bodies).toEqual([{ answers: [{ questionRevisionId: "q1", selectedOptionIds: ["a"] }, { questionRevisionId: "q2", selectedOptionIds: [] }] }]);
  expect(screen.getByRole("heading", { name: "Tu entrega" })).toHaveFocus();
  expect(screen.getByText("Correcta")).toBeInTheDocument();
  expect(screen.getByText("Revisa la lectura.")).toBeInTheDocument();
  expect(sessionStorage.length).toBe(0);
});

it("respeta las políticas never y rúbrica pendiente sin mostrar nota", async () => {
  let value = attempt({ status: "submitted", feedback: "never", submittedAt: new Date().toISOString(), answers: [{ questionRevisionId: "q1", selectedOptionIds: ["a"] }] });
  server.use(http.get(`${origin}/api/assessments/attempts/intento`, () => HttpResponse.json(value)));
  const first = mount();
  expect(await screen.findByText("Entrega registrada. Esta evaluación no muestra la nota ni los aciertos.")).toBeInTheDocument();
  expect(screen.queryByText(/^Resultado:/)).not.toBeInTheDocument();
  expect(screen.queryByText("Correcta")).not.toBeInTheDocument();
  first.unmount();
  value = attempt({ status: "pendingReview", submittedAt: new Date().toISOString(), answers: [{ questionRevisionId: "q3", selectedOptionIds: [], text: "Mi justificación" }] });
  mount();
  expect(await screen.findByText("Pendiente de corrección docente")).toBeInTheDocument();
  expect(screen.getByText(/La nota y los comentarios aparecerán aquí al terminar la corrección/)).toBeInTheDocument();
  expect(screen.getByText("Mi justificación")).toBeInTheDocument();
});

it("al vencer el tiempo bloquea la entrega y consulta el estado al servidor", async () => {
  let reads = 0;
  server.use(http.get(`${origin}/api/assessments/attempts/intento`, () => { reads += 1; return HttpResponse.json(attempt({ expiresAt: new Date(Date.now() - 1000).toISOString() })); }));
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("Se acabó el tiempo.");
  expect(screen.getByRole("button", { name: "Entregar respuestas" })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "Características" })).toBeDisabled();
  await waitFor(() => expect(reads).toBe(2));
});

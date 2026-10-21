import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { expect, it, vi } from "vitest";
import { server } from "../../test/server";
import { LearningReviews } from "./LearningReviews";

it("inicia R1 desde el repaso aunque el catálogo muestre R2 y conserva requestId en reintentos", async () => {
  const origin = window.location.origin;
  const requests: { definitionRevisionId: string; requestId: string }[] = [];
  const attempt = { id: "historical-attempt", definitionRevisionId: "definition-r1", title: "Evaluación histórica R1", status: "inProgress", expiresAt: new Date(Date.now() + 60000).toISOString(), questions: [], fraction: null };
  server.use(
    http.get(`${origin}/api/learning/evidence`, () => HttpResponse.json({ items: [], total: 0 })),
    http.get(`${origin}/api/assessments/definitions`, () => HttpResponse.json({ items: [{ id: "definition-r2", unitRevisionId: "r2", title: "Actual R2" }], total: 1 })),
    http.get(`${origin}/api/learning/reviews`, () => HttpResponse.json({ items: [{ id: "review", definitionRevisionId: "definition-r1", dueAt: new Date(Date.now() - 1000).toISOString(), completedAt: null }], total: 1 })),
    http.get(`${origin}/api/assessments/attempts`, () => HttpResponse.json({ items: [], total: 0 })),
    http.get(`${origin}/api/auth/csrf`, () => HttpResponse.json({ requestToken: "test" })),
    http.post(`${origin}/api/assessments/attempts`, async ({ request }) => {
      requests.push(await request.json() as typeof requests[number]);
      return requests.length === 1 ? HttpResponse.json({}, { status: 503 }) : HttpResponse.json(attempt);
    }),
    http.get(`${origin}/api/assessments/attempts/historical-attempt`, () => HttpResponse.json(attempt)),
  );
  const user = userEvent.setup();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><LearningReviews /></QueryClientProvider>);
  await user.click(await screen.findByRole("button", { name: "Iniciar intento del repaso" }));
  await user.click(await screen.findByRole("button", { name: "Reintentar" }));
  await screen.findByRole("heading", { name: "Evaluación histórica R1" });
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual(requests[1]);
  expect(requests[0]?.definitionRevisionId).toBe("definition-r1");
});

it("habilita el inicio al llegar a dueAt sin recargar", async () => {
  const origin = window.location.origin;
  const dueAt = new Date(Date.now() + 200).toISOString();
  server.use(
    http.get(`${origin}/api/learning/evidence`, () => HttpResponse.json({ items: [], total: 0 })),
    http.get(`${origin}/api/assessments/definitions`, () => HttpResponse.json({ items: [], total: 0 })),
    http.get(`${origin}/api/learning/reviews`, () => HttpResponse.json({ items: [{ id: "review", definitionRevisionId: "r1", dueAt, completedAt: null }], total: 1 })),
    http.get(`${origin}/api/assessments/attempts`, () => HttpResponse.json({ items: [], total: 0 })),
  );
  const now = vi.spyOn(Date, "now").mockReturnValue(new Date(dueAt).getTime() - 200);
  try {
    render(<QueryClientProvider client={new QueryClient()}><LearningReviews /></QueryClientProvider>);
    const button = await screen.findByRole("button", { name: "Iniciar intento del repaso" });
    expect(button).toBeDisabled();
    now.mockReturnValue(new Date(dueAt).getTime());
    await waitFor(() => expect(button).toBeEnabled());
  } finally { now.mockRestore(); }
});

import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { projectEvaluationFixture } from "../../test/fixtures/projects";
import { renderProjects } from "../../test/renderProjects";
import { server } from "../../test/server";

describe("ProjectsScreen", () => {
  it("abre el workspace, envía la propuesta y presenta la rúbrica", async () => {
    let requestBody: unknown;
    server.use(http.post("http://localhost:4173/api/projects/:projectId/evaluate", async ({ request }) => {
      requestBody = await request.json();
      return HttpResponse.json(projectEvaluationFixture);
    }));
    const user = userEvent.setup();
    renderProjects();

    expect(await screen.findByRole("heading", { name: "Convierte lo aprendido en una propuesta" })).toBeVisible();
    const catalog = screen.getByRole("list", { name: "Proyectos disponibles" });
    expect(within(catalog).getAllByRole("article")).toHaveLength(3);

    await user.click(within(catalog).getByRole("button", { name: "Abrir proyecto: Asistente RAG confiable" }));
    const workspaceHeading = screen.getAllByRole("heading", { name: "Asistente RAG confiable" }).at(-1);
    expect(workspaceHeading).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Entregables" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Rúbrica" })).toBeVisible();

    await user.type(screen.getByLabelText("Tu propuesta"), "Primero recupero evidencia; después valido citas, permisos y latencia.");
    await user.click(screen.getByRole("button", { name: /Evaluar proyecto/ }));

    const resultHeading = await screen.findByRole("heading", { name: "81/100 · Dominado" });
    expect(resultHeading).toHaveFocus();
    expect(screen.getAllByLabelText(/de 4 puntos/)).toHaveLength(4);
    expect(requestBody).toMatchObject({ student_id: expect.stringMatching(/^alumno-/), submission: expect.stringContaining("evidencia") });
  });

  it("muestra estados vacío y de error con recuperación", async () => {
    let calls = 0;
    server.use(http.get("http://localhost:4173/api/projects", () => {
      calls += 1;
      if (calls === 1) return HttpResponse.json({ detail: "Proyectos no disponibles" }, { status: 503 });
      return HttpResponse.json({ projects: [] });
    }));
    const user = userEvent.setup();
    renderProjects();

    expect(await screen.findByRole("alert")).toHaveTextContent("Proyectos no disponibles");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Aún no hay proyectos disponibles" })).toBeVisible();
  });

  it("permite reintentar una evaluación sin perder la propuesta", async () => {
    let calls = 0;
    server.use(http.post("http://localhost:4173/api/projects/:projectId/evaluate", () => {
      calls += 1;
      return calls === 1
        ? HttpResponse.json({ detail: "Evaluación temporalmente no disponible" }, { status: 503 })
        : HttpResponse.json(projectEvaluationFixture);
    }));
    const user = userEvent.setup();
    renderProjects();
    await user.click(await screen.findByRole("button", { name: "Abrir proyecto: Asistente RAG confiable" }));
    const proposal = screen.getByLabelText("Tu propuesta");
    await user.type(proposal, "Una propuesta concreta con evidencia y medición.");
    await user.click(screen.getByRole("button", { name: /Evaluar proyecto/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Evaluación temporalmente no disponible");
    expect(proposal).toHaveValue("Una propuesta concreta con evidencia y medición.");
    await user.click(screen.getByRole("button", { name: /Evaluar proyecto/ }));
    expect(await screen.findByRole("heading", { name: "81/100 · Dominado" })).toBeVisible();
  });

  it("restaura el foco y no presenta hallazgos axe", async () => {
    const user = userEvent.setup();
    const { container } = renderProjects();
    const openButton = await screen.findByRole("button", { name: "Abrir proyecto: Asistente RAG confiable" });
    await user.click(openButton);
    await user.click(screen.getByRole("button", { name: "Cerrar proyecto" }));
    expect(openButton).toHaveFocus();

    const results = await axe.run(container, { rules: { region: { enabled: true }, "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Cerrar proyecto" })).not.toBeInTheDocument());
  });
});

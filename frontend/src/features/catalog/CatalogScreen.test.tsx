import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderCatalog } from "../../test/renderCatalog";
import { server } from "../../test/server";
import { catalogFixture } from "../../test/fixtures/catalog";
import { sessionsFixture } from "../../test/fixtures/sessions";
import { chatResponseFixture } from "../../test/fixtures/tutor";

describe("CatalogScreen", () => {
  it("explora temas reales y mantiene los filtros en la URL", async () => {
    const user = userEvent.setup();
    const { router } = renderCatalog({ initialEntry: "/?view=all" });

    expect(await screen.findByRole("heading", { name: "Todos los temas" })).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);

    await user.selectOptions(screen.getByLabelText("Materia"), "english");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(router.state.location.search).toBe("?subject=english&view=all");
    expect(screen.getByRole("heading", { level: 3, name: "Greetings and introductions" })).toBeVisible();

    await user.type(screen.getByRole("searchbox", { name: "Buscar tema" }), "grammar");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(router.state.location.search).toContain("q=grammar");
  });

  it("navega de insignias a categorías y temas, y permite volver o ver todo", async () => {
    const user = userEvent.setup();
    const { router } = renderCatalog();
    await screen.findByRole("heading", { name: "Tus materias" });
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Inglés.*Explorar materia/ }));
    expect(router.state.location.search).toBe("?subject=english");
    expect(screen.getByRole("heading", { name: "Elige una categoría" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Fundamentos.*tema/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Comunicación.*tema/ }));
    expect(router.state.location.search).toBe("?subject=english&category=comunicacion");
    expect(screen.getByRole("heading", { level: 3, name: "Greetings and introductions" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 3, name: "Grammar in context" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Inglés" }));
    expect(screen.getByRole("heading", { name: "Elige una categoría" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Ver todo/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: "Materias" }));
    expect(router.state.location.search).toBe("");
    expect(screen.getByRole("heading", { name: "Tus materias" })).toBeVisible();
  });

  it("conserva el nivel en la categoría y lo envía al tutor", async () => {
    let requestBody: unknown;
    server.use(http.post("http://localhost:4173/api/chat", async ({ request }) => {
      requestBody = await request.json();
      return HttpResponse.json({ ...chatResponseFixture, session_id: "session-r1", level: "advanced" });
    }));
    const user = userEvent.setup();
    const { router } = renderCatalog({ initialEntry: "/?subject=english" });
    await screen.findByRole("heading", { name: "Elige una categoría" });
    await user.click(screen.getByRole("button", { name: "Elegir nivel" }));
    await user.click(screen.getByRole("button", { name: /^Avanzado/ }));
    expect(router.state.location.search).toBe("?subject=english&level=advanced");
    expect(screen.getByRole("button", { name: /Comunicación.*Sin temas/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Gramática.*Avanzado/ }));
    expect(screen.getByRole("slider", { name: "¿A qué nivel quieres aprender?" })).toHaveValue("3");
    expect(screen.getByRole("heading", { name: "Temas de Gramática" })).toBeVisible();
    expect(router.state.location.search).toBe("?subject=english&category=gramatica&level=advanced");
    await user.click(screen.getByRole("button", { name: /Estudiar de todos modos/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/tutor"));
    expect(requestBody).toMatchObject({ message: "Quiero aprender sobre Grammar in context", level: "advanced" });
  });

  it("deshabilita niveles sin contenido y permite regresar al nivel adaptativo", async () => {
    const user = userEvent.setup();
    const { router } = renderCatalog({ initialEntry: "/?subject=english&category=comunicacion" });
    await screen.findByRole("heading", { name: "Temas de Comunicación" });
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elegir nivel" })).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: "Elegir nivel" }));
    expect(screen.getByRole("button", { name: /^Intermedio/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Avanzado/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Principiante" }));
    expect(router.state.location.search).toContain("level=beginner");
    await user.click(screen.getByRole("button", { name: "Adaptado a ti" }));
    expect(router.state.location.search).not.toContain("level=");
    await user.click(screen.getByRole("button", { name: "Ocultar selector" }));
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elegir nivel" })).toHaveFocus();
  });

  it("cambia el slider con teclado y salta niveles sin contenido", async () => {
    const user = userEvent.setup();
    const { router } = renderCatalog({ initialEntry: "/?subject=english&category=comunicacion" });
    await user.click(await screen.findByRole("button", { name: "Elegir nivel" }));
    const slider = screen.getByRole("slider", { name: "¿A qué nivel quieres aprender?" });
    slider.focus();
    await user.keyboard("{ArrowRight}");
    expect(slider).toHaveValue("1");
    expect(slider).toHaveAttribute("aria-valuetext", "Principiante");
    expect(router.state.location.search).toContain("level=beginner");
    expect(slider).toHaveAccessibleDescription("Principiante Conceptos y ejemplos paso a paso");
    await user.keyboard("{ArrowRight}");
    expect(slider).toHaveValue("1");
    await user.keyboard("{Home}");
    expect(slider).toHaveValue("0");
    expect(router.state.location.search).not.toContain("level=");
  });

  it("muestra el error del servidor y permite reintentar", async () => {
    let calls = 0;
    server.use(
      http.get("http://localhost:4173/api/topics", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ detail: "MCP no disponible" }, { status: 503 })
          : HttpResponse.json(catalogFixture);
      }),
    );
    const user = userEvent.setup();
    renderCatalog();

    expect(await screen.findByRole("alert")).toHaveTextContent("MCP no disponible");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Elige qué quieres aprender" })).toBeVisible();
  });

  it("inicia el tema real y entrega la sesión al tutor React", async () => {
    let requestBody: unknown;
    let created = false;
    server.use(
      http.get("http://localhost:4173/api/sessions", () => HttpResponse.json(created ? {
        ...sessionsFixture,
        sessions: [{ ...sessionsFixture.sessions[0], id: "session-r1" }],
      } : { sessions: [], retention_days: 365 })),
      http.post("http://localhost:4173/api/chat", async ({ request }) => {
        requestBody = await request.json();
        created = true;
        return HttpResponse.json({ ...chatResponseFixture, session_id: "session-r1" });
      }),
    );
    const user = userEvent.setup();
    const { router } = renderCatalog();

    await user.click(await screen.findByRole("button", { name: /Continuar/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/tutor"));
    expect(window.localStorage.getItem("activeSession:student-test")).toBe("session-r1");
    expect(requestBody).toMatchObject({
      message: "Quiero aprender sobre Introducción a la inteligencia artificial",
    });
  });

  it("ofrece nombres, foco y contraste estructural sin hallazgos axe", async () => {
    const user = userEvent.setup();
    const { container } = renderCatalog();

    await screen.findByRole("heading", { name: "Elige qué quieres aprender" });
    await user.tab();
    expect(screen.getByRole("link", { name: "Saltar al contenido principal" })).toHaveFocus();

    const results = await axe.run(container, {
      rules: {
        region: { enabled: true },
        "color-contrast": { enabled: false },
      },
    });
    expect(results.violations).toEqual([]);
  });
});

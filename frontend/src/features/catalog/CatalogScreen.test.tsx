import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderCatalog } from "../../test/renderCatalog";
import { server } from "../../test/server";
import { catalogFixture } from "../../test/fixtures/catalog";

describe("CatalogScreen", () => {
  it("explora temas reales y mantiene los filtros en la URL", async () => {
    const user = userEvent.setup();
    const { router } = renderCatalog();

    expect(await screen.findByRole("heading", { name: "Elige qué quieres aprender" })).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);

    await user.selectOptions(screen.getByLabelText("Materia"), "english");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(router.state.location.search).toBe("?subject=english");
    expect(screen.getByRole("heading", { level: 3, name: "Greetings and introductions" })).toBeVisible();

    await user.type(screen.getByRole("searchbox", { name: "Buscar tema" }), "grammar");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(router.state.location.search).toContain("q=grammar");
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

  it("inicia el tema real y entrega la sesión a la interfaz heredada", async () => {
    const handoff = vi.fn();
    let requestBody: unknown;
    server.use(
      http.post("http://localhost:4173/api/chat", async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ session_id: "session-r1" });
      }),
    );
    const user = userEvent.setup();
    renderCatalog({ legacyHandoff: handoff });

    await user.click(await screen.findByRole("button", { name: /Continuar/ }));

    await waitFor(() => expect(handoff).toHaveBeenCalledWith("/?session=session-r1#tutor"));
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

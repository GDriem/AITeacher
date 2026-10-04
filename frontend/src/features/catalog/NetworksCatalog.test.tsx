import { http, HttpResponse } from "msw";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import { renderCatalog } from "../../test/renderCatalog";
import { server } from "../../test/server";
import { catalogFixture } from "../../test/fixtures/catalog";

it("explora Redes y Enrutamiento con sus tres dificultades", async () => {
  server.use(http.get("http://localhost:4173/api/topics", () => HttpResponse.json({
    ...catalogFixture,
    topics: [{
      ...catalogFixture.topics[0],
      topic: "routing-fundamentals",
      title: "Fundamentos de enrutamiento",
      subject: "networks",
      category: "enrutamiento",
      available_levels: ["beginner", "intermediate", "advanced"],
    }],
    total_topics: 1,
    available_topics: 1,
    blocked_topics: 0,
  })));
  const user = userEvent.setup();
  const { router } = renderCatalog();
  await user.click(await screen.findByRole("button", { name: /Redes.*Explorar materia/ }));
  expect(router.state.location.search).toBe("?subject=networks");
  await user.click(screen.getByRole("button", { name: /Enrutamiento.*tema/ }));
  expect(screen.getByRole("heading", { name: "Temas de Enrutamiento" })).toBeVisible();
  expect(screen.getByRole("heading", { level: 3, name: "Fundamentos de enrutamiento" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Elegir nivel" }));
  for (const level of ["Principiante", "Intermedio", "Avanzado"]) {
    expect(screen.getByRole("button", { name: level })).toBeEnabled();
  }
  await user.click(screen.getByRole("button", { name: "Avanzado" }));
  expect(router.state.location.search).toContain("level=advanced");
});

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { projectEvaluationFixture, projectsFixture } from "../src/test/fixtures/projects";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: true, voice: false, voice_model: null, authoring: false }) }),
  );
  await page.route("**/api/auth/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false, authenticated: false, google_client_id: null, profile: null }) }),
  );
  await page.route("**/api/projects", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(projectsFixture) }),
  );
  await page.route("**/api/projects/*/evaluate", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(projectEvaluationFixture) }),
  );
});

for (const width of [320, 768, 1024, 1440]) {
  test(`el workspace de proyectos no desborda a ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./proyectos");
    await expect(page.getByRole("heading", { name: "Convierte lo aprendido en una propuesta" })).toBeVisible();
    await page.getByRole("button", { name: /Abrir proyecto/ }).first().click();
    await expect(page.getByRole("heading", { name: "Entregables" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("teclado, foco, resultado, axe y consola cubren el proyecto completo", async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") consoleMessages.push(message.text());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("./proyectos");
  await expect(page.getByRole("heading", { name: "Convierte lo aprendido en una propuesta" })).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido principal" })).toBeFocused();

  const openButton = page.getByRole("button", { name: /Abrir proyecto/ }).first();
  await openButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Asistente RAG confiable" }).last()).toBeFocused();
  await page.getByLabel("Tu propuesta").fill("Primero recupero evidencia y cito fuentes; después valido permisos, errores, latencia y calidad.");
  const evaluateButton = page.getByRole("button", { name: /Evaluar proyecto/ });
  await evaluateButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "81/100 · Dominado" })).toBeFocused();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
  expect(consoleMessages).toEqual([]);
});

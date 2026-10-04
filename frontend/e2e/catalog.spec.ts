import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { catalogFixture } from "../src/test/fixtures/catalog";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: true, voice: false, voice_model: null, authoring: false }) }),
  );
  await page.route("**/api/auth/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false, authenticated: false, google_client_id: null, profile: null }) }),
  );
  await page.route("**/api/topics**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ...catalogFixture,
      total_topics: 7,
      blocked_topics: 5,
      topics: [...catalogFixture.topics, ...["agentes-y-herramientas", "calidad-y-seguridad", "produccion"].map((category) => ({
        ...catalogFixture.topics[1], topic: category, title: category, category,
      }))],
    }) }),
  );
  await page.route("**/api/sessions**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessions: [], retention_days: 365 }) }),
  );
});

for (const width of [320, 768, 1024, 1440]) {
  test(`el catálogo no desborda a ${String(width)}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./");
    await expect(page.getByRole("heading", { name: "Elige qué quieres aprender" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tus materias" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("materias.png"), fullPage: true });
    await page.getByRole("button", { name: /Inteligencia artificial.*Explorar materia/ }).click();
    await expect(page.getByRole("heading", { name: "Elige una categoría" })).toBeVisible();
    const hexagons = page.getByRole("button", { name: /tema.*Principiante/ });
    for (const hexagon of await hexagons.all()) {
      expect(await hexagon.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath("categorias.png"), fullPage: true });
    await expect(page.getByRole("slider")).toHaveCount(0);
    await page.getByRole("button", { name: "Elegir nivel" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath("termometro.png"), fullPage: true });
    const slider = page.getByRole("slider", { name: "¿A qué nivel quieres aprender?" });
    await slider.scrollIntoViewIfNeeded();
    const bounds = await slider.boundingBox();
    if (!bounds) throw new Error("El slider no tiene dimensiones");
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height - 12);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 12 + (bounds.height - 24) / 3, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByRole("slider", { name: "¿A qué nivel quieres aprender?" })).toHaveValue("2");
    await expect(page.getByRole("heading", { name: "Elige una categoría" })).toBeVisible();
    await page.getByRole("button", { name: /Fundamentos.*Intermedio/ }).click();
    await expect(page.getByRole("slider", { name: "¿A qué nivel quieres aprender?" })).toHaveValue("2");
    await expect(page.getByRole("heading", { level: 3, name: "Introducción a la inteligencia artificial" })).toBeVisible();
    await page.getByRole("button", { name: /Ver todo/ }).click();
    await expect(page.getByRole("searchbox", { name: "Buscar tema" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}

test("teclado y axe cubren el recorrido principal", async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      consoleMessages.push(message.text());
    }
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Elige qué quieres aprender" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido principal" })).toBeFocused();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
  await page.getByRole("button", { name: /Inteligencia artificial.*Explorar materia/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await page.getByRole("button", { name: "Elegir nivel" }).click();
  const categoryAccessibility = await new AxeBuilder({ page }).analyze();
  expect(categoryAccessibility.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
  expect(consoleMessages).toEqual([]);
});

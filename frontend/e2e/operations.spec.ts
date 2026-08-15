import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { catalogFixture } from "../src/test/fixtures/catalog";
import { observabilityFixture } from "../src/test/fixtures/observability";
import { projectsFixture } from "../src/test/fixtures/projects";

async function routeAll(page: Page) {
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: true, voice: false, voice_model: null, authoring: false }) }),
  );
  await page.route("**/api/auth/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false, authenticated: false, google_client_id: null, profile: null }) }),
  );
  await page.route("**/api/topics**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalogFixture) }),
  );
  await page.route("**/api/projects", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(projectsFixture) }),
  );
  await page.route("**/api/sessions**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessions: [], retention_days: 365 }) }),
  );
  await page.route("**/api/observability", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(observabilityFixture) }),
  );
}

for (const width of [320, 768, 1024, 1440]) {
  test(`la navegación entre rutas es accesible y no desborda a ${String(width)}px`, async ({ page }) => {
    await routeAll(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./");
    await expect(page.getByRole("heading", { name: "Elige qué quieres aprender" })).toBeVisible();

    await page.getByRole("link", { name: "Proyectos" }).click();
    await expect(page.getByRole("heading", { name: "Convierte lo aprendido en una propuesta" })).toBeFocused();

    await page.getByRole("link", { name: "Tutor" }).click();
    await expect(page.getByRole("heading", { name: "Tu espacio para entender" })).toBeFocused();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
  });
}

test("la primera carga deja el enlace de salto como primera parada de tabulación", async ({ page }) => {
  await routeAll(page);
  await page.goto("./proyectos");
  await expect(page.getByRole("heading", { name: "Convierte lo aprendido en una propuesta" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido principal" })).toBeFocused();
});

test("la conexión perdida se anuncia, no desborda y se recupera al volver la red", async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") consoleMessages.push(message.text());
  });
  await routeAll(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Elige qué quieres aprender" })).toBeVisible();

  await page.context().setOffline(true);
  await expect(page.getByText("Sin conexión. Reintentaremos cuando vuelva la red.").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);

  await page.context().setOffline(false);
  await expect(page.getByText("Sin conexión. Reintentaremos cuando vuelva la red.")).toHaveCount(0);
  await expect(page.getByText("Conexión recuperada. Actualizando la información.").first()).toBeVisible();
  expect(consoleMessages).toEqual([]);
});

test("el panel de operación muestra un fallo persistente y permite reintentar", async ({ page }) => {
  // Un 503 real y persistente hace que Chromium registre "Failed to load
  // resource" en la consola por cada intento; no se afirma consola limpia
  // aquí, igual que el resto de la suite no lo hace en escenarios con un
  // estado de error HTTP deliberado (ver "un 401 abre recuperación uniforme"
  // en auth.spec.ts).
  let calls = 0;
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: true, voice: false, voice_model: null, authoring: false }) }),
  );
  await page.route("**/api/auth/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false, authenticated: false, google_client_id: null, profile: null }) }),
  );
  await page.route("**/api/topics**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalogFixture) }),
  );
  await page.route("**/api/sessions**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessions: [], retention_days: 365 }) }),
  );
  // El proveedor de datos real reintenta automáticamente los fallos 5xx, así
  // que este panel se mantiene indisponible para verificar el estado de error
  // en el árbol de producción (con reintentos activos), no sólo en pruebas
  // unitarias donde se desactivan.
  await page.route("**/api/observability", (route) => {
    calls += 1;
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "No disponible" }) });
  });
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("./tutor");

  await expect(page.getByText("No pudimos consultar las señales.")).toBeVisible({ timeout: 10_000 });
  const callsBeforeRetry = calls;
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect.poll(() => calls, { timeout: 10_000 }).toBeGreaterThan(callsBeforeRetry);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
});

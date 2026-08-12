import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { catalogFixture } from "../src/test/fixtures/catalog";
import { sessionDetail, sessionsFixture } from "../src/test/fixtures/sessions";
import type { ConversationSummary } from "../src/features/sessions/sessionsApi";

async function routeShell(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("studentAutoId", "student-e2e");
  });
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: true, voice: false, voice_model: null, authoring: false }) }),
  );
  await page.route("**/api/auth/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false, authenticated: false, google_client_id: null, profile: null }) }),
  );
  await page.route("**/api/topics**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalogFixture) }),
  );
  await page.route("**/api/sessions?**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sessionsFixture) }),
  );
  await page.route("**/api/sessions/*?**", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1) ?? "session-vectors";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sessionDetail(id)) });
  });
}

for (const width of [320, 768, 1024, 1440]) {
  test(`el drawer de sesiones es accesible y no desborda a ${String(width)}px`, async ({ page }) => {
    await routeShell(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./");
    await page.getByRole("button", { name: "Conversaciones" }).click();

    await expect(page.getByRole("heading", { name: "Conversaciones" })).toBeFocused();
    await expect(page.getByText("Vectores semánticos")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
  });
}

test("teclado, búsqueda, continuidad y consola cubren el drawer completo", async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") consoleMessages.push(message.text());
  });
  await routeShell(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");

  const trigger = page.getByRole("button", { name: "Conversaciones" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Conversaciones" })).toBeFocused();

  const search = page.getByRole("searchbox", { name: "Buscar por título o tema" });
  await search.fill("agentes");
  await expect(page.getByText("Agentes y herramientas")).toBeVisible();
  await expect(page.getByText("Vectores semánticos")).not.toBeVisible();
  await search.fill("");

  await page.getByRole("button", { name: "Abrir" }).first().click();
  await page.waitForURL("**/?session=session-vectors#tutor");
  expect(await page.evaluate(() => localStorage.getItem("activeSession:student-e2e"))).toBe("session-vectors");

  await page.goto("./");
  await page.getByRole("button", { name: "Conversaciones" }).click();
  await expect(page.getByText("Activa", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(consoleMessages).toEqual([]);
});

test("renombrar, archivar, restaurar y borrar exigen decisiones explícitas", async ({ page }) => {
  let sessions: ConversationSummary[] = structuredClone(sessionsFixture.sessions);
  await routeShell(page);
  await page.unroute("**/api/sessions?**");
  await page.route("**/api/sessions?**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessions, retention_days: 365 }) }),
  );
  await page.route("**/api/sessions/*", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1) ?? "";
    if (route.request().method() === "PATCH") {
      const update = route.request().postDataJSON() as { title?: string; archived?: boolean };
      sessions = sessions.map((item) => item.id === id ? {
        ...item,
        ...(update.title ? { title: update.title } : {}),
        ...(typeof update.archived === "boolean" ? { archived_at: update.archived ? "2026-08-12T18:00:00Z" : null } : {}),
      } : item);
      const changed = sessions.find((item) => item.id === id);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...sessionDetail(id), ...changed }) });
    }
    if (route.request().method() === "DELETE") {
      sessions = sessions.filter((item) => item.id !== id);
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fallback();
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Conversaciones" }).click();

  const row = page.getByRole("listitem").filter({ hasText: "Vectores semánticos" });
  await row.getByRole("button", { name: "Renombrar" }).click();
  await row.getByRole("textbox", { name: "Nuevo nombre" }).fill("Embeddings aplicados");
  await row.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Embeddings aplicados")).toBeVisible();

  const renamed = page.getByRole("listitem").filter({ hasText: "Embeddings aplicados" });
  await renamed.getByRole("button", { name: "Eliminar" }).click();
  await expect(renamed.getByRole("group", { name: "Eliminar Embeddings aplicados" })).toContainText("Se eliminará definitivamente");
  await renamed.getByRole("button", { name: "Cancelar" }).click();
  await renamed.getByRole("button", { name: "Archivar" }).click();
  await expect(page.getByText("Embeddings aplicados")).not.toBeVisible();

  await page.getByRole("button", { name: /Archivadas/ }).click();
  const archived = page.getByRole("listitem").filter({ hasText: "Embeddings aplicados" });
  await archived.getByRole("button", { name: "Restaurar" }).click();
  await expect(page.getByText("Embeddings aplicados")).not.toBeVisible();
});

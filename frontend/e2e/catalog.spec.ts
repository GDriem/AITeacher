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
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalogFixture) }),
  );
});

for (const width of [320, 768, 1024, 1440]) {
  test(`el catálogo no desborda a ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./");
    await expect(page.getByRole("heading", { name: "Elige qué quieres aprender" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
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
  expect(consoleMessages).toEqual([]);
});

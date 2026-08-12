import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { catalogFixture } from "../src/test/fixtures/catalog";

const capabilities = { text: true, voice: false, voice_model: null, authoring: false };
const profile = {
  student_id: "google-student-e2e",
  email: "student@example.com",
  display_name: "Estudiante Verificada",
  picture_url: null,
};

async function installGoogleStub(page: Page) {
  await page.addInitScript(() => {
    let callback: ((response: { credential: string }) => void) | null = null;
    const target = window as typeof window & {
      google: {
        accounts: {
          id: {
            initialize: (options: { callback: (response: { credential: string }) => void }) => void;
            renderButton: (parent: HTMLElement) => void;
            disableAutoSelect: () => void;
          };
        };
      };
    };
    target.google = {
      accounts: {
        id: {
          initialize: (options) => { callback = options.callback; },
          renderButton: (parent) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "Continuar con Google";
            button.addEventListener("click", () => callback?.({ credential: `credential-${"x".repeat(100)}` }));
            parent.append(button);
          },
          disableAutoSelect: () => undefined,
        },
      },
    };
  });
}

async function routeCatalog(page: Page) {
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(capabilities) }),
  );
  await page.route("**/api/topics**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalogFixture) }),
  );
}

for (const width of [320, 768, 1024, 1440]) {
  test(`el gate autenticado es accesible y no desborda a ${String(width)}px`, async ({ page }) => {
    await installGoogleStub(page);
    await routeCatalog(page);
    await page.route("**/api/auth/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ enabled: true, authenticated: false, google_client_id: "client.apps.googleusercontent.com", profile: null }),
      }),
    );
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./");

    await expect(page.getByRole("heading", { name: "Continúa con tu cuenta" })).toBeFocused();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
  });
}

test("login, perfil, teclado y logout comparten una sola identidad", async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") consoleMessages.push(message.text());
  });
  await installGoogleStub(page);
  await routeCatalog(page);
  await page.route("**/api/auth/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: true, authenticated: false, google_client_id: "client.apps.googleusercontent.com", profile: null }),
    }),
  );
  await page.route("**/api/auth/google", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(profile) }),
  );
  await page.route("**/api/auth/logout", (route) => route.fulfill({ status: 204, body: "" }));
  await page.goto("./");

  const googleButton = page.getByRole("button", { name: "Continuar con Google" });
  await expect(googleButton).toBeVisible();
  await googleButton.focus();
  await page.keyboard.press("Tab");
  await expect(googleButton).toBeFocused();
  await googleButton.click();
  await expect(page.getByRole("heading", { name: "Elige qué quieres aprender" })).toBeVisible();

  const authenticatedAccessibility = await new AxeBuilder({ page }).analyze();
  expect(authenticatedAccessibility.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);

  const account = page.getByRole("button", { name: "Estudiante Verificada" });
  await account.click();
  await expect(page.getByRole("menuitem", { name: "Cerrar sesión" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(account).toBeFocused();
  await account.click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page.getByRole("heading", { name: "Continúa con tu cuenta" })).toBeFocused();

  const stored = await page.evaluate(() => {
    const values: (string | null)[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      values.push(key ? localStorage.getItem(key) : null);
    }
    return values.join(" ");
  });
  expect(stored).not.toContain(profile.email);
  expect(stored).not.toContain(profile.display_name);
  expect(consoleMessages).toEqual([]);
});

test("un 401 abre recuperación uniforme y restaura el foco", async ({ page }) => {
  await installGoogleStub(page);
  await routeCatalog(page);
  await page.route("**/api/auth/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: true, authenticated: true, google_client_id: "client.apps.googleusercontent.com", profile }),
    }),
  );
  await page.route("**/api/chat", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "La sesión expiró" }) }),
  );
  await page.route("**/api/auth/google", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(profile) }),
  );
  await page.goto("./");

  const start = page.getByRole("button", { name: /Continuar/ });
  await start.focus();
  await start.click();
  await expect(page.getByRole("heading", { name: "Continúa con tu cuenta" })).toBeFocused();
  await page.getByRole("button", { name: "Continuar con Google" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(start).toBeFocused();
});

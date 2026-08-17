import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

import type { AuthoredLesson, LearningContent } from "../src/features/authoring/authoringApi";
import { authoredContentFixture, authoringLessonsFixture } from "../src/test/fixtures/authoring";
import { catalogFixture } from "../src/test/fixtures/catalog";

let lessons: AuthoredLesson[];
let mutationRequests: string[];

test.beforeEach(async ({ page }) => {
  lessons = structuredClone(authoringLessonsFixture);
  mutationRequests = [];
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: true, voice: false, voice_model: null, authoring: true }) }),
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
  await page.route("**/api/authoring/lessons**", async (route) => handleAuthoring(route));
});

async function enterAuthoring(page: Page) {
  await page.getByLabel("Nombre del editor").fill("Ana Editora");
  await page.getByLabel("Credencial de acceso").fill("panel-secret");
  await page.getByRole("button", { name: "Acceder a las lecciones" }).click();
  await expect(page.getByRole("heading", { name: "Nueva lección" })).toBeFocused();
}

for (const width of [320, 768, 1024, 1440]) {
  test(`la mesa editorial no desborda a ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./autoria");
    await enterAuthoring(page);
    await page.getByRole("button", { name: /Embeddings con evidencia/ }).click();
    await expect(page.getByRole("heading", { name: "Historial y reversión" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("autoría protege la ruta, difiere el editor y completa el ciclo editorial con teclado", async ({ page }) => {
  const consoleMessages: string[] = [];
  const editorRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") consoleMessages.push(message.text());
  });
  page.on("request", (request) => {
    if (request.url().includes("/features/authoring/LessonEditor")) editorRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("./autoria");
  await expect(page.getByRole("heading", { name: "Mesa editorial AITeacher" })).toBeVisible();
  expect(editorRequests).toEqual([]);

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido principal" })).toBeFocused();
  await enterAuthoring(page);
  await expect.poll(() => editorRequests.length).toBeGreaterThan(0);

  const search = page.getByLabel("Buscar por título o identificador");
  await search.fill("embeddings");
  await expect(page.getByText("1 de 2 lecciones")).toBeVisible();
  await page.getByRole("button", { name: /Embeddings con evidencia/ }).press("Enter");
  await expect(page.getByRole("heading", { name: "Embeddings con evidencia" })).toBeFocused();
  await page.getByRole("button", { name: "Vista previa" }).click();
  await expect(page.getByRole("article", { name: "Embeddings con evidencia" })).toContainText("evidencia verificable");

  await page.getByRole("button", { name: "Nueva lección" }).click();
  await page.getByRole("textbox", { name: "Identificador", exact: true }).fill("editorial-e2e");
  await page.getByRole("combobox", { name: "Tema", exact: true }).selectOption("embeddings");
  await page.getByRole("textbox", { name: "Título", exact: true }).fill("Práctica editorial de embeddings");
  await page.getByRole("textbox", { name: "Fuente", exact: true }).fill("Equipo curricular AITeacher");
  await page.getByRole("textbox", { name: /^Palabras clave/ }).fill("vectores, VECTORES");
  await page.getByRole("textbox", { name: /^Contenido/ }).fill(authoredContentFixture.text);
  await page.getByRole("button", { name: "Guardar y publicar" }).click();
  await expect(page.getByRole("alert")).toContainText("no pueden repetirse");
  expect(mutationRequests).toEqual([]);

  await page.getByRole("textbox", { name: /^Palabras clave/ }).fill("vectores, similitud");
  await page.getByRole("button", { name: "Guardar y publicar" }).click();
  await expect(page.getByText("Lección publicada. Versión 2.").first()).toBeVisible();
  expect(mutationRequests).toEqual(["create", "publish"]);

  const unpublish = page.getByRole("button", { name: "Despublicar" });
  await unpublish.click();
  const confirmation = page.getByRole("alertdialog", { name: "¿Retirar esta lección del catálogo?" });
  await expect(confirmation.getByRole("button", { name: "Sí, despublicar" })).toBeFocused();
  await confirmation.getByRole("button", { name: "Cancelar" }).click();
  await expect(unpublish).toBeFocused();
  expect(mutationRequests).toEqual(["create", "publish"]);

  await unpublish.click();
  await page.getByRole("button", { name: "Sí, despublicar" }).click();
  await expect(page.getByText(/Borrador actualizado\. Versión 3/).first()).toBeVisible();
  await page.getByRole("button", { name: "Revertir a la versión 1" }).click();
  await page.getByRole("button", { name: "Sí, revertir a v1" }).click();
  await expect(page.getByText(/Borrador actualizado\. Versión 4/).first()).toBeVisible();
  expect(mutationRequests).toEqual(["create", "publish", "unpublish", "revert"]);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.getItem("authoringToken"), session: sessionStorage.getItem("authoringToken") })))
    .toEqual({ local: null, session: null });
});

test("la capacidad deshabilitada oculta autoría y devuelve la ruta al catálogo", async ({ page }) => {
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: true, voice: false, voice_model: null, authoring: false }) }),
  );
  await page.goto("./autoria");
  await expect(page).toHaveURL("http://127.0.0.1:4173/");
  await expect(page.getByRole("link", { name: "Autoría" })).toHaveCount(0);
});

async function handleAuthoring(route: Route) {
  const request = route.request();
  const url = new URL(request.url());
  if (request.headers()["x-authoring-token"] !== "panel-secret") {
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "Credencial de autoría inválida" }) });
    return;
  }
  const suffix = url.pathname.slice("/api/authoring/lessons".length);
  const method = request.method();
  if (!suffix && method === "GET") return route.fulfill(json(lessons));
  if (!suffix && method === "POST") {
    mutationRequests.push("create");
    const body = request.postDataJSON() as { author: string; content: LearningContent };
    const created = lessonFromContent(body.content, body.author);
    lessons.push(created);
    return route.fulfill(json(created, 201));
  }
  const segments = suffix.split("/").filter(Boolean);
  const lessonId = decodeURIComponent(segments[0] ?? "");
  const index = lessons.findIndex((lesson) => lesson.id === lessonId);
  if (index < 0) return route.fulfill(json({ detail: "Lección no encontrada" }, 404));
  const current = lessons[index];
  if (!current) return route.fulfill(json({ detail: "Lección no encontrada" }, 404));
  if (method === "PUT") {
    mutationRequests.push("update");
    const body = request.postDataJSON() as { author: string; content: LearningContent };
    const updated = appendRevision(current, body.content, body.author, "updated", current.published);
    lessons[index] = updated;
    return route.fulfill(json(updated));
  }
  const action = segments[1];
  const body = request.postDataJSON() as { author: string; version?: number };
  if (action === "publish") {
    mutationRequests.push("publish");
    const updated = appendRevision(current, current.draft, body.author, "published", true);
    lessons[index] = updated;
    return route.fulfill(json(updated));
  }
  if (action === "unpublish") {
    mutationRequests.push("unpublish");
    const updated = appendRevision(current, current.draft, body.author, "unpublished", false);
    lessons[index] = updated;
    return route.fulfill(json(updated));
  }
  if (action === "revert") {
    mutationRequests.push("revert");
    const target = current.revisions.find((revision) => revision.version === body.version) ?? current.revisions[0];
    if (!target) return route.fulfill(json({ detail: "Versión no encontrada" }, 404));
    const updated = appendRevision(current, target.draft, body.author, "reverted", target.published, body.version);
    lessons[index] = updated;
    return route.fulfill(json(updated));
  }
  return route.fulfill(json(current));
}

function lessonFromContent(content: LearningContent, author: string): AuthoredLesson {
  const createdAt = "2026-08-14T18:00:00Z";
  return {
    id: content.id,
    draft: content,
    published: false,
    published_content: null,
    version: 1,
    created_at: createdAt,
    updated_at: createdAt,
    revisions: [{ version: 1, action: "created", author, draft: content, published: false, published_content: null, created_at: createdAt, reverted_from: null }],
  };
}

function appendRevision(
  lesson: AuthoredLesson,
  content: LearningContent,
  author: string,
  action: "updated" | "published" | "unpublished" | "reverted",
  published: boolean,
  revertedFrom?: number,
): AuthoredLesson {
  const version = lesson.version + 1;
  const publishedContent = published ? content : null;
  const revision = { version, action, author, draft: content, published, published_content: publishedContent, created_at: "2026-08-14T18:05:00Z", reverted_from: revertedFrom ?? null };
  return { ...lesson, draft: content, published, published_content: publishedContent, version, updated_at: revision.created_at, revisions: [...lesson.revisions, revision] };
}

function json(body: unknown, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

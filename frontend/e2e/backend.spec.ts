import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function googleForTests(page: Page, credential: string) {
  await page.addInitScript((initialCredential) => {
    let callback: ((response: { credential: string }) => void) | null = null;
    const target = window as typeof window & { google: { accounts: { id: {
      initialize: (options: { callback: (response: { credential: string }) => void }) => void;
      renderButton: (parent: HTMLElement) => void; disableAutoSelect: () => void;
    } } } };
    target.google = { accounts: { id: {
      initialize: (options) => { callback = options.callback; },
      renderButton: (parent) => {
        const button = document.createElement("button"); button.type = "button"; button.textContent = "Continuar con Google";
        button.addEventListener("click", () => callback?.({ credential: sessionStorage.getItem("browser-test-user") ?? initialCredential }));
        parent.append(button);
      }, disableAutoSelect: () => undefined,
    } } };
  }, credential);
}

async function login(page: Page) {
  await page.getByRole("button", { name: "Continuar con Google", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();
}

function mainNav(page: Page, name: string) {
  return page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name, exact: true });
}

async function openCatalog(page: Page) {
  await mainNav(page, "Catálogo").click();
  await expect(page.getByRole("heading", { name: "Explora el catálogo" })).toBeVisible();
}

/** Catálogo → tema → unidad, por los nombres accesibles de cada tarjeta. */
async function openUnit(page: Page, topic: string, unit: string) {
  await openCatalog(page); await page.getByLabel("Buscar temas o lecturas").fill(topic);
  await page.getByRole("link", { name: topic, exact: true }).click();
  await expect(page.getByRole("heading", { name: topic, level: 1 })).toBeVisible();
  await page.getByRole("link", { name: unit, exact: true }).click();
  await expect(page.getByRole("heading", { name: unit, level: 1 })).toBeVisible();
}

async function switchUser(page: Page, credential: string) {
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Continúa con tu cuenta" })).toBeVisible();
  await page.evaluate((value) => sessionStorage.setItem("browser-test-user", value), credential);
  await login(page);
}

test("recorrido editorial y de alumno sobre .NET y PostgreSQL reales", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await googleForTests(page, "author"); await page.goto("/"); await login(page);
  await mainNav(page, "Autoría").click();
  await page.getByRole("navigation", { name: "Herramientas de autoría" }).getByRole("link", { name: "Catálogo", exact: true }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Curso Beta"); await page.getByRole("button", { name: "Guardar entrada" }).click();
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("");
  await page.getByLabel("Qué quieres administrar").selectOption("categories");
  await page.getByLabel("Nombre", { exact: true }).fill("Fundamentos Beta"); await page.getByLabel("Materia", { exact: true }).selectOption({ label: "Curso Beta" });
  await page.getByRole("button", { name: "Guardar entrada" }).click(); await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("");
  await page.getByLabel("Qué quieres administrar").selectOption("topics");
  await page.getByLabel("Nombre", { exact: true }).fill("Vectores Beta"); await page.getByLabel("Materia", { exact: true }).selectOption({ label: "Curso Beta" });
  await page.getByLabel("Categoría", { exact: true }).selectOption({ label: "Fundamentos Beta" }); await page.getByRole("button", { name: "Guardar entrada" }).click();
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("");
  await page.getByRole("navigation", { name: "Herramientas de autoría" }).getByRole("link", { name: "Unidades", exact: true }).click();
  await page.getByRole("button", { name: "Crear unidad", exact: true }).click(); await page.getByLabel("Tema de la nueva unidad").selectOption({ label: "Vectores Beta" });
  await page.getByLabel("Título de la unidad").fill("Unidad Beta de vectores");
  await page.getByRole("button", { name: "Añadir concepto", exact: true }).click(); await page.getByLabel("Nombre del concepto").fill("Concepto Beta");
  await page.getByRole("button", { name: "Añadir objetivo", exact: true }).click(); await page.getByLabel("Descripción del objetivo").fill("Explicar Concepto Beta");
  await page.getByRole("checkbox", { name: "Concepto Beta", exact: true }).check();
  await page.getByRole("button", { name: "Añadir lectura", exact: true }).click(); await page.getByLabel("Título de lectura").fill("Lectura de vectores");
  await page.getByLabel("Texto de lectura").fill("Un vector representa características. Concepto Beta conecta esas características con una comparación.");
  await page.getByLabel("Fuente de lectura").fill("Material sintético para probar el recorrido");
  await page.getByRole("button", { name: "Añadir ejercicio", exact: true }).click(); await page.getByLabel("Consigna del ejercicio").fill("Explica qué características compararías.");
  await page.getByRole("button", { name: "Añadir evaluación editorial", exact: true }).click(); await page.getByLabel("Consigna de evaluación").fill("Justifica una comparación.");
  await page.getByLabel("Criterios privados de evaluación").fill("PRIVATE-EDITORIAL-BROWSER");
  for (const checkbox of await page.getByRole("checkbox", { name: "Explicar Concepto Beta", exact: true }).all()) await checkbox.check();
  await page.getByRole("button", { name: "Guardar borrador" }).click(); await page.getByRole("button", { name: "Publicar esta revisión" }).click();
  await expect(page.getByRole("button", { name: "Publicar esta revisión" })).toBeDisabled();
  await page.getByLabel("Enunciado", { exact: true }).fill("¿Qué representa un vector?");
  await page.getByRole("group", { name: "Objetivos evaluados" }).getByRole("checkbox").check();
  await page.getByLabel("Opción 1", { exact: true }).fill("Características"); await page.getByLabel("Opción 2", { exact: true }).fill("Una contraseña");
  await page.getByRole("radio", { name: "Respuesta correcta" }).first().check(); await page.getByRole("button", { name: "Guardar pregunta", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pregunta guardada" })).toBeVisible();
  await page.getByLabel("Título de evaluación").fill("Evaluación cerrada beta"); await page.getByRole("checkbox", { name: "¿Qué representa un vector?", exact: true }).check();
  await page.getByRole("button", { name: "Publicar evaluación", exact: true }).click(); await expect(page.getByLabel("Título de evaluación")).toHaveValue("");
  await page.getByLabel("Tipo de pregunta").selectOption("openResponse"); await page.getByLabel("Enunciado", { exact: true }).fill("Justifica tu comparación de vectores.");
  await page.getByLabel("Guía privada de corrección").fill("PRIVATE-RUBRIC-BROWSER");
  await page.getByRole("group", { name: "Criterio 1", exact: true }).getByLabel("Descripción", { exact: true }).fill("Justificación coherente");
  await page.getByRole("button", { name: "Guardar pregunta", exact: true }).click(); await expect(page.getByLabel("Enunciado", { exact: true })).toHaveValue("");
  await page.getByLabel("Título de evaluación").fill("Evaluación abierta beta"); await page.getByRole("checkbox", { name: "Justifica tu comparación de vectores.", exact: true }).check();
  await page.getByRole("button", { name: "Publicar evaluación", exact: true }).click(); await expect(page.getByLabel("Título de evaluación")).toHaveValue("");
  await page.getByLabel("Título de referencia curricular").fill("Mapa Beta"); await page.getByRole("button", { name: "Publicar referencia curricular" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Referencia curricular publicada" })).toBeVisible();

  await switchUser(page, "student-a"); await expect(mainNav(page, "Autoría")).toHaveCount(0);
  await openUnit(page, "Vectores Beta", "Unidad Beta de vectores"); await expect(page.getByRole("heading", { name: "Lectura de vectores", exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("PRIVATE-EDITORIAL-BROWSER"); await expect(page.locator("body")).not.toContainText("PRIVATE-RUBRIC-BROWSER");
  await page.getByRole("button", { name: "Iniciar Evaluación cerrada beta", exact: true }).click();
  await expect(page).toHaveURL(/\/evaluaciones\/[^/]+$/); await expect(page.getByRole("heading", { name: "Intento de evaluación", level: 1 })).toBeFocused();
  await page.getByRole("radio", { name: "Características", exact: true }).check(); await page.getByRole("button", { name: "Entregar respuestas" }).click();
  await expect(page.getByText("Resultado: 100 %", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByText("Resultado: 100 %", { exact: true })).toBeVisible();
  await page.goBack(); await expect(page.getByRole("heading", { name: "Unidad Beta de vectores", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Iniciar Evaluación abierta beta", exact: true }).click(); await page.getByLabel("Tu respuesta", { exact: true }).fill("Comparo características para justificar similitud.");
  await page.getByRole("button", { name: "Entregar respuestas" }).click(); await expect(page.getByText("Pendiente de corrección docente", { exact: true })).toBeVisible();
  await page.goBack();
  await page.getByRole("link", { name: "Abrir conversación", exact: true }).click(); await page.getByRole("button", { name: "Nueva conversación", exact: true }).click();
  await page.getByLabel("Tu mensaje", { exact: true }).fill("Quiero explorar Concepto Beta."); await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText("Respuesta de simulación: considera la idea principal.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Guardar mensaje en apuntes", exact: true }).last().click(); await expect(page.getByText("Apunte guardado.", { exact: true })).toBeVisible();
  await page.getByLabel("Referencia curricular", { exact: true }).selectOption({ label: "Mapa Beta · revisión 1" });
  await page.getByLabel("Mensaje para buscar menciones").selectOption({ label: "Quiero explorar Concepto Beta." });
  await page.getByRole("button", { name: "Buscar menciones", exact: true }).click(); await page.getByLabel("Motivo de tu corrección").fill("Esta mención corresponde a mi pregunta.");
  await page.getByRole("button", { name: "Aceptar observación", exact: true }).click(); await expect(page.getByText(/Concepto Beta · Mención · Aceptada/)).toBeVisible();
  await page.getByRole("button", { name: "Conversar por voz", exact: true }).click();
  await page.getByRole("button", { name: "Comenzar por voz", exact: true }).click();
  await expect(page.getByText("Voz de prueba de la unidad", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finalizar conversación por voz", exact: true }).click();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  }
  await mainNav(page, "Apuntes").click(); await expect(page.getByRole("heading", { name: "Mensaje guardado", exact: true })).toBeVisible();
  await page.getByLabel("Nuevo apunte").fill("Mi idea privada de la beta"); await page.getByRole("button", { name: "Guardar apunte", exact: true }).click();
  await expect(page.getByText("Mi idea privada de la beta", { exact: true })).toBeVisible();
  await mainNav(page, "Historial").click(); await page.getByRole("button", { name: "Historia de vectores · 1 mensajes", exact: true }).click();
  await expect(page.getByText("Mi explicación histórica", { exact: true })).toBeVisible(); await expect(page.locator("body")).not.toContainText("PRIVATE-HISTORICAL-KEY");
  await switchUser(page, "author"); await mainNav(page, "Autoría").click(); await page.getByRole("link", { name: "Corregir entregas", exact: true }).click();
  await page.getByRole("listitem").filter({ hasText: "Evaluación abierta beta" }).getByRole("button", { name: "Consultar entrega" }).click();
  await page.getByLabel("Justificación coherente · máximo 1").fill("1"); await page.getByLabel("Feedback al alumno").fill("La comparación está justificada.");
  await page.getByRole("button", { name: "Confirmar corrección final" }).click(); await expect(page.getByText(/Corrección final registrada/)).toBeVisible();
  await switchUser(page, "student-b"); await mainNav(page, "Apuntes").click(); await expect(page.getByText("Todavía no hay apuntes.", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Mi idea privada de la beta");
  await mainNav(page, "Historial").click(); await expect(page.getByText("No hay conversaciones históricas importadas para tu cuenta.", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});


test("catálogo migrado: materias, categorías, niveles y lecturas sin actividades ficticias", async ({ page }) => {
  await googleForTests(page, "student-a"); await page.goto("/"); await login(page); await openCatalog(page);
  const ospf = "Enrutamiento dinámico con OSPF";
  await page.getByRole("group", { name: "Materia" }).getByRole("button", { name: "Redes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Enrutamiento", level: 3 })).toBeVisible();
  await page.getByLabel("Buscar temas o lecturas").fill("ospf");
  await page.getByRole("group", { name: "Nivel de lectura" }).getByRole("button", { name: "Principiante", exact: true }).click();
  await expect(page).toHaveURL(/nivel=beginner/);
  const card = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: ospf, exact: true }) });
  await expect(card).toContainText("Antes se recomienda: Enrutamiento estático");
  await expect(card).toContainText(/\d+ lecturas?/);
  await expect(page.getByRole("status").filter({ hasText: "material" })).toContainText(/^\d+ temas? · \d+ materia/);
  await card.getByRole("link", { name: ospf, exact: true }).click();
  // Tema: prerrequisitos como enlaces, unidades agrupadas por nivel y Catálogo activo en la navegación.
  await expect(page.getByRole("heading", { name: ospf, level: 1 })).toBeFocused();
  await expect(page.getByRole("complementary", { name: "Antes se recomienda" }).getByRole("link", { name: /^Enrutamiento estático/ })).toHaveAttribute("href", /\/temas\//);
  await expect(mainNav(page, "Catálogo")).toHaveAttribute("aria-current", "location");
  const beginner = page.getByRole("region", { name: /^Principiante/ });
  await beginner.getByRole("link").first().click();
  await expect(page.getByText("Material de lectura. No incluye prácticas ni evaluaciones y no acredita dominio.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Migas de pan" }).getByRole("link", { name: ospf, exact: true })).toBeVisible();
  await expect(mainNav(page, "Catálogo")).toHaveAttribute("aria-current", "location");
  await expect(page.getByText(/^Fuente:/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Iniciar .*beta/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Consultar esta lectura con el tutor" }).click();
  await expect(page.getByText("Consulta sobre una lectura", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Nueva conversación" }).click();
  await page.getByLabel("Tu mensaje", { exact: true }).fill("Explica la idea de esta lectura.");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText("Respuesta de simulación: considera la idea principal.", { exact: true })).toBeVisible();
  await page.goBack(); await expect(page.getByText("Material de lectura. No incluye prácticas ni evaluaciones y no acredita dominio.")).toBeVisible();
  await page.getByRole("link", { name: "Volver al tema" }).click();
  await expect(page.getByRole("heading", { name: ospf, level: 1 })).toBeVisible();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  }
  await page.getByRole("navigation", { name: "Migas de pan" }).getByRole("link", { name: "Catálogo", exact: true }).click();
  await expect(page.getByLabel("Buscar temas o lecturas")).toHaveValue("ospf");
  await expect(page.getByRole("group", { name: "Nivel de lectura" }).getByRole("button", { name: "Principiante", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(mainNav(page, "Catálogo")).toHaveAttribute("aria-current", "page");
  // Estado vacío con siguiente paso.
  await page.getByLabel("Buscar temas o lecturas").fill("zzz-sin-resultados");
  await expect(page.getByRole("heading", { name: "No encontramos temas con estos filtros" })).toBeVisible();
  await page.getByRole("button", { name: "Quitar filtros", exact: true }).click();
  await expect(page).toHaveURL(/\/catalogo$/);
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  }
});

test("navegación por teclado: rutas, foco, recarga y Atrás conservan la vista", async ({ page }) => {
  await googleForTests(page, "student-a"); await page.goto("/"); await login(page);
  await page.goto("/apuntes");
  await expect(page.getByRole("heading", { name: "Tus apuntes", level: 1 })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#learning-content")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  for (let step = 0; step < 12 && !(await mainNav(page, "Catálogo").evaluate((node) => node === document.activeElement)); step++) await page.keyboard.press("Shift+Tab");
  await expect(mainNav(page, "Catálogo")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/catalogo$/);
  await expect(page.getByRole("heading", { name: "Explora el catálogo", level: 1 })).toBeFocused();
  const redes = page.getByRole("group", { name: "Materia" }).getByRole("button", { name: "Redes", exact: true });
  await redes.focus(); await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/materia=/);
  await page.getByRole("main").getByRole("list").first().getByRole("link").first().focus(); await page.keyboard.press("Enter");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeFocused();
  const topic = await heading.textContent() ?? "";
  await page.getByRole("main").getByRole("region").first().getByRole("link").first().focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("navigation", { name: "Migas de pan" }).getByRole("link", { name: topic, exact: true })).toBeVisible();
  await expect(heading).toBeFocused();
  const title = await heading.textContent() ?? "";
  await page.reload(); await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await page.goBack(); await expect(page.getByRole("heading", { name: topic, level: 1 })).toBeVisible();
  await page.goBack(); await expect(redes).toHaveAttribute("aria-pressed", "true");
  await page.goForward(); await expect(page.getByRole("heading", { name: topic, level: 1 })).toBeVisible();
  await page.goto("/no-existe"); await expect(page.getByRole("heading", { name: "Esta página no existe", level: 1 })).toBeVisible();
  await page.goto("/autoria"); await expect(page).toHaveURL(/\/$/);
  await page.setViewportSize({ width: 320, height: 640 });
  const repasos = mainNav(page, "Repasos");
  const box = await repasos.boundingBox();
  expect(box && box.y + box.height).toBeLessThanOrEqual(640);
  await repasos.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Repasos y evidencias", level: 1 })).toBeFocused();
  await expect(repasos).toHaveAttribute("aria-current", "page");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
});

async function apiPost(page: Page, url: string, data: unknown) {
  const csrf = await page.request.get("/api/auth/csrf");
  const { requestToken } = await csrf.json() as { requestToken: string };
  const response = await page.request.post(url, { data, headers: { "X-CSRF-TOKEN": requestToken } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return await response.json() as Record<string, unknown>;
}

async function advanceClock(page: Page, now: string) {
  expect((await page.request.post(`http://127.0.0.1:5089/clock?now=${encodeURIComponent(now)}`)).ok()).toBeTruthy();
}

test("tutor: caída tras reserva, recarga y recuperación sin duplicados", async ({ page }) => {
  await googleForTests(page, "student-a"); await page.goto("/"); await login(page);
  await openUnit(page, "Vectores Beta", "Unidad Beta de vectores");
  await page.getByRole("link", { name: "Abrir conversación", exact: true }).click();
  const creation = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/api/tutor/conversations"));
  await page.getByRole("button", { name: "Nueva conversación", exact: true }).click();
  const { id } = await (await creation).json() as { id: string };
  await page.getByLabel("Tu mensaje", { exact: true }).fill("__PROCESS_LOSS__ Recuperar mi conversación");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  // La conversación vive en la URL: recargar la reabre sin volver a elegirla.
  await expect(page).toHaveURL(new RegExp(`/tutor/${id}$`));
  await page.reload();
  await expect(page.getByLabel("Retomar una conversación")).toHaveValue(id);
  // Recorrer el select con flechas sólo elige; abrir otra conversación requiere confirmarlo.
  await page.getByLabel("Retomar una conversación").focus();
  await page.keyboard.press("ArrowUp"); await page.keyboard.press("Escape");
  await expect(page).toHaveURL(new RegExp(`/tutor/${id}$`));
  await expect(page.getByLabel("Retomar una conversación")).toBeFocused();
  await expect(page.getByRole("button", { name: "Recuperar mensaje pendiente" })).toBeVisible();
  const pending = await (await page.request.get(`/api/tutor/conversations/${id}/pending-turn`)).json() as { request: unknown; leaseUntil: string };
  await advanceClock(page, new Date(new Date(pending.leaseUntil).getTime() + 1000).toISOString());
  const recovery = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith(`/conversations/${id}/turns`));
  await page.getByRole("button", { name: "Recuperar mensaje pendiente" }).click();
  expect((await recovery).postDataJSON()).toEqual(pending.request);
  await expect(page.getByText("Respuesta de simulación: considera la idea principal.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recuperar mensaje pendiente" })).toHaveCount(0);
  const history = await (await page.request.get(`/api/tutor/conversations/${id}/messages`)).json() as { total: number };
  expect(history.total).toBe(2);
});

for (const open of [false, true]) test(`repaso histórico R1 después de publicar R2 (${open ? "rúbrica" : "cerrada"})`, async ({ page }) => {
  await googleForTests(page, "author"); await page.goto("/"); await login(page);
  await advanceClock(page, new Date().toISOString());
  const tag = open ? "rúbrica" : "cerrada";
  const entry = { name: `Histórico ${tag}`, slug: `historical-${crypto.randomUUID()}` };
  const subject = await apiPost(page, "/api/catalog/subjects", entry);
  const category = await apiPost(page, "/api/catalog/categories", { subjectId: subject.id, entry });
  const topic = await apiPost(page, "/api/catalog/topics", { subjectId: subject.id, categoryId: category.id, entry });
  const concept = crypto.randomUUID(), objective = crypto.randomUUID(), correct = crypto.randomUUID(), criterion = crypto.randomUUID();
  const document = { title: `Unidad histórica ${tag}`, concepts: [{ id: concept, name: "Idea histórica" }], objectives: [{ id: objective, description: "Aplicar R1", conceptIds: [concept] }],
    readings: [{ id: crypto.randomUUID(), title: "Lectura R1", text: "Contenido R1", source: "Sintético", objectiveIds: [objective] }],
    exercises: [{ id: crypto.randomUUID(), prompt: "Aplicar", objectiveIds: [objective] }], assessments: [{ id: crypto.randomUUID(), prompt: "Evaluar", privateCriteria: "PRIVATE-R1", objectiveIds: [objective] }], prerequisites: [] };
  const unit = await apiPost(page, "/api/units", { topicId: topic.id, document }) as { id: string; version: number; revision: { id: string } };
  await apiPost(page, `/api/units/${unit.id}/revisions/${unit.revision.id}/publish`, { version: 1 });
  const question = await apiPost(page, "/api/assessments/questions", { id: crypto.randomUUID(), number: 1, document: {
    unitId: unit.id, unitRevisionId: unit.revision.id, objectiveIds: [objective], conceptIds: [concept],
    type: open ? "openResponse" : "singleChoice", prompt: `Pregunta R1 ${tag}`,
    options: open ? [] : [{ id: correct, text: "Respuesta R1" }, { id: crypto.randomUUID(), text: "Otra" }], correctOptionIds: open ? [] : [correct],
    scoringPolicy: open ? "rubric" : "exactMatch", rubric: open ? { version: 1, criteria: [{ id: criterion, description: "Justificar R1", maxPoints: 1 }], privateGuidance: "PRIVATE-R1" } : null } });
  const definition = await apiPost(page, "/api/assessments/definitions", { id: crypto.randomUUID(), number: 1, document: {
    title: `Evaluación R1 ${tag}`, unitId: unit.id, unitRevisionId: unit.revision.id, objectiveIds: [objective], questionRevisionIds: [question.id], mode: "assessment", timeLimitMinutes: 10, maxAttempts: 2, feedback: "afterSubmission", assistance: "none" } });
  // Obtain evidence in the real assessment/evidence pipeline before scheduling.
  await switchUser(page, "student-a");
  const initial = await apiPost(page, "/api/assessments/attempts", { definitionRevisionId: definition.id, requestId: crypto.randomUUID() });
  await apiPost(page, `/api/assessments/attempts/${String(initial.id)}/submit`, { answers: [{ questionRevisionId: question.id, selectedOptionIds: open ? [] : [correct], ...(open ? { text: "Justificación inicial" } : {}) }] });
  if (open) {
    await switchUser(page, "author");
    await apiPost(page, `/api/assessments/attempts/${String(initial.id)}/review`, { requestId: crypto.randomUUID(), grades: [{ questionRevisionId: question.id, criteria: [{ criterionId: criterion, points: 1 }], feedback: "Correcto" }] });
    await switchUser(page, "student-a");
  }
  await expect.poll(async () => {
    const evidence = await (await page.request.get("/api/learning/evidence?limit=100")).json() as { items: { attemptId: string }[] };
    return evidence.items.some((item) => item.attemptId === initial.id);
  }, { timeout: 15000 }).toBeTruthy();
  await mainNav(page, "Repasos").click();
  const evidence = await (await page.request.get("/api/learning/evidence?limit=100")).json() as { items: { id: string; attemptId: string }[] };
  const sourceEvidence = evidence.items.find((item) => item.attemptId === initial.id);
  expect(sourceEvidence).toBeDefined();
  await page.getByLabel("Evidencia para repasar").selectOption(sourceEvidence?.id ?? "");
  await page.getByLabel("Evaluación para el repaso").selectOption(String(definition.id));
  const due = new Date(Date.now() + 120000);
  const local = new Date(due.getTime() - due.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await page.getByLabel("Fecha y hora del repaso").fill(local);
  await page.getByRole("button", { name: "Programar repaso", exact: true }).click();
  await expect(page.getByText("Repaso programado.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar intento del repaso" })).toBeDisabled();
  await switchUser(page, "author");
  const r2 = await apiPost(page, `/api/units/${unit.id}/revisions`, { version: 2, document: { ...document, title: "Publicación R2" } }) as { revision: { id: string }; version: number };
  await apiPost(page, `/api/units/${unit.id}/revisions/${r2.revision.id}/publish`, { version: r2.version });
  // Advance both test clocks; the production API still owns all date checks.
  const afterDue = new Date(due.getTime() + 120000).toISOString();
  await advanceClock(page, afterDue);
  await page.clock.setFixedTime(new Date(afterDue));
  await switchUser(page, "student-a");
  const active = await (await page.request.get(`/api/units/${unit.id}`)).json() as { revision: { id: string } };
  expect(active.revision.id).toBe(r2.revision.id);
  await mainNav(page, "Repasos").click();
  const started = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/api/assessments/attempts"));
  await page.getByRole("button", { name: "Iniciar intento del repaso" }).click();
  const attempt = await (await started).json() as { id: string; definitionRevisionId: string };
  expect(attempt.definitionRevisionId).toBe(definition.id);
  await expect(page.getByRole("heading", { name: `Evaluación R1 ${tag}`, exact: true })).toBeVisible();
  if (open) await page.getByLabel("Tu respuesta", { exact: true }).fill("Justifico con el contenido histórico R1.");
  else await page.getByRole("radio", { name: "Respuesta R1", exact: true }).check();
  await page.getByRole("button", { name: "Entregar respuestas", exact: true }).click();
  if (open) {
    await expect(page.getByText("Pendiente de corrección docente", { exact: true })).toBeVisible();
    await switchUser(page, "author");
    await mainNav(page, "Autoría").click();
    await page.getByRole("link", { name: "Corregir entregas", exact: true }).click();
    await page.getByRole("listitem").filter({ hasText: `Evaluación R1 ${tag}` }).filter({ hasText: "Pendiente de corrección" }).getByRole("button", { name: "Consultar entrega" }).click();
    await page.getByLabel("Justificar R1 · máximo 1").fill("1");
    await page.getByLabel("Feedback al alumno").fill("Corregido con la rúbrica de R1.");
    await page.getByRole("button", { name: "Confirmar corrección final" }).click();
    await expect(page.getByText(/Corrección final registrada/)).toBeVisible();
    await switchUser(page, "student-a");
    await mainNav(page, "Repasos").click();
    await page.getByText("Mis intentos anteriores", { exact: true }).click();
    await page.getByRole("listitem").filter({ hasText: `Evaluación R1 ${tag}` }).first().getByRole("button", { name: "Consultar", exact: true }).click();
  } else await expect(page.getByText("Resultado: 100 %", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Completar con el intento seleccionado" }).click();
  await expect(page.getByText("Completado con un intento corregido", { exact: true }).last()).toBeVisible();
});

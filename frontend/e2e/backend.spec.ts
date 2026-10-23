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

/** Revisa contenido real y vacío con los cuatro tamaños de aceptación. */
async function auditPersonalPage(page: Page, label: string) {
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), label).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations, `${label} a ${String(width)}px`).toEqual([]);
    if (width === 320 || width === 1440) await page.screenshot({ path: `/tmp/aiteacher-pr6-${label.replaceAll(" ", "-")}-${String(width)}.png`, fullPage: true });
  }
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
  await page.getByLabel("Categoría", { exact: true }).selectOption({ label: "Fundamentos Beta" });
  await page.getByLabel("Descripción", { exact: true }).fill("Borrador de la descripción."); await page.getByRole("button", { name: "Guardar entrada" }).click();
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("");
  // Editar la descripción usa la versión leída; el contador acompaña al campo.
  const topicDescription = "Vectores para comparar características y medir similitud entre ejemplos.";
  await page.getByRole("button", { name: "Vectores Beta · disponible", exact: true }).click();
  await expect(page.getByLabel("Descripción", { exact: true })).toHaveValue("Borrador de la descripción.");
  await page.getByLabel("Descripción", { exact: true }).fill(topicDescription);
  await expect(page.getByLabel("Descripción", { exact: true })).toHaveAccessibleDescription(new RegExp(`^${String(topicDescription.length)} de 600 caracteres`));
  await page.getByRole("button", { name: "Guardar entrada" }).click(); await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("");
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
  await mainNav(page, "Inicio").click();
  await expect(page.getByRole("heading", { name: "Tu primer recorrido" })).toBeVisible();
  await page.getByRole("link", { name: "Explorar el catálogo", exact: true }).focus();
  await page.keyboard.press("Enter"); await expect(page).toHaveURL(/\/catalogo$/);
  await openCatalog(page); await page.getByLabel("Buscar temas o lecturas").fill("Vectores Beta");
  await expect(page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Vectores Beta", exact: true }) })).toContainText(topicDescription);
  await page.getByRole("link", { name: "Vectores Beta", exact: true }).click();
  await expect(page.getByText(topicDescription, { exact: true })).toBeVisible();
  await expect(page.getByText(/^Material publicado: 1 unidad\./)).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await openUnit(page, "Vectores Beta", "Unidad Beta de vectores"); await expect(page.getByRole("heading", { name: "Lectura de vectores", exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("PRIVATE-EDITORIAL-BROWSER"); await expect(page.locator("body")).not.toContainText("PRIVATE-RUBRIC-BROWSER");
  await page.getByRole("tab", { name: "Evaluar", exact: true }).click(); await expect(page).toHaveURL(/pestana=evaluar/);
  const studentUnitUrl = page.url();
  const studentUnitId = new URL(studentUnitUrl).pathname.split("/").at(-1) ?? "";
  // En Evaluar no hay lectura ni ejercicio a la vista: el botón abre la conversación libre.
  await expect(page.getByRole("tab", { name: "Evaluar", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("link", { name: "Preguntar al tutor sobre esta unidad", exact: true }).click(); await expect(page).toHaveURL(/\/tutor$/);
  await page.getByRole("button", { name: "Nueva conversación", exact: true }).click();
  await page.getByLabel("Tu mensaje", { exact: true }).fill("Quiero explorar Concepto Beta."); await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText("Respuesta de simulación: considera la idea principal.", { exact: true })).toBeVisible();
  const studentConversationUrl = page.url();
  const studentConversationId = new URL(studentConversationUrl).pathname.split("/").at(-1) ?? "";
  await page.getByRole("button", { name: "Guardar en apuntes", exact: true }).last().click(); await expect(page.getByText("Apunte guardado.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardado en apuntes", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Mapa de conceptos", exact: true }).click();
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
  const personalNote = page.getByRole("article").filter({ has: page.getByText("Mi idea privada de la beta", { exact: true }) });
  await personalNote.getByRole("button", { name: "Editar", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/editar=/); await page.reload();
  await expect(page.getByLabel("Editar apunte")).toHaveValue("Mi idea privada de la beta");
  await page.getByRole("button", { name: "Cancelar", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByLabel("Editar apunte")).toHaveCount(0);
  await auditPersonalPage(page, "Apuntes con contenido");
  await page.getByRole("link", { name: "Volver a la conversación de origen" }).click();
  await expect(page).toHaveURL(studentConversationUrl);
  await page.goBack(); await expect(page.getByText("Mi idea privada de la beta", { exact: true })).toBeVisible();
  await mainNav(page, "Inicio").click();
  await expect(page.getByRole("link", { name: "Continuar con el tutor" })).toHaveAttribute("href", new URL(studentConversationUrl).pathname);
  await page.getByRole("link", { name: "Continuar con el tutor" }).focus(); await page.keyboard.press("Enter");
  await expect(page).toHaveURL(studentConversationUrl);
  await page.goto(studentUnitUrl);
  await page.getByRole("button", { name: "Iniciar Evaluación cerrada beta", exact: true }).click();
  await expect(page).toHaveURL(/\/evaluaciones\/[^/]+$/); await expect(page.getByRole("heading", { name: "Evaluación cerrada beta", level: 1 })).toBeFocused();
  const studentAttemptId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
  await page.getByRole("radio", { name: "Características", exact: true }).check(); await submitAttempt(page);
  await expect(page.getByText("Resultado: 100 %", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByText("Resultado: 100 %", { exact: true })).toBeVisible();
  await page.goBack(); await expect(page.getByRole("heading", { name: "Unidad Beta de vectores", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Iniciar Evaluación abierta beta", exact: true }).click(); await page.getByLabel("Tu respuesta", { exact: true }).fill("Comparo características para justificar similitud.");
  await submitAttempt(page); await expect(page.getByText("Pendiente de corrección docente", { exact: true })).toBeVisible();
  await page.goBack();
  await mainNav(page, "Inicio").click(); await expect(page.getByRole("link", { name: /^Continuar (en la unidad|con el tutor)$/ })).toBeVisible();
  await auditPersonalPage(page, "Inicio con actividad");
  await mainNav(page, "Historial").click(); await page.getByRole("button", { name: "Historia de vectores · 1 mensajes", exact: true }).click();
  await expect(page.getByText("Mi explicación histórica", { exact: true })).toBeVisible(); await expect(page.locator("body")).not.toContainText("PRIVATE-HISTORICAL-KEY");
  const archiveUrl = page.url();
  await page.reload(); await expect(page.getByText("Mi explicación histórica", { exact: true })).toBeVisible();
  await auditPersonalPage(page, "Historial con contenido");
  await mainNav(page, "Inicio").click(); await expect(page).toHaveURL(/\/$/); await expect(page.getByRole("heading", { name: /^Hola,/ })).toBeVisible();
  await page.goBack(); await expect(page).toHaveURL(archiveUrl);
  await expect(page.getByText("Mi explicación histórica", { exact: true })).toBeVisible();
  await switchUser(page, "author"); await mainNav(page, "Autoría").click(); await page.getByRole("link", { name: "Corregir entregas", exact: true }).click();
  await page.getByRole("listitem").filter({ hasText: "Evaluación abierta beta" }).getByRole("button", { name: "Consultar entrega" }).click();
  await page.getByLabel("Justificación coherente · máximo 1").fill("1"); await page.getByLabel("Feedback al alumno").fill("La comparación está justificada.");
  await page.getByRole("button", { name: "Confirmar corrección final" }).click(); await expect(page.getByText(/Corrección final registrada/)).toBeVisible();
  await switchUser(page, "student-b"); await mainNav(page, "Apuntes").click(); await expect(page.getByText("Todavía no hay apuntes.", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Mi idea privada de la beta");
  await mainNav(page, "Historial").click(); await expect(page.getByText("No hay conversaciones históricas importadas para tu cuenta.", { exact: true })).toBeVisible();
  await auditPersonalPage(page, "Historial vacío");
  await expect(page.getByRole("heading", { name: "Aún no tienes conversaciones del tutor" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aún no tienes evaluaciones" })).toBeVisible();
  await mainNav(page, "Apuntes").click(); await auditPersonalPage(page, "Apuntes vacíos");
  await mainNav(page, "Repasos").click(); await expect(page.getByRole("heading", { name: "Todavía no tienes evidencias" })).toBeVisible();
  await auditPersonalPage(page, "Repasos vacíos");
  await mainNav(page, "Inicio").click(); await expect(page.getByRole("heading", { name: "Tu primer recorrido" })).toBeVisible();
  await auditPersonalPage(page, "Inicio vacío");
  expect((await page.request.get(`/api/tutor/conversations/${studentConversationId}`)).status()).toBe(404);
  expect((await page.request.get(`/api/assessments/attempts/${studentAttemptId}`)).status()).toBe(404);
  const otherConversation = await apiPost(page, "/api/tutor/conversations", { unitId: studentUnitId, mode: "chat" });
  await apiPost(page, "/api/tutor/notes", { kind: "student", text: "Idea exclusiva del segundo alumno" });
  const ownDefinitions = await (await page.request.get("/api/assessments/definitions?limit=100")).json() as { items: { id: string; unitId: string; title: string }[] };
  const otherDefinition = ownDefinitions.items.find((item) => item.unitId === studentUnitId && item.title === "Evaluación cerrada beta");
  expect(otherDefinition).toBeDefined();
  const otherAttempt = await apiPost(page, "/api/assessments/attempts", { definitionRevisionId: otherDefinition?.id, requestId: crypto.randomUUID() });
  await mainNav(page, "Inicio").click(); await page.reload();
  await page.getByRole("link", { name: "Retomar Evaluación cerrada beta", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/evaluaciones/${String(otherAttempt.id)}$`));
  await page.getByRole("radio", { name: "Características", exact: true }).check(); await submitAttempt(page);
  await expect(page.getByText("Resultado: 100 %", { exact: true })).toBeVisible();
  await mainNav(page, "Apuntes").click(); await expect(page.getByText("Idea exclusiva del segundo alumno", { exact: true })).toBeVisible();
  await expect(page.getByText("Mi idea privada de la beta", { exact: true })).toHaveCount(0);
  await mainNav(page, "Historial").click();
  await expect(page.getByRole("link", { name: "Abrir conversación del tutor" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Abrir conversación del tutor" })).toHaveAttribute("href", `/unidades/${studentUnitId}/tutor/${String(otherConversation.id)}`);
  await switchUser(page, "student-a");
  expect((await page.request.get(`/api/tutor/conversations/${String(otherConversation.id)}`)).status()).toBe(404);
  expect((await page.request.get(`/api/assessments/attempts/${String(otherAttempt.id)}`)).status()).toBe(404);
  await mainNav(page, "Apuntes").click();
  await expect(page.getByText("Mi idea privada de la beta", { exact: true })).toBeVisible();
  await expect(page.getByText("Idea exclusiva del segundo alumno", { exact: true })).toHaveCount(0);
  // Retirar el material bloquea la unidad, pero conserva el origen histórico del apunte.
  await switchUser(page, "author");
  const unitToWithdraw = await (await page.request.get(`/api/units/${studentUnitId}`)).json() as { version: number; publishedRevisionId: string };
  const withdrawn = await apiPost(page, `/api/units/${studentUnitId}/unpublish`, { version: unitToWithdraw.version });
  await switchUser(page, "student-a");
  expect((await page.request.get(`/api/units/${studentUnitId}`)).status()).toBe(404);
  await mainNav(page, "Apuntes").click();
  const sourceLink = page.getByRole("link", { name: "Consultar mensaje de origen", exact: true });
  const sourcePage = page.waitForEvent("popup");
  await sourceLink.focus(); await page.keyboard.press("Enter");
  const source = await sourcePage;
  await expect(source.getByRole("heading", { name: "Mensaje de origen", exact: true })).toBeVisible();
  await expect(source.locator("main")).toContainText("Respuesta de simulación: considera la idea principal.");
  await source.close();
  // La misma unidad se reutiliza en los escenarios seriales posteriores.
  await switchUser(page, "author");
  await apiPost(page, `/api/units/${studentUnitId}/revisions/${unitToWithdraw.publishedRevisionId}/publish`, { version: withdrawn.version });
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
  // Sin descripción editorial, el resumen del material la sustituye.
  await expect(page.getByText(/^Material publicado: \d+ lecturas? en \d+ nivel/)).toBeVisible();
  const beginner = page.getByRole("region", { name: /^Principiante/ });
  await beginner.getByRole("link").first().click();
  await expect(page.getByText("Material de lectura. No incluye prácticas ni evaluaciones y no acredita dominio.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Migas de pan" }).getByRole("link", { name: ospf, exact: true })).toBeVisible();
  await expect(mainNav(page, "Catálogo")).toHaveAttribute("aria-current", "location");
  await expect(page.getByText(/^Fuente:/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Iniciar .*beta/ })).toHaveCount(0);
  // Una lectura no tiene pestañas vacías; el botón del tutor lleva su contexto.
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByText("Lectura", { exact: true })).toBeVisible(); await expect(page.getByText("Nivel: Principiante", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /^Preguntar al tutor sobre «/ }).click();
  await expect(page).toHaveURL(/\/tutor\?modo=reading&actividad=/);
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

/** Entrega desde el intento abierto pasando por la confirmación. */
async function submitAttempt(page: Page) {
  await page.getByRole("button", { name: "Entregar respuestas", exact: true }).click();
  await page.getByRole("dialog", { name: "¿Entregar la evaluación?" }).getByRole("button", { name: "Sí, entregar", exact: true }).click();
}

async function advanceClock(page: Page, now: string) {
  expect((await page.request.post(`http://127.0.0.1:5089/clock?now=${encodeURIComponent(now)}`)).ok()).toBeTruthy();
}

test("unidad con pestañas: teclado, recarga, Atrás, índice y contexto del tutor", async ({ page }) => {
  await googleForTests(page, "author"); await page.goto("/"); await login(page);
  const entry = { name: "Pestañas Beta", slug: `tabs-${crypto.randomUUID()}` };
  const subject = await apiPost(page, "/api/catalog/subjects", entry);
  const category = await apiPost(page, "/api/catalog/categories", { subjectId: subject.id, entry });
  const topic = await apiPost(page, "/api/catalog/topics", { subjectId: subject.id, categoryId: category.id, entry });
  const concept = crypto.randomUUID(), objective = crypto.randomUUID();
  // Las dos últimas son cortas: elegir la penúltima debe conservar su contexto al pulsar el tutor.
  const readings = ([["Primera lectura larga", 24], ["Segunda lectura corta", 2], ["Tercera lectura corta", 2]] as const).map(([title, paragraphs]) => ({ id: crypto.randomUUID(), title,
    text: Array.from({ length: paragraphs }, (_, index) => `Párrafo ${String(index + 1)} de ${title}.`).join("\n\n"), source: "Sintético", objectiveIds: [objective] }));
  const exercises = ["Compara dos ejemplos.", "Explica tu criterio."].map((prompt) => ({ id: crypto.randomUUID(), prompt, objectiveIds: [objective] }));
  const unit = await apiPost(page, "/api/units", { topicId: topic.id, document: { title: "Unidad con pestañas", concepts: [{ id: concept, name: "Idea" }],
    objectives: [{ id: objective, description: "Comparar ejemplos", conceptIds: [concept] }], readings, exercises,
    assessments: [{ id: crypto.randomUUID(), prompt: "Evaluar", privateCriteria: "PRIVATE-TABS", objectiveIds: [objective] }], prerequisites: [] } }) as { id: string; revision: { id: string } };
  await apiPost(page, `/api/units/${unit.id}/revisions/${unit.revision.id}/publish`, { version: 1 });
  // Evaluación de tres pasos (cerrada, múltiple y con rúbrica) para el intento por pasos del final.
  const options = (...texts: string[]) => texts.map((text) => ({ id: crypto.randomUUID(), text }));
  const single = options("Comparar rasgos", "Memorizar"), multiple = options("Color", "Tamaño", "Precio"), criterion = crypto.randomUUID();
  const base = { unitId: unit.id, unitRevisionId: unit.revision.id, objectiveIds: [objective], conceptIds: [concept] };
  const stepQuestions = await Promise.all([
    { ...base, type: "singleChoice", prompt: "¿Qué haces al comparar?", options: single, correctOptionIds: [single[0]?.id], scoringPolicy: "exactMatch", rubric: null },
    { ...base, type: "multipleChoice", prompt: "¿Qué rasgos son visibles?", options: multiple, correctOptionIds: [multiple[0]?.id, multiple[1]?.id], scoringPolicy: "partialCredit", rubric: null },
    { ...base, type: "openResponse", prompt: "Justifica tu criterio.", options: [], correctOptionIds: [], scoringPolicy: "rubric",
      rubric: { version: 1, criteria: [{ id: criterion, description: "Justificación", maxPoints: 1 }], privateGuidance: "PRIVATE-STEPS" } },
  ].map((document) => apiPost(page, "/api/assessments/questions", { id: crypto.randomUUID(), number: 1, document })));
  await apiPost(page, "/api/assessments/definitions", { id: crypto.randomUUID(), number: 1, document: { title: "Evaluación por pasos", unitId: unit.id, unitRevisionId: unit.revision.id,
    objectiveIds: [objective], questionRevisionIds: stepQuestions.map((question) => question.id), mode: "assessment", timeLimitMinutes: 30, maxAttempts: 2, feedback: "afterSubmission", assistance: "none" } });
  // Se recorre con la sesión del autor: la unidad publicada se estudia igual y la suite no supera el límite de 20 logins por minuto del host.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/unidades/${unit.id}`);
  await expect(page.getByRole("heading", { name: "Unidad con pestañas", level: 1 })).toBeVisible();
  await expect(page.getByText("Tema:", { exact: false }).getByRole("link", { name: "Pestañas Beta", exact: true })).toHaveAttribute("href", /\/temas\//);
  await expect(page.getByText("Unidad", { exact: true })).toBeVisible();
  // Tabulación itinerante: Tab entra a la pestaña activa y las flechas la cambian; la URL la conserva.
  const tab = (name: string) => page.getByRole("tab", { name, exact: true });
  await tab("Aprender").focus(); await page.keyboard.press("ArrowRight");
  await expect(tab("Practicar")).toBeFocused(); await expect(tab("Practicar")).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/pestana=practicar/);
  await page.keyboard.press("End"); await expect(tab("Evaluar")).toHaveAttribute("aria-selected", "true");
  await page.reload(); await expect(tab("Evaluar")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Prácticas y evaluaciones" })).toBeVisible();
  await tab("Evaluar").focus(); await page.keyboard.press("Home");
  await expect(tab("Aprender")).toHaveAttribute("aria-selected", "true"); await expect(page).not.toHaveURL(/pestana=/);
  // Índice lateral en escritorio; el botón del tutor sigue a la lectura visible.
  const index = page.getByRole("navigation", { name: "Lecturas de la unidad" });
  await expect(index.getByRole("link", { name: "Primera lectura larga", exact: true })).toHaveAttribute("aria-current", "true");
  const ask = page.getByRole("link", { name: /^Preguntar al tutor/ });
  await expect(ask).toHaveAccessibleName("Preguntar al tutor sobre «Primera lectura larga»");
  await index.getByRole("link", { name: "Segunda lectura corta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Segunda lectura corta", level: 2 })).toBeFocused();
  await expect(ask).toHaveAccessibleName("Preguntar al tutor sobre «Segunda lectura corta»");
  await expect(ask).toHaveAttribute("href", new RegExp(`modo=reading&actividad=${readings[1]?.id ?? ""}$`));
  await expect(index.getByRole("link", { name: "Segunda lectura corta", exact: true })).toHaveAttribute("aria-current", "true");
  await expect(index.getByRole("link", { name: "Primera lectura larga", exact: true })).not.toHaveAttribute("aria-current", "true");
  // pointerdown en el propio enlace no debe sustituir la segunda lectura por la tercera observada.
  await ask.click();
  await expect(page).toHaveURL(new RegExp(`/tutor\\?modo=reading&actividad=${readings[1]?.id ?? ""}$`));
  await page.goBack();
  await index.getByRole("link", { name: "Tercera lectura corta", exact: true }).click();
  // Al desplazarse el alumno se suelta la elección del índice; al final de la página manda la última lectura visible.
  await expect.poll(() => page.evaluate(() => Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 1)).toBe(true);
  await page.mouse.wheel(0, 400);
  await expect(ask).toHaveAttribute("href", new RegExp(`modo=reading&actividad=${readings[2]?.id ?? ""}$`));
  await expect(index.getByRole("link", { name: "Tercera lectura corta", exact: true })).toHaveAttribute("aria-current", "true");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  // Practicar: el contexto pasa al ejercicio visible y Atrás devuelve a la misma pestaña.
  await page.evaluate(() => window.scrollTo(0, 0));
  await tab("Practicar").click();
  await expect(ask).toHaveAccessibleName("Preguntar al tutor sobre «Ejercicio 1»");
  await ask.click();
  await expect(page).toHaveURL(new RegExp(`/tutor\\?modo=practice&actividad=${exercises[0]?.id ?? ""}$`));
  await expect(page.getByText("Práctica guiada", { exact: true })).toBeVisible();
  // La miga de la unidad vuelve a Practicar, de donde salió la práctica guiada.
  await expect(page.getByRole("link", { name: "Unidad con pestañas", exact: true })).toHaveAttribute("href", /\?pestana=practicar$/);
  await page.goBack(); await expect(tab("Practicar")).toHaveAttribute("aria-selected", "true");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await tab("Aprender").click();
  for (const width of [320, 768, 800, 900, 1024, 1152, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(() => ({
      pixels: document.documentElement.scrollWidth - innerWidth,
      elements: Array.from(document.querySelectorAll("body *")).filter((element) => element.getBoundingClientRect().right > innerWidth)
        .map((element) => `${element.tagName}.${element.getAttribute("class") ?? ""}`).slice(0, 10),
    }));
    expect(overflow.pixels, `ancho ${String(width)}: ${overflow.elements.join(", ")}`).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    const button = await ask.boundingBox();
    expect(button && button.x + button.width).toBeLessThanOrEqual(width);
    if (width <= 768) {
      // En móvil el índice es plegable y el botón queda por encima de la barra inferior.
      await expect(index.getByText("Lecturas (3)", { exact: true })).toBeVisible();
      const bar = await mainNav(page, "Catálogo").boundingBox();
      expect(button && bar && button.y + button.height).toBeLessThanOrEqual(bar?.y ?? 0);
      // Al final de la página el botón no tapa el último contenido.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const last = await page.getByText("Fuente: Sintético").last().boundingBox();
      const after = await ask.boundingBox();
      expect(last && after && last.y + last.height).toBeLessThanOrEqual(after?.y ?? 0);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  }
  // Si falla la disponibilidad del tutor, un aviso con reintento ocupa el sitio del botón.
  await page.route("**/api/tutor/availability", (route) => route.fulfill({ status: 503, contentType: "application/problem+json",
    body: JSON.stringify({ title: "Servicio no disponible", status: 503 }) }));
  await page.reload();
  const notice = page.getByRole("alert").filter({ hasText: "No pudimos comprobar el tutor" });
  await expect(notice).toBeVisible({ timeout: 15_000 }); await expect(ask).toHaveCount(0);
  await page.unroute("**/api/tutor/availability");
  await notice.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(ask).toBeVisible(); await expect(notice).toHaveCount(0);
  // Evaluación por pasos con teclado: la URL guarda la pregunta, recargar conserva paso y borrador y Atrás sale del intento.
  await page.setViewportSize({ width: 1440, height: 900 });
  await tab("Evaluar").click();
  await page.getByRole("button", { name: "Iniciar Evaluación por pasos", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Evaluación por pasos", level: 1 })).toBeFocused();
  await expect(page.getByText(/^Tiempo restante \d{1,2}:\d{2}$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pregunta 1 de 3" })).toBeVisible();
  await page.getByRole("radio", { name: "Comparar rasgos", exact: true }).focus(); await page.keyboard.press("Space");
  await expect(page.getByRole("progressbar", { name: "1 de 3 respondidas" })).toBeVisible();
  // Enter dentro del formulario avanza; el foco pasa al título de la nueva pregunta.
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/pregunta=2$/); await expect(page.getByRole("heading", { name: "Pregunta 2 de 3" })).toBeFocused();
  await page.keyboard.press("Tab"); await page.keyboard.press("Space");
  await expect(page.getByRole("checkbox", { name: "Color", exact: true })).toBeChecked();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Pregunta 2 de 3" })).toBeVisible(); await expect(page.getByRole("checkbox", { name: "Color", exact: true })).toBeChecked();
  await page.goBack(); await expect(tab("Evaluar")).toHaveAttribute("aria-selected", "true");
  await page.goForward(); await expect(page.getByRole("heading", { name: "Pregunta 2 de 3" })).toBeVisible();
  await page.getByRole("navigation", { name: "Preguntas" }).getByRole("button", { name: "Pregunta 3, sin responder" }).click();
  await expect(page).toHaveURL(/pregunta=3$/);
  await page.getByLabel("Tu respuesta", { exact: true }).fill("Comparo rasgos visibles.");
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  }
  // Confirmación con teclado: Escape vuelve sin entregar y devuelve el foco.
  const deliver = page.getByRole("button", { name: "Entregar respuestas", exact: true });
  await deliver.focus(); await page.keyboard.press("Enter");
  const confirmation = page.getByRole("dialog", { name: "¿Entregar la evaluación?" });
  await expect(confirmation).toContainText("Respondiste 3 de 3 preguntas.");
  await expect(confirmation).toContainText("Las respuestas abiertas quedarán pendientes de corrección docente.");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape"); await expect(confirmation).toHaveCount(0); await expect(deliver).toBeFocused();
  await page.keyboard.press("Enter"); await confirmation.getByRole("button", { name: "Sí, entregar", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Tu entrega" })).toBeFocused();
  await expect(page.getByText("Pendiente de corrección docente", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Resultado:/)).toHaveCount(0); await expect(page.locator("body")).not.toContainText("PRIVATE-STEPS");
  await page.reload(); await expect(page.getByText("Tu respuesta: Comparo rasgos visibles.", { exact: true })).toBeVisible();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  }
});

test("tutor: caída tras reserva, recarga y recuperación sin duplicados; chat a altura completa", async ({ page }) => {
  await googleForTests(page, "student-a"); await page.goto("/"); await login(page);
  await openUnit(page, "Vectores Beta", "Unidad Beta de vectores");
  await page.getByRole("link", { name: /^Preguntar al tutor/ }).click();
  const creation = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/api/tutor/conversations"));
  await page.getByRole("button", { name: "Nueva conversación", exact: true }).click();
  const { id } = await (await creation).json() as { id: string };
  await page.getByLabel("Tu mensaje", { exact: true }).fill("__PROCESS_LOSS__ Recuperar mi conversación");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  // La conversación vive en la URL: recargar la reabre sin volver a elegirla.
  await expect(page).toHaveURL(new RegExp(`/tutor/${id}(\\?|$)`));
  await page.reload();
  // La lista de la unidad marca la conversación abierta con su título legible.
  await expect(page.getByRole("navigation", { name: "Conversaciones de la unidad" }).locator('[aria-current="true"]')).toContainText("Lectura: Lectura de vectores");
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

  // Chat a altura completa, mensajes anteriores, mapa plegable y responsive, con la misma sesión: el host limita los logins por minuto.
  const unitId = new URL(page.url()).pathname.split("/")[2] ?? "";
  // Doce turnos (24 mensajes) superan la primera ventana de 20: el chat abre en los más recientes.
  const conversation = await apiPost(page, "/api/tutor/conversations", { unitId, mode: "chat" }) as { id: string; version: number };
  let version = conversation.version;
  for (let turn = 1; turn <= 12; turn++)
    ({ version } = await apiPost(page, `/api/tutor/conversations/${conversation.id}/turns`, { requestId: crypto.randomUUID(), version, text: `Pregunta número ${String(turn)}` }) as { version: number });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/unidades/${unitId}/tutor/${conversation.id}`);
  const composer = page.getByLabel("Tu mensaje", { exact: true });
  await expect(page.getByText("Pregunta número 12", { exact: true })).toBeInViewport();
  await expect(composer).toBeInViewport();
  await expect(page.getByText("Pregunta número 1", { exact: true })).toHaveCount(0);
  // Subir hasta el principio carga la ventana anterior sin mover lo que el alumno estaba leyendo.
  const reading = page.getByText("Pregunta número 3", { exact: true });
  await reading.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByText("Pregunta número 1", { exact: true })).toBeAttached();
  await expect(page.getByRole("button", { name: "Cargar mensajes anteriores" })).toHaveCount(0);
  await expect(reading).toBeInViewport();
  await expect(composer).toBeInViewport();
  // El mapa se pliega: abrirlo mueve el foco a su título; Escape lo cierra y devuelve el foco al botón.
  const toggle = page.getByRole("button", { name: "Mapa de conceptos", exact: true });
  await toggle.click(); await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("heading", { name: "Mapa de conceptos", level: 2 })).toBeFocused();
  await expect(page.getByLabel("Referencia curricular", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused(); await expect(toggle).toHaveAttribute("aria-expanded", "false");
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    for (const map of [false, true]) {
      if (map) await toggle.click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow, `ancho ${String(width)}${map ? " con mapa" : ""}`).toBeLessThanOrEqual(0);
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
      if (map) await page.getByRole("button", { name: "Cerrar mapa", exact: true }).click();
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(composer).toBeInViewport();
    if (width <= 768) {
      // En móvil las conversaciones se pliegan y el compositor queda por encima de la barra inferior.
      await expect(page.getByText(/^Conversaciones de la unidad \(\d+\)$/)).toBeVisible();
      const send = await page.getByRole("button", { name: "Enviar", exact: true }).boundingBox();
      const bar = await mainNav(page, "Catálogo").boundingBox();
      expect(send && bar && send.y + send.height).toBeLessThanOrEqual(bar?.y ?? 0);
    }
  }
  // Enviar sigue el final del chat: la respuesta nueva queda a la vista sobre el compositor.
  await page.setViewportSize({ width: 1440, height: 900 });
  await composer.fill("Pregunta número 13"); await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByText("Respuesta de simulación: considera la idea principal.", { exact: true }).last()).toBeInViewport();
  await expect(page.getByText("Pregunta número 13", { exact: true })).toHaveCount(1);
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
  await page.getByRole("button", { name: "Iniciar intento del repaso" }).focus(); await page.keyboard.press("Enter");
  const attempt = await (await started).json() as { id: string; definitionRevisionId: string };
  expect(attempt.definitionRevisionId).toBe(definition.id);
  await expect(page.getByRole("heading", { name: `Evaluación R1 ${tag}`, exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`intento=${attempt.id}`));
  await page.reload(); await expect(page.getByRole("heading", { name: `Evaluación R1 ${tag}`, exact: true })).toBeVisible();
  await auditPersonalPage(page, "Repasos con contenido");
  if (open) await page.getByLabel("Tu respuesta", { exact: true }).fill("Justifico con el contenido histórico R1.");
  else await page.getByRole("radio", { name: "Respuesta R1", exact: true }).check();
  await submitAttempt(page);
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

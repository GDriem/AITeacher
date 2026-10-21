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
  await expect(page.getByRole("heading", { name: "Continúa aprendiendo" })).toBeVisible();
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
  await page.getByRole("button", { name: "Autoría", exact: true }).click();
  await page.getByRole("navigation", { name: "Herramientas de autoría" }).getByRole("button", { name: "Catálogo", exact: true }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Curso Beta"); await page.getByRole("button", { name: "Guardar entrada" }).click();
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("");
  await page.getByLabel("Qué quieres administrar").selectOption("categories");
  await page.getByLabel("Nombre", { exact: true }).fill("Fundamentos Beta"); await page.getByLabel("Materia", { exact: true }).selectOption({ label: "Curso Beta" });
  await page.getByRole("button", { name: "Guardar entrada" }).click(); await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("");
  await page.getByLabel("Qué quieres administrar").selectOption("topics");
  await page.getByLabel("Nombre", { exact: true }).fill("Vectores Beta"); await page.getByLabel("Materia", { exact: true }).selectOption({ label: "Curso Beta" });
  await page.getByLabel("Categoría", { exact: true }).selectOption({ label: "Fundamentos Beta" }); await page.getByRole("button", { name: "Guardar entrada" }).click();
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("");
  await page.getByRole("navigation", { name: "Herramientas de autoría" }).getByRole("button", { name: "Unidades", exact: true }).click();
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

  await switchUser(page, "student-a"); await expect(page.getByRole("button", { name: "Autoría", exact: true })).toHaveCount(0);
  await page.getByLabel("Tema", { exact: true }).selectOption({ label: "Vectores Beta" });
  await page.getByRole("button", { name: "Abrir unidad" }).click(); await expect(page.getByRole("heading", { name: "Lectura de vectores", exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("PRIVATE-EDITORIAL-BROWSER"); await expect(page.locator("body")).not.toContainText("PRIVATE-RUBRIC-BROWSER");
  await page.getByRole("button", { name: "Iniciar Evaluación cerrada beta", exact: true }).click();
  await page.getByRole("radio", { name: "Características", exact: true }).check(); await page.getByRole("button", { name: "Entregar respuestas" }).click();
  await expect(page.getByText("Resultado: 100 %", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Iniciar Evaluación abierta beta", exact: true }).click(); await page.getByLabel("Tu respuesta", { exact: true }).fill("Comparo características para justificar similitud.");
  await page.getByRole("button", { name: "Entregar respuestas" }).click(); await expect(page.getByText("Pendiente de corrección docente", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Abrir conversación", exact: true }).click(); await page.getByRole("button", { name: "Nueva conversación", exact: true }).click();
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
  await page.getByRole("button", { name: "Apuntes", exact: true }).click(); await expect(page.getByRole("heading", { name: "Mensaje guardado", exact: true })).toBeVisible();
  await page.getByLabel("Nuevo apunte").fill("Mi idea privada de la beta"); await page.getByRole("button", { name: "Guardar apunte", exact: true }).click();
  await expect(page.getByText("Mi idea privada de la beta", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Historial", exact: true }).click(); await page.getByRole("button", { name: "Historia de vectores · 1 mensajes", exact: true }).click();
  await expect(page.getByText("Mi explicación histórica", { exact: true })).toBeVisible(); await expect(page.locator("body")).not.toContainText("PRIVATE-HISTORICAL-KEY");
  await switchUser(page, "author"); await page.getByRole("button", { name: "Autoría", exact: true }).click(); await page.getByRole("button", { name: "Corregir entregas", exact: true }).click();
  await page.getByRole("listitem").filter({ hasText: "Evaluación abierta beta" }).getByRole("button", { name: "Consultar entrega" }).click();
  await page.getByLabel("Justificación coherente · máximo 1").fill("1"); await page.getByLabel("Feedback al alumno").fill("La comparación está justificada.");
  await page.getByRole("button", { name: "Confirmar corrección final" }).click(); await expect(page.getByText(/Corrección final registrada/)).toBeVisible();
  await switchUser(page, "student-b"); await page.getByRole("button", { name: "Apuntes", exact: true }).click(); await expect(page.getByText("Todavía no hay apuntes.", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Mi idea privada de la beta");
  await page.getByRole("button", { name: "Historial", exact: true }).click(); await expect(page.getByText("No hay conversaciones históricas importadas para tu cuenta.", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});


test("catálogo migrado: materias, categorías, niveles y lecturas sin actividades ficticias", async ({ page }) => {
  await googleForTests(page, "student-a"); await page.goto("/"); await login(page);
  await page.getByLabel("Materia", { exact: true }).selectOption({ label: "Redes" });
  await page.getByLabel("Categoría", { exact: true }).selectOption({ label: "Enrutamiento" });
  await page.getByLabel("Tema", { exact: true }).selectOption({ label: "Enrutamiento dinámico con OSPF" });
  await expect(page.getByText(/Antes se recomienda: Enrutamiento estático/)).toBeVisible();
  await page.getByLabel("Nivel de lectura").selectOption({ label: "Principiante" });
  await expect(page.getByRole("status")).toContainText("1 materiales publicados en 1 temas");
  await page.getByRole("button", { name: "Abrir unidad", exact: true }).click();
  await expect(page.getByText("Material de lectura. No incluye prácticas ni evaluaciones y no acredita dominio.")).toBeVisible();
  await expect(page.getByText(/^Fuente:/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Iniciar .*beta/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Consultar esta lectura con el tutor" }).click();
  await page.getByRole("button", { name: "Nueva conversación" }).click();
  await page.getByLabel("Tu mensaje", { exact: true }).fill("Explica la idea de esta lectura.");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText("Respuesta de simulación: considera la idea principal.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Volver al catálogo" }).click();
  await expect(page.getByLabel("Materia", { exact: true })).toHaveValue(/.+/);
  await expect(page.getByLabel("Nivel de lectura")).toHaveValue("beginner");
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  }
});

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { catalogFixture } from "../src/test/fixtures/catalog";
import { observabilityFixture } from "../src/test/fixtures/observability";
import { sessionDetail, sessionsFixture } from "../src/test/fixtures/sessions";
import { chatResponseFixture } from "../src/test/fixtures/tutor";
import {
  evaluationFixture,
  nextPracticeExerciseFixture,
  practiceEvaluationFixture,
  practiceExerciseFixture,
  practiceStartFixture,
} from "../src/test/fixtures/learningCycle";

async function routeTutor(page: Page, { restored = true, voice = false }: { restored?: boolean; voice?: boolean } = {}) {
  await page.addInitScript(({ restore }) => {
    localStorage.setItem("studentAutoId", "student-e2e");
    if (restore) {
      localStorage.setItem("activeSession:student-e2e", "session-vectors");
      localStorage.setItem("ait.activeSession:v1", JSON.stringify({ version: 1, studentId: "student-e2e", sessionId: "session-vectors" }));
    }
  }, { restore: restored });
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: true, voice, voice_model: voice ? "gemini-live" : null, authoring: false }) }),
  );
  await page.route("**/api/auth/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: false, authenticated: false, google_client_id: null, profile: null }) }),
  );
  await page.route("**/api/topics**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalogFixture) }),
  );
  await page.route("**/api/sessions?**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(restored ? sessionsFixture : { sessions: [], retention_days: 365 }) }),
  );
  await page.route("**/api/sessions/*?**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sessionDetail("session-vectors")) }),
  );
  await page.route("**/api/observability", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(observabilityFixture) }),
  );
}

async function installVoiceBrowserMocks(page: Page) {
  await page.addInitScript(() => {
    const metrics = { audioModules: [] as string[], closes: 0, disconnects: 0, getUserMedia: 0, sent: [] as unknown[], sourceStarts: 0, sourceStops: 0, trackStops: 0 };
    class FakeNode extends EventTarget {
      connect() { return this; }
      disconnect() { metrics.disconnects += 1; }
    }
    class FakeSource extends FakeNode {
      buffer: unknown = null;
      start() { metrics.sourceStarts += 1; /* Playback remains active until interrupted. */ }
      stop() { metrics.sourceStops += 1; this.dispatchEvent(new Event("ended")); }
    }
    class FakeAudioContext {
      audioWorklet = { addModule: (url: string) => { metrics.audioModules.push(url); return Promise.resolve(); } };
      currentTime = 0;
      destination = new FakeNode();
      sampleRate = 48_000;
      state = "running";
      close() { this.state = "closed"; metrics.closes += 1; return Promise.resolve(); }
      resume() { return Promise.resolve(); }
      createAnalyser() { return Object.assign(new FakeNode(), { fftSize: 0, smoothingTimeConstant: 0 }); }
      createMediaStreamSource() { return new FakeNode(); }
      createGain() { return Object.assign(new FakeNode(), { gain: { value: 1 } }); }
      createBuffer(_channels: number, length: number, rate: number) {
        const data = new Float32Array(length);
        return { duration: length / rate, getChannelData: () => data };
      }
      createBufferSource() { return new FakeSource(); }
    }
    class FakeWorkletNode extends FakeNode {
      port = { onmessage: null, close: () => undefined };
    }
    class FakeSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      binaryType = "blob";
      readyState = FakeSocket.OPEN;
      constructor(public url: string) {
        super();
        (window as unknown as { __voiceSocket: FakeSocket }).__voiceSocket = this;
      }
      send(data: unknown) { metrics.sent.push(data); }
      close(code = 1000) {
        this.readyState = FakeSocket.CLOSED;
        this.dispatchEvent(new CloseEvent("close", { code }));
      }
      server(data: string | ArrayBuffer) { this.dispatchEvent(new MessageEvent("message", { data })); }
      drop() {
        this.readyState = FakeSocket.CLOSED;
        this.dispatchEvent(new CloseEvent("close", { code: 1006 }));
      }
    }
    const track = { enabled: true, stop: () => { metrics.trackStops += 1; } };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: () => {
        metrics.getUserMedia += 1;
        return Promise.resolve({ getTracks: () => [track], getAudioTracks: () => [track] });
      } },
    });
    Object.assign(window, {
      AudioContext: FakeAudioContext,
      AudioWorkletNode: FakeWorkletNode,
      WebSocket: FakeSocket,
      __voiceMetrics: metrics,
      __voiceTrack: track,
    });
  });
}

async function voiceServer(page: Page, data: Record<string, unknown> | "audio") {
  await page.evaluate((message) => {
    const socket = (window as unknown as { __voiceSocket: { server: (data: string | ArrayBuffer) => void } }).__voiceSocket;
    socket.server(message === "audio" ? new Int16Array([100, 200, 300]).buffer : JSON.stringify(message));
  }, data);
}

for (const width of [320, 768, 1024, 1440]) {
  test(`el tutor restaurado es accesible y no desborda a ${String(width)}px`, async ({ page }) => {
    await routeTutor(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./tutor");

    await expect(page.getByRole("heading", { name: "Vectores semánticos" })).toBeFocused();
    await expect(page.getByText("Explícame los embeddings")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
  });
}

test("Markdown, XSS, teclado, envío único, fuentes, traza, foco y consola cubren el tutor", async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") consoleMessages.push(message.text());
  });
  await routeTutor(page, { restored: false });
  let chatCalls = 0;
  let created = false;
  let releaseChat: () => void = () => undefined;
  const chatPending = new Promise<void>((resolve) => { releaseChat = resolve; });
  const message = "Explícame cómo comparar embeddings";
  const persisted = {
    ...sessionDetail("session-vectors"),
    messages: [
      { id: "user-e2e", role: "user", label: "Tú", content: message, sources: [], note: "", created_at: "2026-08-13T16:00:00Z" },
      { id: "assistant-e2e", role: "assistant", label: "Tutor Agent", content: chatResponseFixture.answer, sources: chatResponseFixture.sources, note: "", created_at: "2026-08-13T16:00:01Z" },
    ],
  };
  await page.unroute("**/api/sessions?**");
  await page.unroute("**/api/sessions/*?**");
  await page.route("**/api/sessions?**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(created ? sessionsFixture : { sessions: [], retention_days: 365 }) }),
  );
  await page.route("**/api/sessions/*?**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(persisted) }),
  );
  await page.route("**/api/chat", async (route) => {
    chatCalls += 1;
    await chatPending;
    created = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(chatResponseFixture) });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./tutor");

  const input = page.getByRole("textbox", { name: "Escribe tu mensaje" });
  await input.fill(message);
  await input.press("Control+Enter");
  await input.press("Control+Enter");
  await expect(page.getByRole("button", { name: "Cancelar envío" })).toBeVisible();
  await expect(page.getByText(message)).toBeVisible();
  releaseChat();
  await expect(page.getByRole("heading", { level: 3, name: "Una representación útil" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Fuentes de la respuesta" })).toContainText("Currículo AITeacher");
  await expect(page.getByText("La explicación quedó preparada.")).toBeVisible();
  await expect(input).toBeFocused();
  expect(chatCalls).toBe(1);

  await page.getByRole("button", { name: "Conversaciones" }).click();
  await page.getByRole("button", { name: "Cerrar conversaciones" }).last().click();
  await expect(page.getByRole("button", { name: "Conversaciones" })).toBeFocused();
  expect(await page.locator("script").filter({ hasText: "window.__xss" }).count()).toBe(0);
  expect(consoleMessages).toEqual([]);
});

test("evaluación, práctica y reanudación completan el ciclo después de recargar", async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") consoleMessages.push(message.text());
  });
  await routeTutor(page);
  const currentDetail = sessionDetail("session-vectors");
  let practiceBody: Record<string, unknown> | null = null;
  await page.unroute("**/api/sessions/*?**");
  await page.route("**/api/sessions/*?**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(currentDetail) }),
  );
  await page.route("**/api/evaluate", async (route) => {
    currentDetail.pending_quiz = { question: evaluationFixture.next_quiz.question, attempt: 2 };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(evaluationFixture) });
  });
  await page.route("**/api/practice/start", async (route) => {
    practiceBody = route.request().postDataJSON() as Record<string, unknown>;
    currentDetail.pending_practice = { exercise: practiceExerciseFixture };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(practiceStartFixture) });
  });
  await page.route("**/api/practice/evaluate", async (route) => {
    currentDetail.pending_practice = { exercise: nextPracticeExerciseFixture };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(practiceEvaluationFixture) });
  });
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("./tutor");

  const evaluationAnswer = page.getByRole("textbox", { name: "Explícalo con tus propias palabras" });
  await evaluationAnswer.fill("Los embeddings cercanos conservan significados relacionados.");
  await page.getByRole("button", { name: "Recibir feedback" }).click();
  await expect(page.getByRole("heading", { name: "Conecta una idea más" })).toBeFocused();
  await expect(page.getByLabel("Puntuación 82 de 100")).toBeVisible();
  await expect(page.getByLabel("Aplicación: 2 de 4")).toBeVisible();
  await expect(page.getByText("Embeddings y similitud")).toBeVisible();
  const resultAccessibility = await new AxeBuilder({ page }).analyze();
  expect(resultAccessibility.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);

  await page.getByRole("button", { name: "Practicar similitud vectorial" }).click();
  await expect(page.getByRole("heading", { name: "Compara dos intenciones" })).toBeVisible();
  expect(practiceBody).toMatchObject({ focus_concept: "similitud vectorial" });
  await page.getByRole("textbox", { name: "Tu resolución" }).fill("La consulta más cercana comparte la intención del documento.");
  await page.getByRole("button", { name: "Comprobar práctica" }).click();
  await expect(page.getByRole("heading", { name: "88/100 · Resultado de práctica" })).toBeFocused();
  await page.getByRole("button", { name: "Siguiente ejercicio" }).click();
  await expect(page.getByRole("heading", { name: "Diseña una búsqueda semántica" })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Reanudar práctica · ronda 2" }).click();
  await expect(page.getByRole("heading", { name: "Diseña una búsqueda semántica" })).toBeVisible();
  await page.getByRole("button", { name: "Volver a la pregunta principal" }).click();
  await expect(page.getByText(evaluationFixture.next_quiz.question)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  expect(consoleMessages).toEqual([]);
});

for (const width of [320, 768, 1024, 1440]) {
  test(`el modo de voz es accesible y no desborda a ${String(width)}px`, async ({ page }) => {
    await installVoiceBrowserMocks(page);
    await routeTutor(page, { voice: true });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./tutor");
    await page.getByRole("button", { name: "Conversar por voz" }).click();
    await expect(page.getByRole("dialog", { name: "Habla con tu tutor" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Finalizar conversación por voz" })).toBeFocused();
    await voiceServer(page, { type: "ready", sample_rate: 24_000, supports_interruption: true });
    await expect(page.getByText("Te escucho", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
    if (width === 768) {
      await page.getByRole("button", { name: "Finalizar conversación por voz" }).press("Shift+Tab");
      await expect(page.getByRole("button", { name: "Finalizar", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Conversar por voz" })).toBeFocused();
    } else {
      await page.getByRole("button", { name: "Finalizar", exact: true }).click();
    }
  });
}

test("voz conecta, silencia, interrumpe, reconecta, limpia y vuelve al texto", async ({ page }) => {
  const consoleMessages: string[] = [];
  const voiceModuleRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") consoleMessages.push(message.text());
  });
  page.on("request", (request) => {
    if (request.url().includes("/features/voice/")) voiceModuleRequests.push(request.url());
  });
  await installVoiceBrowserMocks(page);
  await routeTutor(page, { voice: true });
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("./tutor");
  expect(voiceModuleRequests).toEqual([]);

  const trigger = page.getByRole("button", { name: "Conversar por voz" });
  await trigger.click();
  await expect.poll(() => voiceModuleRequests.length).toBeGreaterThan(0);
  await expect(page.getByRole("dialog", { name: "Habla con tu tutor" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __voiceSocket?: { url: string } }).__voiceSocket?.url ?? ""))
    .toContain("/ws/live?student_id=student-e2e&session_id=session-vectors");
  await voiceServer(page, { type: "ready", sample_rate: 24_000, supports_interruption: true });
  await expect(page.getByText("Te escucho", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __voiceMetrics: { audioModules: string[] } }).__voiceMetrics.audioModules))
    .toEqual(["/static/pcm-capture-worklet.js?v=1"]);

  const mute = page.getByRole("button", { name: "Silenciar micrófono" });
  await mute.click();
  await expect(page.getByRole("button", { name: "Activar micrófono" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => (window as unknown as { __voiceTrack: { enabled: boolean } }).__voiceTrack.enabled)).toBe(false);
  await page.getByRole("button", { name: "Activar micrófono" }).click();

  await voiceServer(page, { type: "transcript", role: "user", text: "¿Qué es un embedding?" });
  await voiceServer(page, { type: "transcript", role: "tutor", text: "Es una representación numérica." });
  await voiceServer(page, "audio");
  await expect(page.getByText("El tutor está respondiendo", { exact: true })).toBeVisible();
  await expect(page.getByText("Es una representación numérica.")).toBeVisible();
  await page.getByRole("button", { name: "Interrumpir audio" }).click();
  await expect(page.getByText("Te escucho", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __voiceMetrics: { sourceStops: number } }).__voiceMetrics.sourceStops)).toBe(1);
  await voiceServer(page, "audio");
  expect(await page.evaluate(() => (window as unknown as { __voiceMetrics: { sourceStarts: number } }).__voiceMetrics.sourceStarts)).toBe(1);
  await voiceServer(page, { type: "turn_complete" });
  await voiceServer(page, "audio");
  expect(await page.evaluate(() => (window as unknown as { __voiceMetrics: { sourceStarts: number } }).__voiceMetrics.sourceStarts)).toBe(2);

  await page.evaluate(() => (window as unknown as { __voiceSocket: { drop: () => void } }).__voiceSocket.drop());
  await expect(page.getByText("La voz no está disponible", { exact: true })).toBeVisible();
  const mediaRequestsBeforeRetry = await page.evaluate(() => (window as unknown as { __voiceMetrics: { getUserMedia: number } }).__voiceMetrics.getUserMedia);
  await page.getByRole("button", { name: "Reconectar voz" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __voiceMetrics: { getUserMedia: number } }).__voiceMetrics.getUserMedia)).toBe(mediaRequestsBeforeRetry + 1);
  await voiceServer(page, { type: "ready", sample_rate: 24_000, supports_interruption: true });
  await expect(page.getByText("Te escucho", { exact: true })).toBeVisible();

  await page.evaluate(() => (window as unknown as { __voiceSocket: { drop: () => void } }).__voiceSocket.drop());
  await page.getByRole("button", { name: "Continuar por texto" }).click();
  await expect(page.getByRole("textbox", { name: "Escribe tu mensaje" })).toBeFocused();
  await expect(page.getByRole("dialog", { name: "Habla con tu tutor" })).toHaveCount(0);
  const metrics = await page.evaluate(() => (window as unknown as { __voiceMetrics: { closes: number; disconnects: number; trackStops: number } }).__voiceMetrics);
  expect(metrics.trackStops).toBeGreaterThanOrEqual(2);
  expect(metrics.disconnects).toBeGreaterThanOrEqual(6);
  expect(metrics.closes).toBeGreaterThanOrEqual(2);
  expect(consoleMessages).toEqual([]);

  await trigger.click();
  await page.getByRole("button", { name: "Finalizar conversación por voz" }).click();
  await expect(trigger).toBeFocused();
});

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

// Opt-in evidence for U0/U6. The app and normal regression run are unchanged.
const directory = process.env.AITEACHER_UI_BASELINE_DIR;
const commit = directory ? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() : "";

export async function recordBaseline(page: Page, label: string, theme: "light" | "dark") {
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  const viewport = page.viewportSize();
  const slug = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const file = `${slug}-${theme}-${String(viewport?.width)}.png`;
  const geometry = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - innerWidth,
    focused: { tag: document.activeElement?.tagName, text: document.activeElement?.textContent.trim().slice(0, 120) },
    navigationLabels: Array.from(document.querySelectorAll('nav[aria-label="Navegación principal"] a span')).map((element) => ({
      text: element.textContent, width: element.clientWidth, scrollWidth: element.scrollWidth,
    })),
    controls: Array.from(document.querySelectorAll("button, a, input, textarea, select")).flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return [];
      const style = getComputedStyle(element);
      return [{ text: element.getAttribute("aria-label") ?? element.textContent.trim().slice(0, 120),
        tag: element.tagName, role: element.getAttribute("role"), selected: element.getAttribute("aria-selected"),
        color: style.color, background: style.backgroundColor, border: style.borderColor,
        outline: style.outline, width: rect.width, height: rect.height, x: rect.x, y: rect.y }];
    }),
  }));
  const screenshot = viewport?.width === 320 || viewport?.width === 390 || viewport?.width === 1440;
  if (screenshot) await page.screenshot({ path: join(directory, file), fullPage: true });
  appendFileSync(join(directory, "manifest.jsonl"), `${JSON.stringify({ commit, capturedAt: new Date().toISOString(),
    test: "backend.spec.ts", label, route: new URL(page.url()).pathname + new URL(page.url()).search,
    theme, viewport, screenshot: screenshot ? file : null, ...geometry })}\n`);
}

export async function baselineSurface(page: Page, label: string) {
  if (!directory) return;
  if (!label.endsWith("cargando")) await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  const originalViewport = page.viewportSize();
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await recordBaseline(page, label, theme);
    }
  }
  await page.emulateMedia({ colorScheme: "light" });
  if (originalViewport) await page.setViewportSize(originalViewport);
}

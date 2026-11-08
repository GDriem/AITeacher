import { expect, type Locator, type Page } from "@playwright/test";

/** Regression for U1: clipping, selected-tab visibility and actual field boundaries. */
export async function assertControlGeometry(page: Page) {
  const navigation = page.getByRole("navigation", { name: "Navegación principal" });
  for (const label of await navigation.locator("a span").all()) {
    expect(await label.evaluate((node) => node.scrollWidth <= node.clientWidth), await label.textContent() ?? "navigation").toBe(true);
  }
  for (const tab of await page.getByRole("tab", { selected: true }).all()) await expectTabInStrip(tab);

  const contrasts = await page.locator('input:not([type="checkbox"]):not([type="radio"]):enabled, select:enabled, textarea:enabled').evaluateAll((fields) => {
    type Color = number[];
    const parse = (value: string): Color => (value.match(/[\d.]+/g) ?? []).map(Number);
    const over = (front: Color, back: Color): Color => front.slice(0, 3).map((v, i) => v * (front[3] ?? 1) + (back[i] ?? 0) * (1 - (front[3] ?? 1)));
    const luminance = (color: Color) => color.slice(0, 3).reduce((sum, value, index) => {
      const channel = value / 255;
      return sum + (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * ([0.2126, 0.7152, 0.0722][index] ?? 0);
    }, 0);
    const ratio = (a: Color, b: Color) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
    return fields.filter((field) => field.getBoundingClientRect().width > 0).map((field) => {
      const ancestors: Element[] = [];
      for (let node = field.parentElement; node; node = node.parentElement) ancestors.unshift(node);
      const outside = ancestors.reduce((background, node) => over(parse(getComputedStyle(node).backgroundColor), background), [255, 255, 255]);
      const style = getComputedStyle(field);
      const inside = over(parse(style.backgroundColor), outside);
      const border = over(parse(style.borderTopColor), inside);
      return { field: field.getAttribute("aria-label") ?? field.id, inside: ratio(border, inside), outside: ratio(border, outside) };
    });
  });
  for (const contrast of contrasts) {
    expect(contrast.inside, JSON.stringify(contrast)).toBeGreaterThanOrEqual(3);
    expect(contrast.outside, JSON.stringify(contrast)).toBeGreaterThanOrEqual(3);
  }
}

export async function expectTabInStrip(tab: Locator) {
  await expect.poll(() => tab.evaluate((element) => {
    const tab = element.getBoundingClientRect();
    const strip = element.parentElement?.getBoundingClientRect();
    if (!strip) return false;
    return tab.left >= strip.left - 1 && tab.right <= strip.right + 1;
  })).toBe(true);
}

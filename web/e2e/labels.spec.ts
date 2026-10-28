import { expect, test } from "@playwright/test";

const diagram = `diagram version=1

node a "The quick brown fox jumps over the lazy dog" shape=rect
node b "Привет мир, это длинная строка" shape=ellipse
node c "x    y" shape=rect
text t "Wrapped text box content that needs several lines"
text u "Fits its content"

layout {
  a x=0 y=0 w=120 h=120
  b x=200 y=0 w=120 h=120
  c x=400 y=0 w=200 h=40
  t x=0 y=200 w=100
  u x=300 y=200
}
`;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    await startShell(document.getElementById("app") as HTMLElement, new MemoryStorage({ "d.drawit.kdl": text }));
  }, diagram);
  await expect(page.locator('g[data-id="a"]')).toBeVisible();
});

// Rendered ink may pass the advance width by a pixel or two; WebKit's own text length differs by up to 1.5px.
const TOLERANCE_PX = 1.5;

async function lineWidths(page: import("@playwright/test").Page, id: string): Promise<number[]> {
  return page.locator(`g[data-id="${id}"] text`).evaluateAll((nodes) => nodes.map((n) => (n as SVGTextContentElement).getComputedTextLength()));
}

test("a label wraps inside its box in every shape", async ({ page }) => {
  for (const [id, width] of [["a", 120], ["b", 120]] as const) {
    const widths = await lineWidths(page, id);
    expect(widths.length, id).toBeGreaterThan(1);
    for (const w of widths) expect(w, id).toBeLessThanOrEqual(width + TOLERANCE_PX);
  }
});

test("a text box with a width wraps there and one without fits its content", async ({ page }) => {
  const wrapped = await lineWidths(page, "t");
  expect(wrapped.length).toBeGreaterThan(1);
  for (const w of wrapped) expect(w).toBeLessThanOrEqual(100 + TOLERANCE_PX);
  const fits = await lineWidths(page, "u");
  expect(fits).toHaveLength(1);
  const box = await page.locator('g[data-id="u"]').boundingBox();
  expect(box?.width).toBeGreaterThan(0);
});

test("a run of spaces in a label keeps its width", async ({ page }) => {
  const [spaced] = await lineWidths(page, "c");
  const measured = await page.evaluate(async () => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { createTextMeasurer } = await load<typeof import("../src/text/measure.ts")>("/src/text/measure.ts");
    return createTextMeasurer().width("x    y", { family: "Inter", size: 14, weight: 400, italic: false });
  });
  expect(Math.abs((spaced ?? 0) - measured)).toBeLessThanOrEqual(TOLERANCE_PX);
});

test("a selected text box has the outline of its wrapped lines", async ({ page }) => {
  const text = await page.locator('g[data-id="t"]').boundingBox();
  await page.mouse.click((text?.x ?? 0) + 5, (text?.y ?? 0) + 5);
  const outline = page.locator('[data-id="select-t"]');
  await expect(outline).toHaveAttribute("width", "100");
  const lines = (await lineWidths(page, "t")).length;
  await expect(outline).toHaveAttribute("height", String(lines * 24));
});

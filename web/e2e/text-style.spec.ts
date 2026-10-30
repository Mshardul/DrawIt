import { expect, test } from "@playwright/test";

// Text styles from the style section reach the drawn text, its size, and the editing overlay.
const diagram = `diagram version=1

node a "Alpha" shape=rect
text t "one two"

style {
  el a font="JetBrains Mono" size=20 weight=700 italic=#true underline=#true color="#c00000" align=right
  el t size=18 line-height=40
}

layout {
  a x=100 y=100 w=240 h=80
  t x=100 y=300 w=60
}
`;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const shell = await startShell(document.getElementById("app") as HTMLElement, new MemoryStorage({ "d.drawit.kdl": text }));
    shell.setView({ x: 0, y: 0, scale: 1 });
  }, diagram);
  await expect(page.locator('g[data-id="a"]')).toBeVisible();
});

test("a styled label is drawn with its font, size, weight, slant, underline and colour", async ({ page }) => {
  const text = page.locator('g[data-id="a"] text');
  await expect(text).toHaveAttribute("font-family", '"JetBrains Mono"');
  await expect(text).toHaveAttribute("font-size", "20");
  await expect(text).toHaveAttribute("font-weight", "700");
  await expect(text).toHaveAttribute("font-style", "italic");
  await expect(text).toHaveAttribute("text-decoration", "underline");
  await expect(text).toHaveAttribute("fill", "#c00000");
  await expect(text).toHaveAttribute("text-anchor", "end");
});

test("a text box takes its height from the line height", async ({ page }) => {
  // "one two" wraps to two lines at 60px in 18px Inter; each line is 40px.
  const lines = await page.locator('g[data-id="t"] text').count();
  expect(lines).toBeGreaterThan(1);
  const box = await page.locator('g[data-id="t"]').boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(lines * 40 - 20);
});

test("the editing overlay uses the drawn font, colour and alignment, and sits where the text was", async ({ page }) => {
  const text = page.locator('g[data-id="a"] text');
  const drawn = await text.evaluate((t) => t.getBoundingClientRect().right);
  const frame = await page.locator('g[data-id="a"] rect').boundingBox();
  if (!frame) throw new Error("no frame");
  await page.mouse.dblclick(frame.x + frame.width / 2, frame.y + frame.height / 2);
  const editor = page.locator("textarea.text-edit");
  await expect(editor).toBeFocused();
  const css = await editor.evaluate((t) => {
    const s = getComputedStyle(t);
    return { family: s.fontFamily, size: s.fontSize, weight: s.fontWeight, style: s.fontStyle, color: s.color, align: s.textAlign, decoration: s.textDecorationLine };
  });
  expect(css).toMatchObject({ size: "20px", weight: "700", style: "italic", color: "rgb(192, 0, 0)", align: "right", decoration: "underline" });
  expect(css.family).toContain("JetBrains Mono");
  const typed = await editor.boundingBox();
  // Right-aligned text ends where the drawn text ended.
  expect(Math.abs((typed?.x ?? 0) + (typed?.width ?? 0) - drawn)).toBeLessThanOrEqual(2);
});

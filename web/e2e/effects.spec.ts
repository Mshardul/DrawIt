import { expect, test, type Page } from "@playwright/test";

// Dash, gradient and shadow reach the page: the definitions are in the canvas and the shapes point at them.
const MANY = 25;
const many = Array.from({ length: MANY }, (_, i) => `node s${String(i)} shape=rect`).join("\n");
const manyLayout = Array.from({ length: MANY }, (_, i) => `  s${String(i)} x=${String(40 + (i % 5) * 120)} y=${String(200 + Math.floor(i / 5) * 80)} w=100 h=50`).join("\n");
const manyStyle = Array.from({ length: MANY }, (_, i) => `  el s${String(i)} shadow="2 4 6 #000000"`).join("\n");

const file = `diagram version=1

node a "Alpha" shape=rect
node b "Beta" shape=ellipse
${many}

style {
  el a dash=dashed fill="linear(90, #ff0000, #0000ff)" shadow="2 4 6 #000000"
  el b dash=dotted
${manyStyle}
}

layout {
  a x=40 y=40 w=100 h=50
  b x=240 y=40 w=100 h=50
${manyLayout}
}
`;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto("/");
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const shell = await startShell(document.getElementById("app") as HTMLElement, new MemoryStorage({ "a.drawit.kdl": text }));
    shell.setView({ x: 0, y: 0, scale: 1 });
    (window as unknown as { select: (ids: string[]) => void }).select = (ids) => {
      if (shell.file) shell.file.history.selection = ids;
      shell.refresh();
    };
  }, file);
  await expect(page.locator('g[data-id="a"]')).toBeVisible();
});

const group = (page: Page, id: string) => page.locator(`.canvas [data-id="${id}"]`).first();

test("a dashed and a dotted outline are drawn with a dash array", async ({ page }) => {
  await expect(group(page, "a").locator("rect")).toHaveAttribute("stroke-dasharray", "6 4.5");
  await expect(group(page, "b").locator("ellipse")).toHaveAttribute("stroke-dasharray", "1.5 3");
});

test("a gradient fill points at a gradient in the canvas", async ({ page }) => {
  const fill = (await group(page, "a").locator("rect").getAttribute("fill")) ?? "";
  const id = /^url\(#(.+)\)$/.exec(fill)?.[1] ?? "";
  expect(id).not.toBe("");
  await expect(page.locator(`.canvas defs linearGradient[id="${id}"] stop`)).toHaveCount(2);
});

test("a shadow is a filter in the canvas that the element's group uses", async ({ page }) => {
  const filter = (await group(page, "a").getAttribute("filter")) ?? "";
  const id = /^url\(#(.+)\)$/.exec(filter)?.[1] ?? "";
  expect(id).not.toBe("");
  await expect(page.locator(`.canvas filter[id="${id}"] feDropShadow`)).toHaveCount(1);
  await expect(group(page, "b")).not.toHaveAttribute("filter");
});

const dragFrom = async (page: Page, id: string): Promise<void> => {
  const box = await group(page, id).locator("rect").boundingBox();
  if (!box) throw new Error("no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 30, { steps: 4 });
};

test("a drag of many shadowed shapes draws without filters and the release brings them back", async ({ page }) => {
  await page.evaluate((n) => { (window as unknown as { select: (ids: string[]) => void }).select(Array.from({ length: n }, (_, i) => `s${String(i)}`)); }, MANY);
  await dragFrom(page, "s0");
  await expect(group(page, "s0")).not.toHaveAttribute("filter");
  await expect(group(page, "s1")).not.toHaveAttribute("filter");
  await page.mouse.up();
  await expect(group(page, "s0")).toHaveAttribute("filter", /^url\(#/);
  await expect(group(page, "s1")).toHaveAttribute("filter", /^url\(#/);
});

test("a drag of a few shadowed shapes keeps their shadows", async ({ page }) => {
  await page.evaluate(() => { (window as unknown as { select: (ids: string[]) => void }).select(["s0"]); });
  await dragFrom(page, "s0");
  await expect(group(page, "s0")).toHaveAttribute("filter", /^url\(#/);
  await page.mouse.up();
});

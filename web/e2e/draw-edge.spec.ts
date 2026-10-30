import { expect, test, type Page } from "@playwright/test";

// The line and arrow tool in the real shell over an in-memory workspace.
const file = `diagram version=1

node a "Alpha" shape=rect
node b "Beta" shape=ellipse

layout {
  a x=40 y=40 w=100 h=50
  b x=340 y=40 w=100 h=100
}
`;

interface Hooks {
  edges(): { id: string; from: string | null; to: string | null }[];
  layout(id: string): { fromPoint?: { x: number; y: number }; toPoint?: { x: number; y: number }; x: number; y: number } | undefined;
  selection(): string[];
  text(): string;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto("/");
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { writeDiagram } = await load<typeof import("../src/kdl/write.ts")>("/src/kdl/write.ts");
    const shell = await startShell(
      document.getElementById("app") as HTMLElement,
      new MemoryStorage({ "a.drawit.kdl": text }),
    );
    shell.setView({ x: 0, y: 0, scale: 1 });
    (window as unknown as { hooks: Hooks }).hooks = {
      edges: () => (shell.file?.document.elements ?? []).flatMap((e) => (e.kind === "edge" ? [{ id: e.id, from: e.from, to: e.to }] : [])),
      layout: (id) => shell.file?.document.layout.find((e) => e.id === id),
      selection: () => shell.file?.history.selection ?? [],
      text: () => (shell.file ? writeDiagram(shell.file.document) : ""),
    };
  }, file);
});

const edges = (page: Page) => page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.edges());
const selection = (page: Page) => page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.selection());
const text = (page: Page) => page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.text());
const layout = (page: Page, id: string) => page.evaluate((i) => (window as unknown as { hooks: Hooks }).hooks.layout(i), id);
const arrowTool = (page: Page) => page.getByRole("button", { name: "Arrow", exact: true });

/** Screen position of a world point, with the view at identity. */
async function at(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const r = await page.locator(".canvas").boundingBox();
  return { x: (r?.x ?? 0) + x, y: (r?.y ?? 0) + y };
}

async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}

test("dragging from one shape to another adds an edge between them, selects it and returns to the select tool", async ({ page }) => {
  await arrowTool(page).click();
  await expect(arrowTool(page)).toHaveAttribute("aria-pressed", "true");
  await drag(page, [90, 65], [390, 90]);
  expect(await edges(page)).toEqual([{ id: "a->b", from: "a", to: "b" }]);
  expect(await selection(page)).toEqual(["a->b"]);
  await expect(page.locator('.elements > g[data-id="a->b"] path')).toHaveCount(1);
  await expect(arrowTool(page)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Select", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("the edge is one undo step, and undo takes it away", async ({ page }) => {
  await arrowTool(page).click();
  await drag(page, [90, 65], [390, 90]);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await edges(page)).toEqual([]);
  await expect(page.locator('.elements > g[data-id="a->b"]')).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await edges(page)).toHaveLength(1);
});

test("dragging from a shape onto empty canvas leaves a free end, written as a dash with its point in the layout", async ({ page }) => {
  await arrowTool(page).click();
  await drag(page, [90, 65], [600, 400]);
  expect(await edges(page)).toEqual([{ id: "edge", from: "a", to: null }]);
  expect((await layout(page, "edge"))?.toPoint).toEqual({ x: 600, y: 400 });
  expect(await text(page)).toContain("edge a - id=edge\n");
});

test("dragging from empty canvas to a shape, and between two empty points", async ({ page }) => {
  await arrowTool(page).click();
  await drag(page, [600, 400], [390, 90]);
  expect(await edges(page)).toEqual([{ id: "edge", from: null, to: "b" }]);
  expect((await layout(page, "edge"))?.fromPoint).toEqual({ x: 600, y: 400 });
  await arrowTool(page).click();
  await drag(page, [100, 500], [300, 600]);
  expect((await edges(page)).map((e) => e.id)).toEqual(["edge", "edge-2"]);
});

test("a second edge between the same two shapes gets an explicit ID", async ({ page }) => {
  await arrowTool(page).click();
  await drag(page, [90, 65], [390, 90]);
  await arrowTool(page).click();
  await drag(page, [90, 65], [390, 90]);
  expect((await edges(page)).map((e) => e.id)).toEqual(["a->b", "edge"]);
  const saved = await text(page);
  expect(saved).toContain("edge a b\n");
  expect(saved).toContain("edge a b id=edge\n");
});

test("a dashed line follows the pointer while dragging and goes when the button is released", async ({ page }) => {
  await arrowTool(page).click();
  const from = await at(page, 90, 65);
  const to = await at(page, 600, 400);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await expect(page.locator('[data-id="edge-draft"]')).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator('[data-id="edge-draft"]')).toHaveCount(0);
});

test("Escape during a drag cancels it, and Escape afterwards leaves the tool", async ({ page }) => {
  await arrowTool(page).click();
  const from = await at(page, 90, 65);
  const to = await at(page, 600, 400);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await edges(page)).toEqual([]);
  await expect(arrowTool(page)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(arrowTool(page)).toHaveAttribute("aria-pressed", "false");
});

test("a click that does not drag draws nothing and keeps the tool", async ({ page }) => {
  await arrowTool(page).click();
  const p = await at(page, 90, 65);
  await page.mouse.click(p.x, p.y);
  expect(await edges(page)).toEqual([]);
  await expect(arrowTool(page)).toHaveAttribute("aria-pressed", "true");
});

test("while the tool is on, dragging a shape draws a line and does not move the shape", async ({ page }) => {
  await arrowTool(page).click();
  await drag(page, [90, 65], [600, 400]);
  expect((await layout(page, "a"))?.x).toBe(40);
});

test("the L and V keys switch tools", async ({ page }) => {
  await page.keyboard.press("l");
  await expect(arrowTool(page)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("v");
  await expect(arrowTool(page)).toHaveAttribute("aria-pressed", "false");
});

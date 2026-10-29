import { expect, test, type Page } from "@playwright/test";

// Dragging an end handle of the selected edge, in the real shell over an in-memory workspace.
const file = `diagram version=1

node a "Alpha" shape=rect
node b "Beta" shape=rect
node c "Gamma" shape=rect
edge a b

layout {
  a x=40 y=40 w=100 h=50
  b x=340 y=40 w=100 h=50
  c x=340 y=300 w=100 h=50
}
`;

interface EdgeState {
  from: string | null;
  to: string | null;
  fromPoint?: { x: number; y: number };
  toPoint?: { x: number; y: number };
  toAnchor?: unknown;
}
interface Hooks {
  edge(id: string): EdgeState;
  undo(): void;
  dirty(): boolean;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto("/");
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const shell = await startShell(document.getElementById("app") as HTMLElement, new MemoryStorage({ "a.drawit.kdl": text }));
    shell.setView({ x: 0, y: 0, scale: 1 });
    (window as unknown as { hooks: Hooks }).hooks = {
      edge: (id) => {
        const doc = shell.file?.document;
        const element = doc?.elements.find((e) => e.id === id);
        const entry = doc?.layout.find((e) => e.id === id);
        if (element?.kind !== "edge") throw new Error(`no edge ${id}`);
        return { from: element.from, to: element.to, ...(entry?.fromPoint && { fromPoint: entry.fromPoint }), ...(entry?.toPoint && { toPoint: entry.toPoint }), toAnchor: entry?.to };
      },
      undo: () => {
        if (shell.file?.history.undo()) shell.refresh();
      },
      dirty: () => shell.file?.dirty ?? false,
    };
  }, file);
});

const edge = (page: Page): Promise<EdgeState> => page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.edge("a->b"));
const group = (page: Page) => page.locator('.elements > g[data-id="a->b"]');

async function origin(page: Page): Promise<{ x: number; y: number }> {
  const r = await page.locator(".canvas").boundingBox();
  return { x: r?.x ?? 0, y: r?.y ?? 0 };
}

/** Selects the edge and returns the screen centre of one of its end handles. */
async function selectAndFind(page: Page, end: "from" | "to"): Promise<{ x: number; y: number }> {
  const o = await origin(page);
  await page.mouse.click(o.x + 240, o.y + 65);
  const box = await page.locator(`[data-end="${end}"]`).boundingBox();
  if (!box) throw new Error("no handle");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("dragging an end handle onto another shape attaches the end there and keeps the edge selected", async ({ page }) => {
  const h = await selectAndFind(page, "to");
  const o = await origin(page);
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  await page.mouse.move(o.x + 390, o.y + 310, { steps: 6 });
  await page.mouse.up();
  const state = await edge(page);
  expect(state).toMatchObject({ from: "a", to: "c", toAnchor: { side: "top" } });
  await expect(page.locator('[data-end="to"]')).toHaveCount(1);
});

test("dragging an end handle onto empty canvas frees the end at the drop point", async ({ page }) => {
  const h = await selectAndFind(page, "to");
  const o = await origin(page);
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  await page.mouse.move(o.x + 700, o.y + 200, { steps: 6 });
  await page.mouse.up();
  expect(await edge(page)).toMatchObject({ from: "a", to: null, toPoint: { x: 700, y: 200 } });
});

test("the path follows the pointer during the drag and the drag is one undo step", async ({ page }) => {
  const h = await selectAndFind(page, "to");
  const o = await origin(page);
  const before = await group(page).locator("path").getAttribute("d");
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  await page.mouse.move(o.x + 700, o.y + 200, { steps: 6 });
  expect(await group(page).locator("path").getAttribute("d")).not.toBe(before);
  await page.mouse.up();
  await page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.undo(); });
  expect(await edge(page)).toMatchObject({ from: "a", to: "b" });
  expect(await group(page).locator("path").getAttribute("d")).toBe(before);
});

test("Escape during the drag leaves the edge and the file untouched", async ({ page }) => {
  const h = await selectAndFind(page, "to");
  const o = await origin(page);
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  await page.mouse.move(o.x + 700, o.y + 200, { steps: 6 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await edge(page)).toMatchObject({ from: "a", to: "b" });
  expect(await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.dirty())).toBe(false);
});

test("pressing an end handle without moving changes nothing", async ({ page }) => {
  const h = await selectAndFind(page, "from");
  await page.mouse.click(h.x, h.y);
  expect(await edge(page)).toMatchObject({ from: "a", to: "b" });
  expect(await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.dirty())).toBe(false);
});

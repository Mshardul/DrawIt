import { expect, test, type Page } from "@playwright/test";

// Edges drawn, followed and kept up to date in the real shell over an in-memory workspace.
const file = `diagram version=1

node a "Alpha" shape=rect
node b "Beta" shape=rect
node c "Gamma" shape=rect
edge a b
edge b c id=bc
edge a c id=ac

style {
  el bc route=elbow head-start=dot head-end=none
}

layout {
  a x=40 y=40 w=100 h=50
  b x=340 y=40 w=100 h=50
  c x=340 y=300 w=100 h=50
}
`;

interface Hooks {
  moveAndRefresh(id: string, x: number, y: number): void;
  selection(): string[];
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto("/");
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const shell = await startShell(
      document.getElementById("app") as HTMLElement,
      new MemoryStorage({ "a.drawit.kdl": text }),
    );
    shell.setView({ x: 0, y: 0, scale: 1 });
    (window as unknown as { hooks: Hooks }).hooks = {
      selection: () => shell.file?.history.selection ?? [],
      moveAndRefresh: (id, x, y) => {
        shell.file?.history.execute({ type: "setLayout", changes: [{ id, set: { x, y } }] });
        shell.refresh();
      },
    };
  }, file);
});

const group = (page: Page, id: string) => page.locator(`.elements > g[data-id="${id}"]`);
const pathOf = (page: Page, id: string): Promise<string | null> => group(page, id).locator("path").getAttribute("d");

test("an edge is drawn between its shapes with the default arrow at its end", async ({ page }) => {
  expect(await pathOf(page, "a->b")).toBe("M140 65L340 65");
  await expect(group(page, "a->b").locator("polygon")).toHaveCount(1);
  await expect(group(page, "a->b").locator("circle")).toHaveCount(0);
});

test("the style section sets the route and the heads", async ({ page }) => {
  expect(await pathOf(page, "bc")).toBe("M390 90L390 300");
  await expect(group(page, "bc").locator("circle")).toHaveCount(1);
  await expect(group(page, "bc").locator("polygon")).toHaveCount(0);
});

test("edges with no layout entry are drawn above the shapes, in file order", async ({ page }) => {
  const ids = await page.locator(".elements > g").evaluateAll((gs) => gs.map((g) => g.getAttribute("data-id")));
  expect(ids).toEqual(["a", "b", "c", "a->b", "bc", "ac"]);
});

test("moving a shape re-routes the edges attached to it and leaves the others as they were", async ({ page }) => {
  const before = { ab: await pathOf(page, "a->b"), bc: await pathOf(page, "bc"), ac: await pathOf(page, "ac") };
  await page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.moveAndRefresh("a", 40, 200); });
  expect(await pathOf(page, "a->b")).not.toBe(before.ab);
  expect(await pathOf(page, "ac")).not.toBe(before.ac);
  expect(await pathOf(page, "bc")).toBe(before.bc);
});

test("dragging a shape moves the ends of its edges with the pointer", async ({ page }) => {
  const r = await page.locator(".canvas").boundingBox();
  const x = (r?.x ?? 0);
  const y = (r?.y ?? 0);
  await page.mouse.click(x + 90, y + 65);
  await page.mouse.move(x + 90, y + 65);
  await page.mouse.down();
  await page.mouse.move(x + 90, y + 265, { steps: 8 });
  const during = await pathOf(page, "ac");
  await page.mouse.up();
  expect(during).not.toBeNull();
  expect(await pathOf(page, "ac")).toBe(during);
  expect(during).toContain("L");
  expect(during?.startsWith("M")).toBe(true);
  expect(Number(during?.match(/^M[\d.]+ ([\d.]+)/)?.[1])).toBeGreaterThan(200);
});

const selection = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.selection());

/** Screen position of the middle of an edge's drawn path, with the view at identity. */
async function middleOf(page: Page, id: string): Promise<{ x: number; y: number }> {
  const d = (await pathOf(page, id)) ?? "";
  const points = d.split(/(?=[ML])/).map((s) => s.slice(1).split(" ").map(Number));
  const first = points[0] as number[];
  const last = points.at(-1) as number[];
  const r = await page.locator(".canvas").boundingBox();
  return { x: (r?.x ?? 0) + ((first[0] ?? 0) + (last[0] ?? 0)) / 2, y: (r?.y ?? 0) + ((first[1] ?? 0) + (last[1] ?? 0)) / 2 };
}

test("clicking an edge selects it, outlines its path and shows a handle on each end", async ({ page }) => {
  const p = await middleOf(page, "ac");
  await page.mouse.click(p.x, p.y);
  expect(await selection(page)).toEqual(["ac"]);
  await expect(page.locator('[data-id="select-ac"]')).toHaveCount(1);
  await expect(page.locator("[data-end]")).toHaveCount(2);
  await expect(page.locator("[data-handle]")).toHaveCount(0);
});

test("clicking a few pixels off an edge still selects it, and further off clears", async ({ page }) => {
  const p = await middleOf(page, "a->b");
  await page.mouse.click(p.x, p.y - 3);
  expect(await selection(page)).toEqual(["a->b"]);
  await page.mouse.click(p.x, p.y - 30);
  expect(await selection(page)).toEqual([]);
});

test("shift-clicking an edge adds it to the selection, and no end handles show for several", async ({ page }) => {
  const r = await page.locator(".canvas").boundingBox();
  await page.mouse.click((r?.x ?? 0) + 60, (r?.y ?? 0) + 50);
  const p = await middleOf(page, "a->b");
  await page.keyboard.down("Shift");
  await page.mouse.click(p.x, p.y);
  await page.keyboard.up("Shift");
  expect(await selection(page)).toEqual(["a", "a->b"]);
  await expect(page.locator("[data-end]")).toHaveCount(0);
});

test("a drag-box over part of an edge selects the edge", async ({ page }) => {
  const r = await page.locator(".canvas").boundingBox();
  const x = r?.x ?? 0;
  const y = r?.y ?? 0;
  await page.mouse.move(x + 220, y + 40);
  await page.mouse.down();
  await page.mouse.move(x + 260, y + 90, { steps: 5 });
  await page.mouse.up();
  expect(await selection(page)).toEqual(["a->b"]);
});

test("select all selects the shapes and the edges", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+a");
  expect((await selection(page)).sort()).toEqual(["a", "a->b", "ac", "b", "bc", "c"]);
});

test("selecting everything and dragging a shape keeps every edge joined and bent as before", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+a");
  const before = await pathOf(page, "bc");
  const r = await page.locator(".canvas").boundingBox();
  const x = r?.x ?? 0;
  const y = r?.y ?? 0;
  await page.mouse.move(x + 90, y + 65);
  await page.mouse.down();
  await page.mouse.move(x + 190, y + 105, { steps: 6 });
  await page.mouse.up();
  const after = (await pathOf(page, "bc")) ?? "";
  const shifted = (before ?? "").replace(/(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g, (_, px: string, py: string) => `${String(Number(px) + 100)} ${String(Number(py) + 40)}`);
  expect(after).toBe(shifted);
});

import { expect, test, type Page } from "@playwright/test";

// Bend points of an edge added, moved and removed in the real shell over an in-memory workspace.
const file = `diagram version=1

node a "Alpha" shape=rect
node b "Beta" shape=rect
edge a b

layout {
  a x=40 y=40 w=100 h=50
  b x=340 y=40 w=100 h=50
}
`;

interface Hooks {
  via(): { x: number; y: number }[];
  selection(): string[];
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
      via: () => shell.file?.document.layout.find((e) => e.id === "a->b")?.via ?? [],
      selection: () => shell.file?.history.selection ?? [],
      undo: () => {
        if (shell.file?.history.undo()) shell.refresh();
      },
      dirty: () => shell.file?.dirty ?? false,
    };
  }, file);
});

const via = (page: Page) => page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.via());
const dirty = (page: Page) => page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.dirty());

async function origin(page: Page): Promise<{ x: number; y: number }> {
  const r = await page.locator(".canvas").boundingBox();
  return { x: r?.x ?? 0, y: r?.y ?? 0 };
}

async function altClick(page: Page, x: number, y: number): Promise<void> {
  await page.keyboard.down("Alt");
  await page.mouse.click(x, y);
  await page.keyboard.up("Alt");
}

/** Selects the edge, then alt-clicks its path at world x, adding a bend point there. */
async function selectAndBend(page: Page, worldX: number): Promise<{ x: number; y: number }> {
  const o = await origin(page);
  await page.mouse.click(o.x + 240, o.y + 65);
  await altClick(page, o.x + worldX, o.y + 65);
  return o;
}

async function centreOf(page: Page, index: number): Promise<{ x: number; y: number }> {
  const box = await page.locator(`[data-bend="${String(index)}"]`).boundingBox();
  if (!box) throw new Error("no bend handle");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("alt-clicking the path of the selected edge adds a bend point there and shows its handle", async ({ page }) => {
  await selectAndBend(page, 200);
  expect(await via(page)).toEqual([{ x: 200, y: 65 }]);
  await expect(page.locator("[data-bend]")).toHaveCount(1);
});

test("alt-clicking an edge that is not selected only selects it", async ({ page }) => {
  const o = await origin(page);
  await altClick(page, o.x + 240, o.y + 65);
  expect(await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.selection())).toEqual(["a->b"]);
  expect(await via(page)).toEqual([]);
});

test("alt-clicking away from the path adds nothing", async ({ page }) => {
  const o = await origin(page);
  await page.mouse.click(o.x + 240, o.y + 65);
  await altClick(page, o.x + 240, o.y + 200);
  expect(await via(page)).toEqual([]);
  expect(await dirty(page)).toBe(false);
});

test("a plain click on the path of the selected edge adds nothing", async ({ page }) => {
  const o = await origin(page);
  await page.mouse.click(o.x + 240, o.y + 65);
  await page.mouse.click(o.x + 200, o.y + 65);
  expect(await via(page)).toEqual([]);
});

test("dragging a bend handle moves the point and the path follows, in one undo step", async ({ page }) => {
  const o = await selectAndBend(page, 200);
  const at = await centreOf(page, 0);
  const before = await page.locator('.elements > g[data-id="a->b"] path').getAttribute("d");
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(o.x + 240, o.y + 200, { steps: 6 });
  expect(await page.locator('.elements > g[data-id="a->b"] path').getAttribute("d")).not.toBe(before);
  await page.mouse.up();
  expect(await via(page)).toEqual([{ x: 240, y: 200 }]);
  await page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.undo(); });
  expect(await via(page)).toEqual([{ x: 200, y: 65 }]);
});

test("Escape during a bend drag leaves the point where it was", async ({ page }) => {
  const o = await selectAndBend(page, 200);
  const at = await centreOf(page, 0);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(o.x + 240, o.y + 200, { steps: 6 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await via(page)).toEqual([{ x: 200, y: 65 }]);
});

test("alt-clicking a bend handle removes the point, and removing the last leaves no bend handles", async ({ page }) => {
  await selectAndBend(page, 200);
  const at = await centreOf(page, 0);
  await altClick(page, at.x, at.y);
  expect(await via(page)).toEqual([]);
  await expect(page.locator("[data-bend]")).toHaveCount(0);
});

test("a plain click on a bend handle changes nothing", async ({ page }) => {
  await selectAndBend(page, 200);
  const at = await centreOf(page, 0);
  await page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.undo(); });
  expect(await dirty(page)).toBe(false);
  await selectAndBend(page, 200);
  await page.mouse.click(at.x, at.y);
  expect(await via(page)).toEqual([{ x: 200, y: 65 }]);
});

test("a second point added on the later half of the path goes after the first", async ({ page }) => {
  const o = await selectAndBend(page, 180);
  await altClick(page, o.x + 300, o.y + 65);
  expect(await via(page)).toEqual([{ x: 180, y: 65 }, { x: 300, y: 65 }]);
});

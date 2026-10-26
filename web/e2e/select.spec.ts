import { expect, test, type Page } from "@playwright/test";

// Selection in the real shell over an in-memory workspace.
const file = `diagram version=1

frame area "Area"
node a "Alpha" shape=rect
node b "Beta" shape=ellipse
node c "Gamma" shape=rect
edge a b

layout {
  area x=0 y=0 w=900 h=500
  a x=40 y=40 w=100 h=50
  b x=240 y=40 w=100 h=100
  c x=440 y=40 w=100 h=50 locked=#true
}
`;

interface Hooks {
  selection(): string[];
  moveAndSelect(id: string, x: number, ids: string[]): void;
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
      moveAndSelect: (id, x, ids) => {
        shell.file?.history.execute({ type: "setLayout", changes: [{ id, set: { x } }] }, { selection: ids });
        shell.refresh();
      },
    };
  }, file);
});

const selection = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.selection());

/** Screen centre of an element's drawn shape. */
async function centre(page: Page, id: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(`g[data-id="${id}"] > :first-child`).boundingBox();
  if (!box) throw new Error(`no ${id}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Screen position of a world point, with the view at identity. */
async function at(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const r = await page.locator(".canvas").boundingBox();
  return { x: (r?.x ?? 0) + x, y: (r?.y ?? 0) + y };
}

test("[T-014] clicking an element selects it and draws its outline; clicking empty canvas clears", async ({ page }) => {
  const a = await centre(page, "a");
  await page.mouse.click(a.x, a.y);
  expect(await selection(page)).toEqual(["a"]);
  await expect(page.locator('[data-id="select-a"]')).toHaveCount(1);
  const empty = await at(page, 700, 600);
  await page.mouse.click(empty.x, empty.y);
  expect(await selection(page)).toEqual([]);
  await expect(page.locator(".selection")).toHaveCount(0);
});

test("[T-014] shift-click adds to the selection and shift-clicking again removes", async ({ page }) => {
  const a = await centre(page, "a");
  const b = await centre(page, "b");
  await page.mouse.click(a.x, a.y);
  await page.keyboard.down("Shift");
  await page.mouse.click(b.x, b.y);
  expect(await selection(page)).toEqual(["a", "b"]);
  await page.mouse.click(a.x, a.y);
  await page.keyboard.up("Shift");
  expect(await selection(page)).toEqual(["b"]);
});

test("[T-014] a click on the corner of an ellipse's box misses it", async ({ page }) => {
  const corner = await at(page, 242, 42);
  await page.mouse.click(corner.x, corner.y);
  expect(await selection(page)).toEqual([]);
});

test("[T-014] the frame and the edge are not selectable", async ({ page }) => {
  const inFrame = await at(page, 600, 400);
  await page.mouse.click(inFrame.x, inFrame.y);
  expect(await selection(page)).toEqual([]);
});

test("[T-014] drag-box selects what it overlaps, shows the box while dragging and skips locked elements", async ({ page }) => {
  const from = await at(page, 100, 20);
  const to = await at(page, 560, 70);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await expect(page.locator(".marquee")).toHaveCount(1);
  expect(await selection(page)).toEqual(["a", "b"]);
  await page.mouse.up();
  await expect(page.locator(".marquee")).toHaveCount(0);
  expect(await selection(page)).toEqual(["a", "b"]);
});

test("[T-014] a shift drag-box adds to the selection", async ({ page }) => {
  const c = await centre(page, "a");
  await page.mouse.click(c.x, c.y);
  const from = await at(page, 200, 20);
  const to = await at(page, 300, 60);
  await page.keyboard.down("Shift");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  expect(await selection(page)).toEqual(["a", "b"]);
});

test("[T-014] Cmd/Ctrl+A selects every unlocked drawn element and Escape clears", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+a");
  expect(await selection(page)).toEqual(["a", "b"]);
  await page.keyboard.press("Escape");
  expect(await selection(page)).toEqual([]);
});

test("[T-014] undo restores the selection from before the command, and redo the one after", async ({ page }) => {
  const a = await centre(page, "a");
  await page.mouse.click(a.x, a.y);
  await page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.moveAndSelect("b", 300, ["b"]); });
  expect(await selection(page)).toEqual(["b"]);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await selection(page)).toEqual(["a"]);
  await expect(page.locator('[data-id="select-a"]')).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await selection(page)).toEqual(["b"]);
});

test("[T-014] selecting does not make the file unsaved", async ({ page }) => {
  const a = await centre(page, "a");
  await page.mouse.click(a.x, a.y);
  await expect(page.getByText("Unsaved changes")).toBeHidden();
});

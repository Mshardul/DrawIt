import { expect, test, type Page } from "@playwright/test";

// Grid display, snap, the status bar toggles and the snap bypass, in the real shell over an in-memory workspace.
const file = `diagram version=1

node a "Alpha" shape=rect

layout {
  a x=40 y=40 w=100 h=50
}
`;

interface Entry {
  x: number;
  y: number;
  w?: number;
  h?: number;
}
interface Hooks {
  layout(id: string): Entry | undefined;
  select(ids: string[]): void;
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
      layout: (id) => shell.file?.document.layout.find((e) => e.id === id),
      select: (ids) => {
        if (shell.file) shell.file.history.selection = ids;
        shell.refresh();
      },
    };
  }, file);
  await page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.select(["a"]); });
});

const layout = (page: Page, id: string): Promise<Entry | undefined> =>
  page.evaluate((i) => (window as unknown as { hooks: Hooks }).hooks.layout(i), id);

async function at(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const r = await page.locator(".canvas").boundingBox();
  return { x: (r?.x ?? 0) + x, y: (r?.y ?? 0) + y };
}

async function drag(page: Page, from: [number, number], to: [number, number], key?: string): Promise<void> {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  if (key) await page.keyboard.down(key);
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  if (key) await page.keyboard.up(key);
}

test("the status bar shows the zoom and has Grid, Snap and Grid size controls", async ({ page }) => {
  await expect(page.locator(".status .zoom")).toHaveText("100%");
  await expect(page.getByLabel("Grid", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Snap", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Grid size")).toHaveValue("8");
});

test("the zoom readout follows the view", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+=");
  await expect(page.locator(".status .zoom")).toHaveText("125%");
});

test("the Grid toggle draws and removes the grid, and changing the size changes the cell", async ({ page }) => {
  await expect(page.locator(".canvas pattern")).toHaveCount(0);
  await page.getByLabel("Grid", { exact: true }).check();
  await expect(page.locator(".canvas pattern")).toHaveAttribute("width", "8");
  await page.getByLabel("Grid size").selectOption("16");
  await expect(page.locator(".canvas pattern")).toHaveAttribute("width", "16");
  await page.getByLabel("Grid", { exact: true }).uncheck();
  await expect(page.locator(".canvas pattern")).toHaveCount(0);
});

test("the grid coarsens when zoomed out", async ({ page }) => {
  await page.getByLabel("Grid", { exact: true }).check();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ControlOrMeta+-");
  await expect(page.locator(".canvas pattern")).not.toHaveAttribute("width", "8");
});

test("G toggles the grid and Shift+G toggles snap", async ({ page }) => {
  await page.keyboard.press("g");
  await expect(page.getByLabel("Grid", { exact: true })).toBeChecked();
  await page.keyboard.press("Shift+G");
  await expect(page.getByLabel("Snap", { exact: true })).toBeChecked();
  await page.keyboard.press("g");
  await expect(page.getByLabel("Grid", { exact: true })).not.toBeChecked();
});

test("with snap off a drag is exact", async ({ page }) => {
  await drag(page, [90, 65], [103, 78]);
  expect(await layout(page, "a")).toMatchObject({ x: 53, y: 53 });
});

test("with snap on a drag lands the top-left corner on the grid, in one undo step", async ({ page }) => {
  await page.getByLabel("Snap", { exact: true }).check();
  await drag(page, [90, 65], [103, 78]);
  expect(await layout(page, "a")).toEqual({ id: "a", x: 56, y: 56, w: 100, h: 50 });
  await page.keyboard.press("ControlOrMeta+z");
  expect(await layout(page, "a")).toMatchObject({ x: 40, y: 40 });
});

test("the snap follows the grid size", async ({ page }) => {
  await page.getByLabel("Snap", { exact: true }).check();
  await page.getByLabel("Grid size").selectOption("16");
  await drag(page, [90, 65], [103, 78]);
  expect(await layout(page, "a")).toMatchObject({ x: 48, y: 48 });
});

test("holding Alt while dragging bypasses snap", async ({ page }) => {
  await page.getByLabel("Snap", { exact: true }).check();
  await drag(page, [90, 65], [103, 78], "Alt");
  expect(await layout(page, "a")).toMatchObject({ x: 53, y: 53 });
});

test("with snap on a resize puts the dragged edges on the grid", async ({ page }) => {
  await page.getByLabel("Snap", { exact: true }).check();
  await drag(page, [140, 90], [153, 103]);
  expect(await layout(page, "a")).toEqual({ id: "a", x: 40, y: 40, w: 112, h: 64 });
});

test("arrow-key nudge ignores snap", async ({ page }) => {
  await page.getByLabel("Snap", { exact: true }).check();
  await page.keyboard.press("ArrowRight");
  expect(await layout(page, "a")).toMatchObject({ x: 41, y: 40 });
});

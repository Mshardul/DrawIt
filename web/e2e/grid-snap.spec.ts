import { expect, test, type Page } from "@playwright/test";

// Grid display, snap, the status pill and the snap bypass, in the real shell over an in-memory workspace.
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
  prefs(): Promise<{ grid?: { show?: boolean; snap?: boolean; size?: number } }>;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/");
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { mountShell } = await load<typeof import("../src/testing/mount-shell.ts")>("/src/testing/mount-shell.ts");
    const { shell, storage } = await mountShell({ "a.drawit.kdl": text });
    shell.setView({ x: 0, y: 0, scale: 1 });
    (window as unknown as { hooks: Hooks }).hooks = {
      layout: (id) => shell.file?.document.layout.find((e) => e.id === id),
      select: (ids) => {
        if (shell.file) shell.file.history.selection = ids;
        shell.refresh();
      },
      prefs: () => storage.readPreferences(),
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

test("the status pill shows the zoom and has Grid, Snap and Grid size controls", async ({ page }) => {
  const pill = page.locator(".stage .status");
  const file = page.locator(".stage > .pill:not(.status)");
  await expect(pill.locator(".zoom")).toHaveText("100%");
  await expect(page.getByLabel("Grid", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Snap", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Grid size")).toHaveValue("8");
  const statusBox = await pill.boundingBox();
  const fileBox = await file.boundingBox();
  expect(statusBox && fileBox && statusBox.x < fileBox.x).toBe(true);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(pill.locator(".zoom")).toHaveText("125%");
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(pill.locator(".zoom")).toHaveText("100%");
});

test("the zoom readout follows the view", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+=");
  await expect(page.locator(".status .zoom")).toHaveText("125%");
});

test("the cursor readout follows the pointer in world coordinates", async ({ page }) => {
  const point = await at(page, 80, 60);
  await page.mouse.move(point.x, point.y);
  await expect(page.locator(".status .cursor")).toHaveText("80, 60");
});

test("grid and snap are kept in preferences and restored", async ({ page }) => {
  await page.getByLabel("Grid", { exact: true }).check();
  await page.getByLabel("Snap", { exact: true }).check();
  await page.getByLabel("Grid size").selectOption("32");
  await expect.poll(async () => page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.prefs())).toMatchObject({
    grid: { show: true, snap: true, size: 32 },
  });
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const storage = new MemoryStorage({ "a.drawit.kdl": text });
    await storage.patchPreferences({ grid: { show: true, snap: false, size: 16 } });
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    root.replaceChildren();
    await startShell(root, storage);
  }, file);
  await expect(page.getByLabel("Grid", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Snap", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Grid size")).toHaveValue("16");
});

test("a narrow canvas drops the cursor and a narrower one hides the pill", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await expect(page.locator(".status .zoom")).toBeVisible();
  await expect(page.locator(".status .cursor")).toBeHidden();
  await page.setViewportSize({ width: 780, height: 700 });
  await expect(page.locator(".status")).toBeHidden();
  await page.keyboard.press("ControlOrMeta+=");
  await expect(page.locator(".world")).toHaveAttribute("transform", /scale\(1\.25\)/);
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

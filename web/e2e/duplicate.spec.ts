import { expect, test, type Page } from "@playwright/test";

// Duplicate in the real shell over an in-memory workspace.
const file = `diagram version=1

node a "Alpha" shape=rect
node b "Beta" shape=rect
edge a b

layout {
  a x=40 y=40 w=100 h=50
  b x=240 y=40 w=100 h=50
}
`;

interface Hooks {
  selection(): string[];
  ids(): string[];
  select(ids: string[]): void;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
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
      ids: () => shell.file?.document.elements.map((e) => e.id) ?? [],
      select: (ids) => {
        if (shell.file) shell.file.history.selection = ids;
        shell.refresh();
      },
    };
  }, file);
});

const ids = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.ids());
const selection = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.selection());
const select = (page: Page, picked: string[]): Promise<void> =>
  page.evaluate((p) => { (window as unknown as { hooks: Hooks }).hooks.select(p); }, picked);

test("Cmd/Ctrl+D copies the selection, selects the copies and draws them; undo removes them", async ({ page }) => {
  await select(page, ["a", "b"]);
  await page.keyboard.press("ControlOrMeta+d");
  expect(await ids(page)).toEqual(["a", "b", "a->b", "rect", "rect-2", "rect->rect-2"]);
  expect(await selection(page)).toEqual(["rect", "rect-2", "rect->rect-2"]);
  await expect(page.locator('g[data-id="rect"]')).toHaveCount(1);
  await expect(page.locator('g[data-id="rect->rect-2"]')).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await ids(page)).toEqual(["a", "b", "a->b"]);
  expect(await selection(page)).toEqual(["a", "b"]);
});

test("a copy sits 16px right of and below its original", async ({ page }) => {
  await select(page, ["a"]);
  const before = await page.locator('g[data-id="a"] > :first-child').boundingBox();
  await page.keyboard.press("ControlOrMeta+d");
  const copy = await page.locator('g[data-id="rect"] > :first-child').boundingBox();
  expect((copy?.x ?? 0) - (before?.x ?? 0)).toBeCloseTo(16, 0);
  expect((copy?.y ?? 0) - (before?.y ?? 0)).toBeCloseTo(16, 0);
});

test("nothing is copied when nothing is selected", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+d");
  expect(await ids(page)).toEqual(["a", "b", "a->b"]);
});

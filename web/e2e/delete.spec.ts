import { expect, test, type Page } from "@playwright/test";

// Delete in the real shell over an in-memory workspace.
const file = `diagram version=1

node a "Alpha" shape=rect
node b "Beta" shape=rect
node c "Gamma" shape=rect
edge a b

layout {
  a x=40 y=40 w=100 h=50
  b x=240 y=40 w=100 h=50
  c x=440 y=40 w=100 h=50 locked=#true
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
    const { mountShell } = await load<typeof import("../src/testing/mount-shell.ts")>("/src/testing/mount-shell.ts");
    const { shell } = await mountShell({ "a.drawit.kdl": text });
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

for (const key of ["Delete", "Backspace"]) {
  test(`${key} removes the selection, and undo brings it and the selection back`, async ({ page }) => {
    await select(page, ["b"]);
    await page.keyboard.press(key);
    expect(await ids(page)).toEqual(["a", "c", "a->b"]);
    expect(await selection(page)).toEqual([]);
    await expect(page.locator('g[data-id="b"]')).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+z");
    expect(await ids(page)).toEqual(["a", "b", "c", "a->b"]);
    expect(await selection(page)).toEqual(["b"]);
    await expect(page.locator('g[data-id="b"]')).toHaveCount(1);
  });
}

test("an edge to a deleted element stays and is still drawn", async ({ page }) => {
  await select(page, ["b"]);
  await page.keyboard.press("Delete");
  expect(await ids(page)).toContain("a->b");
  await expect(page.locator('g[data-id="a->b"]')).toHaveCount(1);
});

test("a locked element is not deleted", async ({ page }) => {
  await select(page, ["c"]);
  await page.keyboard.press("Delete");
  expect(await ids(page)).toContain("c");
});

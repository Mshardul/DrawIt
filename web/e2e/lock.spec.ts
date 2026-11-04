import { expect, test, type Page } from "@playwright/test";

// Lock in the real shell over an in-memory workspace.
const file = `diagram version=1

node a "Alpha" shape=rect
node b "Beta" shape=rect
frame f "Frame"

layout {
  a x=40 y=40 w=100 h=50
  b x=240 y=40 w=100 h=50 locked=#true
  f x=0 y=200 w=300 h=200
}
`;

interface Hooks {
  selection(): string[];
  ids(): string[];
  x(id: string): number | undefined;
  locked(id: string): boolean;
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
      x: (id) => shell.file?.document.layout.find((e) => e.id === id)?.x,
      locked: (id) => shell.file?.document.layout.find((e) => e.id === id)?.locked === true,
      select: (ids) => {
        if (shell.file) shell.file.history.selection = ids;
        shell.refresh();
      },
    };
  }, file);
});

const hooks = <T>(page: Page, run: (h: Hooks) => T): Promise<T> =>
  page.evaluate<T>(`(${run.toString()})(window.hooks)`);
const select = (page: Page, picked: string[]): Promise<void> =>
  page.evaluate((p) => { (window as unknown as { hooks: Hooks }).hooks.select(p); }, picked);
const panel = (page: Page) => page.getByRole("complementary", { name: "Style" });
const lockBox = (page: Page) => panel(page).getByLabel("Locked", { exact: true });

test("Cmd/Ctrl+Shift+L locks the selection, which then ignores nudge and delete; pressing it again unlocks", async ({ page }) => {
  await select(page, ["a"]);
  await page.keyboard.press("ControlOrMeta+Shift+l");
  expect(await hooks(page, (h) => h.locked("a"))).toBe(true);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Delete");
  expect(await hooks(page, (h) => h.x("a"))).toBe(40);
  expect(await hooks(page, (h) => h.ids())).toContain("a");
  await page.keyboard.press("ControlOrMeta+Shift+l");
  expect(await hooks(page, (h) => h.locked("a"))).toBe(false);
  await page.keyboard.press("ArrowRight");
  expect(await hooks(page, (h) => h.x("a"))).toBe(41);
});

test("the panel shows the lock state, and its checkbox locks and unlocks; undo restores", async ({ page }) => {
  await select(page, ["a"]);
  await expect(lockBox(page)).not.toBeChecked();
  await lockBox(page).check();
  expect(await hooks(page, (h) => h.locked("a"))).toBe(true);
  await expect(lockBox(page)).toBeChecked();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await hooks(page, (h) => h.locked("a"))).toBe(false);
  await expect(lockBox(page)).not.toBeChecked();
});

test("a locked element can still be clicked, and its style fields are disabled", async ({ page }) => {
  const box = await page.locator('g[data-id="b"] > :first-child').boundingBox();
  if (!box) throw new Error("no b");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await hooks(page, (h) => h.selection())).toEqual(["b"]);
  await expect(lockBox(page)).toBeChecked();
  await expect(panel(page).getByLabel("fill", { exact: true })).toBeDisabled();
});

test("a selection of locked and unlocked elements shows the lock as mixed, and one toggle locks all", async ({ page }) => {
  await select(page, ["a", "b"]);
  expect(await lockBox(page).evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true);
  await lockBox(page).click();
  expect(await hooks(page, (h) => h.locked("a") && h.locked("b"))).toBe(true);
});

test("a frame, which has no style fields, still shows the lock", async ({ page }) => {
  await select(page, ["f"]);
  await expect(panel(page)).toBeVisible();
  await expect(lockBox(page)).not.toBeChecked();
});

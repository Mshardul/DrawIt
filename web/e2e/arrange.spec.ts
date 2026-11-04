import { expect, test, type Page } from "@playwright/test";

// The Arrange group of the right panel in the real shell over an in-memory workspace.
const file = `diagram version=1

node a "Alpha" shape=rect
node b "Beta" shape=rect
node c "Gamma" shape=rect

layout {
  a x=40 y=40 w=100 h=50
  b x=240 y=100 w=100 h=50
  c x=700 y=200 w=100 h=50
}
`;

interface Hooks {
  order(): string[];
  x(id: string): number | undefined;
  y(id: string): number | undefined;
  select(ids: string[]): void;
  undo(): void;
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
      order: () => shell.file?.document.layout.map((e) => e.id) ?? [],
      x: (id) => shell.file?.document.layout.find((e) => e.id === id)?.x,
      y: (id) => shell.file?.document.layout.find((e) => e.id === id)?.y,
      select: (ids) => {
        if (shell.file) shell.file.history.selection = ids;
        shell.refresh();
      },
      undo: () => {
        shell.file?.history.undo();
        shell.refresh();
      },
    };
  }, file);
});

const hooks = <T>(page: Page, run: (h: Hooks) => T): Promise<T> =>
  page.evaluate<T>(`(${run.toString()})(window.hooks)`);
const select = (page: Page, picked: string[]): Promise<void> =>
  page.evaluate((p) => { (window as unknown as { hooks: Hooks }).hooks.select(p); }, picked);
const group = (page: Page) => page.getByRole("group", { name: "Arrange" });
const button = (page: Page, name: string) => group(page).getByRole("button", { name, exact: true });

test("every button is disabled for a single element", async ({ page }) => {
  await select(page, ["a"]);
  for (const name of ["Align left", "Align centre", "Align right", "Align top", "Align middle", "Align bottom", "Distribute horizontally", "Distribute vertically"]) {
    await expect(button(page, name)).toBeDisabled();
  }
});

test("Align left moves the selection to the left edge as one undo step", async ({ page }) => {
  await select(page, ["a", "b"]);
  await expect(button(page, "Align left")).toBeEnabled();
  await expect(button(page, "Distribute horizontally")).toBeDisabled();
  await button(page, "Align left").click();
  expect(await hooks(page, (h) => [h.x("a"), h.x("b")])).toEqual([40, 40]);
  await expect(button(page, "Align left")).toBeDisabled();
  await hooks(page, (h) => { h.undo(); });
  expect(await hooks(page, (h) => h.x("b"))).toBe(240);
});

test("Distribute horizontally spaces three elements equally", async ({ page }) => {
  await select(page, ["a", "b", "c"]);
  await button(page, "Distribute horizontally").click();
  expect(await hooks(page, (h) => h.x("b"))).toBe(370);
});

test("Bring to front and Send to back are disabled when they would change nothing", async ({ page }) => {
  await select(page, ["c"]);
  await expect(button(page, "Bring to front")).toBeDisabled();
  await expect(button(page, "Send to back")).toBeEnabled();
  await select(page, ["a"]);
  await expect(button(page, "Bring to front")).toBeEnabled();
  await expect(button(page, "Send to back")).toBeDisabled();
});

test("Bring to front and Send to back reorder the selection as one undo step each", async ({ page }) => {
  await select(page, ["a"]);
  await button(page, "Bring to front").click();
  expect(await hooks(page, (h) => h.order())).toEqual(["b", "c", "a"]);
  await expect(button(page, "Bring to front")).toBeDisabled();
  await hooks(page, (h) => { h.undo(); });
  expect(await hooks(page, (h) => h.order())).toEqual(["a", "b", "c"]);
  await select(page, ["b"]);
  await button(page, "Send to back").click();
  expect(await hooks(page, (h) => h.order())).toEqual(["b", "a", "c"]);
  await hooks(page, (h) => { h.undo(); });
  expect(await hooks(page, (h) => h.order())).toEqual(["a", "b", "c"]);
});

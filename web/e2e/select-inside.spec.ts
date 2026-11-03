import { expect, test, type Page } from "@playwright/test";

// Select inside in the real shell over an in-memory workspace.
const file = `diagram version=1

node box "Box" shape=rect
node a "Alpha" shape=rect
node b "Beta" shape=rect
node out "Outside" shape=rect
edge a b

layout {
  box x=0 y=0 w=400 h=300
  a x=40 y=40 w=100 h=50
  b x=240 y=40 w=100 h=50
  out x=500 y=40 w=100 h=50
}
`;

interface Hooks {
  selection(): string[];
  x(id: string): number | undefined;
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
      x: (id) => shell.file?.document.layout.find((e) => e.id === id)?.x,
      select: (ids) => {
        if (shell.file) shell.file.history.selection = ids;
        shell.refresh();
      },
    };
  }, file);
});

const hooks = <T>(page: Page, run: (h: Hooks) => T): Promise<T> => page.evaluate<T>(`(${run.toString()})(window.hooks)`);
const select = (page: Page, picked: string[]): Promise<void> =>
  page.evaluate((p) => { (window as unknown as { hooks: Hooks }).hooks.select(p); }, picked);

test("Cmd/Ctrl+Shift+A adds what lies inside the selected shape, and a nudge then moves the container with its contents", async ({ page }) => {
  await select(page, ["box"]);
  await page.keyboard.press("ControlOrMeta+Shift+a");
  expect(await hooks(page, (h) => h.selection())).toEqual(["box", "a", "b", "a->b"]);
  await expect(page.locator('[data-id="select-a"]')).toHaveCount(1);
  await page.keyboard.press("ArrowRight");
  expect(await hooks(page, (h) => [h.x("box"), h.x("a"), h.x("b"), h.x("out")])).toEqual([1, 41, 241, 500]);
});

test("nothing changes when the selection holds nothing", async ({ page }) => {
  await select(page, ["out"]);
  await page.keyboard.press("ControlOrMeta+Shift+a");
  expect(await hooks(page, (h) => h.selection())).toEqual(["out"]);
});

import { expect, test, type Page } from "@playwright/test";

// Panel edges in the real shell: a drag is kept, a double-click restores the default, a short window shrinks both panels.
const file = `diagram version=1

node a "Alpha" shape=rect

layout {
  a x=40 y=40 w=100 h=50
}
`;

interface Hooks {
  select(ids: string[]): void;
  prefs(): Promise<{ panels?: { library?: number; properties?: number; libraryShown?: boolean; propertiesShown?: boolean } }>;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { mountShell } = await load<typeof import("../src/testing/mount-shell.ts")>("/src/testing/mount-shell.ts");
    const { shell, storage } = await mountShell({ "a.drawit.kdl": text });
    (window as unknown as { hooks: Hooks }).hooks = {
      select: (ids) => {
        if (shell.file) shell.file.history.selection = ids;
        shell.refresh();
      },
      prefs: () => storage.readPreferences(),
    };
  }, file);
});

const prefs = (page: Page) => page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.prefs());
const select = (page: Page) => page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.select(["a"]); });
const library = (page: Page) => page.getByRole("complementary", { name: "Shapes" });
const properties = (page: Page) => page.getByRole("complementary", { name: "Style" });
const widthOf = async (locator: ReturnType<Page["locator"]>) => (await locator.boundingBox())?.width ?? 0;

test("dragging a panel edge sets its width, and a double-click restores it", async ({ page }) => {
  await select(page);
  const edge = page.getByRole("separator", { name: "Library width" });
  const box = await edge.boundingBox();
  if (!box) throw new Error("no library edge");
  const x = box.x + box.width / 2;
  const y = box.y + 80;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(edge).toHaveClass(/\bon\b/);
  await page.mouse.move(x + 80, y, { steps: 4 });
  await page.mouse.up();
  await expect(edge).not.toHaveClass(/\bon\b/);
  expect(await widthOf(library(page))).toBeCloseTo(304, 0);
  expect((await prefs(page)).panels?.library).toBe(304);
  await edge.dblclick();
  expect(await widthOf(library(page))).toBeCloseTo(224, 0);
  expect((await prefs(page)).panels).toMatchObject({ library: 224, properties: 200, libraryShown: true, propertiesShown: true });

  const propEdge = page.getByRole("separator", { name: "Properties width" });
  const propBox = await propEdge.boundingBox();
  if (!propBox) throw new Error("no properties edge");
  const px = propBox.x + propBox.width / 2;
  const py = propBox.y + 80;
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.move(px - 40, py, { steps: 4 });
  await page.mouse.up();
  expect(await widthOf(properties(page))).toBeCloseTo(240, 0);
  expect((await prefs(page)).panels?.properties).toBe(240);
});

test("a narrower window shrinks the panels before the canvas, and widening restores the stored widths", async ({ page }) => {
  await select(page);
  expect(await widthOf(library(page))).toBeCloseTo(224, 0);
  expect(await widthOf(properties(page))).toBeCloseTo(200, 0);
  await page.setViewportSize({ width: 800, height: 800 });
  expect(await widthOf(library(page))).toBeCloseTo(180, 0);
  expect(await widthOf(properties(page))).toBeCloseTo(180, 0);
  const stage = await page.locator(".stage").boundingBox();
  expect(stage?.width ?? 0).toBeLessThan(480);
  expect((await prefs(page)).panels).toBeUndefined();
  await page.setViewportSize({ width: 1200, height: 800 });
  expect(await widthOf(library(page))).toBeCloseTo(224, 0);
  expect(await widthOf(properties(page))).toBeCloseTo(200, 0);
});

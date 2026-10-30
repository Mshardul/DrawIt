import { expect, test, type Page } from "@playwright/test";

// The shape library sidebar and the shape tool in the real shell over an in-memory workspace.
const file = `diagram version=1

node a "Alpha" shape=rect

layout {
  a x=40 y=40 w=100 h=50
}
`;

interface Hooks {
  nodes(): { id: string; shape: string }[];
  layout(id: string): { x: number; y: number; w?: number; h?: number } | undefined;
  selection(): string[];
  undo(): void;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const shell = await startShell(document.getElementById("app") as HTMLElement, new MemoryStorage({ "a.drawit.kdl": text }));
    (window as unknown as { hooks: Hooks }).hooks = {
      nodes: () => (shell.file?.document.elements ?? []).flatMap((e) => (e.kind === "node" ? [{ id: e.id, shape: e.shape }] : [])),
      layout: (id) => shell.file?.document.layout.find((l) => l.id === id),
      selection: () => shell.file?.history.selection ?? [],
      undo: () => {
        shell.file?.history.undo();
        shell.refresh();
      },
    };
  }, file);
});

const nodes = (page: Page) => page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.nodes());
const layout = (page: Page, id: string) => page.evaluate((i) => (window as unknown as { hooks: Hooks }).hooks.layout(i), id);
const selection = (page: Page) => page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.selection());
const undo = (page: Page) => page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.undo(); });
const library = (page: Page) => page.getByRole("complementary", { name: "Shapes" });
const item = (page: Page, name: string) => library(page).getByRole("button", { name, exact: true });
const canvas = (page: Page) => page.locator(".canvas");

test("the sidebar lists the built-in shapes and the pack shapes by category", async ({ page }) => {
  await expect(library(page).getByRole("heading", { name: "Basic" })).toBeVisible();
  await expect(item(page, "Rectangle")).toBeVisible();
  await expect(item(page, "Ellipse")).toBeVisible();
  await expect(item(page, "Rounded rectangle")).toBeVisible();
});

test("a preview is drawn for a visible entry", async ({ page }) => {
  await expect(item(page, "Rounded rectangle").locator("svg path").first()).toBeAttached();
  await expect(item(page, "Rectangle").locator("svg rect").first()).toBeAttached();
});

test("previews are large enough to read, and their strokes keep one width however far the shape is scaled down", async ({ page }) => {
  const preview = item(page, "Rounded rectangle").locator("svg");
  const box = await preview.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(72);
  expect(box?.height).toBeGreaterThanOrEqual(52);
  const part = item(page, "Rounded rectangle").locator("svg path").first();
  await expect(part).toBeAttached();
  expect(await part.evaluate((el) => getComputedStyle(el).vectorEffect)).toBe("non-scaling-stroke");
});

test("search narrows the list by name and tag, and says when nothing matches", async ({ page }) => {
  const search = library(page).getByRole("searchbox", { name: "Search shapes" });
  await search.fill("oval");
  await expect(item(page, "Ellipse")).toBeVisible();
  await expect(item(page, "Rectangle")).toBeHidden();
  await search.fill("zzzz");
  await expect(library(page).getByText("No shapes match.")).toBeVisible();
});

test("a click on the canvas places the armed shape at its size, selects it and ends the tool", async ({ page }) => {
  await item(page, "Rounded rectangle").click();
  await expect(item(page, "Rounded rectangle")).toHaveAttribute("aria-pressed", "true");
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.click(box.x + 400, box.y + 300);
  const placedNodes = await nodes(page);
  expect(placedNodes.at(-1)).toEqual({ id: "rounded-rect", shape: "core.rounded-rect" });
  const placed = await layout(page, "rounded-rect");
  expect(placed).toMatchObject({ w: 160, h: 80 });
  expect(await selection(page)).toEqual(["rounded-rect"]);
  await expect(item(page, "Rounded rectangle")).toHaveAttribute("aria-pressed", "false");
  await page.mouse.click(box.x + 700, box.y + 500);
  expect((await nodes(page)).length).toBe(2);
});

test("a drag sizes the shape, and undo removes it in one step", async ({ page }) => {
  await item(page, "Ellipse").click();
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 380, { steps: 5 });
  await page.mouse.up();
  const placed = await layout(page, "ellipse");
  expect(placed?.w).toBeGreaterThan(100);
  expect(placed?.h).toBeGreaterThan(60);
  await undo(page);
  expect((await nodes(page)).map((n) => n.id)).toEqual(["a"]);
});

test("Escape and a second click on the armed entry disarm the tool", async ({ page }) => {
  await item(page, "Rectangle").click();
  await page.keyboard.press("Escape");
  await expect(item(page, "Rectangle")).toHaveAttribute("aria-pressed", "false");
  await item(page, "Rectangle").click();
  await item(page, "Rectangle").click();
  await expect(item(page, "Rectangle")).toHaveAttribute("aria-pressed", "false");
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.click(box.x + 400, box.y + 300);
  expect((await nodes(page)).length).toBe(1);
});

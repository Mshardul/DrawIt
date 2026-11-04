import { expect, test, type Page } from "@playwright/test";

// Frames in the real shell over an in-memory workspace.
const file = `diagram version=1

frame area "Overview"
node a "Alpha" shape=rect

layout {
  area x=100 y=100 w=400 h=300
  a x=150 y=150 w=100 h=50
}
`;

interface Hooks {
  selection(): string[];
  layout(id: string): { x: number; y: number; w?: number; h?: number } | undefined;
  edges(): { from: string | null; to: string | null }[];
  frames(): { id: string; name?: string }[];
  undo(): void;
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
      layout: (id) => shell.file?.document.layout.find((e) => e.id === id),
      frames: () => (shell.file?.document.elements ?? []).flatMap((e) => (e.kind === "frame" ? [{ id: e.id, ...(e.name !== undefined && { name: e.name }) }] : [])),
      undo: () => {
        shell.file?.history.undo();
        shell.refresh();
      },
      edges: () => (shell.file?.document.elements ?? []).flatMap((e) => (e.kind === "edge" ? [{ from: e.from, to: e.to }] : [])),
    };
  }, file);
});

const selection = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.selection());
const layout = (page: Page, id: string) =>
  page.evaluate((i) => (window as unknown as { hooks: Hooks }).hooks.layout(i), id);

async function at(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const r = await page.locator(".canvas").boundingBox();
  return { x: (r?.x ?? 0) + x, y: (r?.y ?? 0) + y };
}

test("a frame is drawn as an outline with its name above the top left", async ({ page }) => {
  await expect(page.locator('g[data-id="area"] rect')).toHaveCount(1);
  await expect(page.locator('g[data-id="area"] text')).toHaveText("Overview");
  expect(Number(await page.locator('g[data-id="area"] text').getAttribute("y"))).toBeLessThan(0);
  expect(await page.locator('g[data-id="area"]').getAttribute("transform")).toBe("translate(100 100)");
});

test("clicking inside the frame does not select it, clicking its outline or name does", async ({ page }) => {
  const inside = await at(page, 400, 300);
  await page.mouse.click(inside.x, inside.y);
  expect(await selection(page)).toEqual([]);
  const outline = await at(page, 100, 250);
  await page.mouse.click(outline.x, outline.y);
  expect(await selection(page)).toEqual(["area"]);
  const empty = await at(page, 800, 600);
  await page.mouse.click(empty.x, empty.y);
  const name = await at(page, 120, 88);
  await page.mouse.click(name.x, name.y);
  expect(await selection(page)).toEqual(["area"]);
});

test("a shape inside the frame stays clickable", async ({ page }) => {
  const p = await at(page, 200, 175);
  await page.mouse.click(p.x, p.y);
  expect(await selection(page)).toEqual(["a"]);
});

test("dragging the outline moves the frame as one step, and its handles resize it", async ({ page }) => {
  const from = await at(page, 100, 250);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 50, from.y + 30, { steps: 5 });
  await page.mouse.up();
  expect(await layout(page, "area")).toMatchObject({ x: 150, y: 130 });
  const handle = page.locator('[data-handle="se"]');
  const box = await handle.boundingBox();
  if (!box) throw new Error("no handle");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  expect(await layout(page, "area")).toMatchObject({ w: 440, h: 320 });
});

test("a frame is not attached to by a drawn line", async ({ page }) => {
  await page.keyboard.press("l");
  const start = await at(page, 200, 175);
  const end = await at(page, 100, 250);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
  const edges = await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.edges());
  expect(edges).toEqual([{ from: "a", to: null }]);
});

const frames = (page: Page) => page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.frames());

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const a = await at(page, from.x, from.y);
  const b = await at(page, to.x, to.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

test("the Frame tool draws a frame by dragging, selects it, opens its name for typing and goes back to Select", async ({ page }) => {
  const tool = page.getByRole("button", { name: "Frame", exact: true });
  await tool.click();
  await expect(tool).toHaveAttribute("aria-pressed", "true");
  await drag(page, { x: 600, y: 100 }, { x: 800, y: 250 });
  expect(await layout(page, "frame")).toMatchObject({ x: 600, y: 100, w: 200, h: 150 });
  expect(await selection(page)).toEqual(["frame"]);
  await expect(tool).toHaveAttribute("aria-pressed", "false");
  const editor = page.locator("textarea.text-edit");
  await expect(editor).toBeFocused();
  await page.keyboard.type("Group");
  await page.keyboard.press("Enter");
  await expect(editor).toHaveCount(0);
  expect((await frames(page)).find((f) => f.id === "frame")).toEqual({ id: "frame", name: "Group" });
  await expect(page.locator('g[data-id="frame"] text')).toHaveText("Group");
});

test("a frame left without a name is kept, and drawing it is one undo step", async ({ page }) => {
  await page.keyboard.press("f");
  await drag(page, { x: 600, y: 100 }, { x: 800, y: 250 });
  await page.keyboard.press("Escape");
  await expect(page.locator("textarea.text-edit")).toHaveCount(0);
  expect((await frames(page)).map((f) => f.id)).toEqual(["area", "frame"]);
  await page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.undo(); });
  expect((await frames(page)).map((f) => f.id)).toEqual(["area"]);
});

test("Escape leaves the Frame tool without drawing", async ({ page }) => {
  await page.keyboard.press("f");
  await expect(page.getByRole("button", { name: "Frame", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Frame", exact: true })).toHaveAttribute("aria-pressed", "false");
  expect((await frames(page)).map((f) => f.id)).toEqual(["area"]);
});

test("double-clicking a frame's name renames it", async ({ page }) => {
  const name = await at(page, 120, 88);
  await page.mouse.dblclick(name.x, name.y);
  const editor = page.locator("textarea.text-edit");
  await expect(editor).toBeFocused();
  await page.keyboard.type("Renamed");
  await page.keyboard.press("Enter");
  expect((await frames(page))[0]).toEqual({ id: "area", name: "Renamed" });
});

test("emptying a frame's name removes it from the file", async ({ page }) => {
  const name = await at(page, 120, 88);
  await page.mouse.dblclick(name.x, name.y);
  await page.keyboard.press("Delete");
  await page.keyboard.press("Enter");
  expect((await frames(page))[0]).toEqual({ id: "area" });
});

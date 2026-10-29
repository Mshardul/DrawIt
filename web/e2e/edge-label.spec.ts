import { expect, test, type Page } from "@playwright/test";

// Edge labels drawn, edited and dragged along their path in the real shell over an in-memory workspace.
const file = `diagram version=1

node a "Alpha" shape=rect
node b "Beta" shape=rect
node c "Gamma" shape=rect
edge a b label="Hi"
edge b c id=plain

layout {
  a x=40 y=40 w=100 h=50
  b x=340 y=40 w=100 h=50
  c x=340 y=300 w=100 h=50
}
`;

interface Hooks {
  label(id: string): string | undefined;
  labelAt(id: string): number | undefined;
  undo(): void;
  dirty(): boolean;
  moveAndRefresh(id: string, x: number, y: number): void;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto("/");
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const shell = await startShell(document.getElementById("app") as HTMLElement, new MemoryStorage({ "a.drawit.kdl": text }));
    shell.setView({ x: 0, y: 0, scale: 1 });
    (window as unknown as { hooks: Hooks }).hooks = {
      label: (id) => {
        const e = shell.file?.document.elements.find((x) => x.id === id);
        return e?.kind === "edge" ? e.label : undefined;
      },
      labelAt: (id) => shell.file?.document.layout.find((x) => x.id === id)?.labelAt,
      undo: () => {
        if (shell.file?.history.undo()) shell.refresh();
      },
      dirty: () => shell.file?.dirty ?? false,
      moveAndRefresh: (id, x, y) => {
        shell.file?.history.execute({ type: "setLayout", changes: [{ id, set: { x, y } }] });
        shell.refresh();
      },
    };
  }, file);
});

const label = (page: Page, id: string) => page.evaluate((i) => (window as unknown as { hooks: Hooks }).hooks.label(i), id);
const labelAt = (page: Page, id: string) => page.evaluate((i) => (window as unknown as { hooks: Hooks }).hooks.labelAt(i), id);
const undo = (page: Page) => page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.undo(); });
const drawnText = (page: Page, id: string) => page.locator(`.elements > g[data-id="${id}"] text`);

async function origin(page: Page): Promise<{ x: number; y: number }> {
  const r = await page.locator(".canvas").boundingBox();
  return { x: r?.x ?? 0, y: r?.y ?? 0 };
}

/** Where the first line of a label is drawn, in world coordinates: the view is the identity. Read from the attributes, since the pixel box of SVG text differs between engines. */
async function textAt(page: Page, id: string): Promise<{ x: number; y: number }> {
  const first = drawnText(page, id).first();
  return { x: Number(await first.getAttribute("x")), y: Number(await first.getAttribute("y")) };
}

test("a label is drawn centred on the middle of its edge's path, and an edge without one has no text", async ({ page }) => {
  await expect(drawnText(page, "a->b")).toHaveText("Hi");
  expect(await textAt(page, "a->b")).toEqual({ x: 240, y: 65 });
  await expect(drawnText(page, "plain")).toHaveCount(0);
});

test("the label moves with the path when a shape moves", async ({ page }) => {
  const before = await textAt(page, "a->b");
  await page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.moveAndRefresh("b", 340, 240); });
  expect((await textAt(page, "a->b")).y).toBeGreaterThan(before.y + 40);
});

test("re-routing an edge moves its drawn label in place instead of rebuilding its nodes", async ({ page }) => {
  await page.evaluate(() => {
    const g = document.querySelector('.elements > g[data-id="a->b"]');
    for (const node of g?.querySelectorAll("path, rect, text") ?? []) (node as unknown as { kept: boolean }).kept = true;
  });
  const before = await textAt(page, "a->b");
  await page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.moveAndRefresh("b", 340, 240); });
  expect((await textAt(page, "a->b")).y).toBeGreaterThan(before.y + 40);
  const kept = await page.evaluate(() =>
    [...(document.querySelector('.elements > g[data-id="a->b"]')?.querySelectorAll("path, rect, text") ?? [])].map((n) => (n as unknown as { kept?: boolean }).kept === true),
  );
  expect(kept).toEqual([true, true, true]);
});

test("clicking the label selects the edge", async ({ page }) => {
  const o = await origin(page);
  await page.mouse.click(o.x + 240, o.y + 58);
  await expect(page.locator('[data-id="select-a->b"]')).toHaveCount(1);
});

test("double-clicking an edge edits its label in place, and the typing is one undo step", async ({ page }) => {
  const o = await origin(page);
  await page.mouse.dblclick(o.x + 190, o.y + 65);
  const editor = page.locator(".text-edit");
  await expect(editor).toHaveValue("Hi");
  await page.keyboard.type("Hello there");
  expect(await label(page, "a->b")).toBe("Hello there");
  await page.keyboard.press("Escape");
  await undo(page);
  expect(await label(page, "a->b")).toBe("Hi");
});

test("double-clicking an edge with no label starts an empty label, and typing adds it", async ({ page }) => {
  const o = await origin(page);
  await page.mouse.dblclick(o.x + 390, o.y + 200);
  await expect(page.locator(".text-edit")).toHaveValue("");
  await page.keyboard.type("yes");
  await page.keyboard.press("Escape");
  expect(await label(page, "plain")).toBe("yes");
  await expect(drawnText(page, "plain")).toHaveText("yes");
});

test("a label left empty, or emptied, is removed", async ({ page }) => {
  const o = await origin(page);
  await page.mouse.dblclick(o.x + 390, o.y + 200);
  await page.keyboard.press("Escape");
  expect(await label(page, "plain")).toBeUndefined();
  expect(await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.dirty())).toBe(false);
  await page.mouse.dblclick(o.x + 190, o.y + 65);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Escape");
  expect(await label(page, "a->b")).toBeUndefined();
  await expect(drawnText(page, "a->b")).toHaveCount(0);
});

test("dragging the label of the selected edge moves it along the path, in one undo step", async ({ page }) => {
  const o = await origin(page);
  await page.mouse.click(o.x + 190, o.y + 65);
  const grip = await page.locator("[data-label]").boundingBox();
  if (!grip) throw new Error("no label grip");
  const at = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(o.x + 190, o.y + 120, { steps: 6 });
  expect((await textAt(page, "a->b")).x).toBe(190);
  await page.mouse.up();
  expect(await labelAt(page, "a->b")).toBe(0.25);
  await undo(page);
  expect(await labelAt(page, "a->b")).toBeUndefined();
});

test("Escape during a label drag leaves the label where it was", async ({ page }) => {
  const o = await origin(page);
  await page.mouse.click(o.x + 190, o.y + 65);
  const grip = await page.locator("[data-label]").boundingBox();
  if (!grip) throw new Error("no label grip");
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(o.x + 190, o.y + 120, { steps: 6 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await labelAt(page, "a->b")).toBeUndefined();
  expect(await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.dirty())).toBe(false);
});

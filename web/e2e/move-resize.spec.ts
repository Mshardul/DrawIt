import { expect, test, type Page } from "@playwright/test";

// Move, resize and nudge in the real shell over an in-memory workspace.
const file = `diagram version=1

node a "Alpha" shape=rect
node b "Beta" shape=ellipse
node c "Gamma" shape=rect
text note "Note"

layout {
  a x=40 y=40 w=100 h=50
  b x=240 y=40
  c x=440 y=40 w=100 h=50 locked=#true
  note x=40 y=300 w=120
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
  selection(): string[];
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
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
      layout: (id) => shell.file?.document.layout.find((e) => e.id === id),
      select: (ids) => {
        if (shell.file) shell.file.history.selection = ids;
        shell.refresh();
      },
      selection: () => shell.file?.history.selection ?? [],
    };
  }, file);
});

const layout = (page: Page, id: string): Promise<Entry | undefined> =>
  page.evaluate((i) => (window as unknown as { hooks: Hooks }).hooks.layout(i), id);
const select = (page: Page, ids: string[]): Promise<void> =>
  page.evaluate((i) => { (window as unknown as { hooks: Hooks }).hooks.select(i); }, ids);

/** Screen position of a world point, with the view at identity. */
async function at(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const r = await page.locator(".canvas").boundingBox();
  return { x: (r?.x ?? 0) + x, y: (r?.y ?? 0) + y };
}

async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}

test("[T-015] dragging an element moves it, and the whole drag is one undo step", async ({ page }) => {
  await drag(page, [90, 65], [150, 95]);
  expect(await layout(page, "a")).toEqual({ id: "a", x: 100, y: 70, w: 100, h: 50 });
  await expect(page.locator('g[data-id="a"]')).toHaveAttribute("transform", "translate(100 70)");
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await layout(page, "a")).toMatchObject({ x: 40, y: 40 });
  await expect(page.getByText("Unsaved changes")).toBeHidden();
});

test("[T-015] the file and history are untouched until release; the screen follows the pointer", async ({ page }) => {
  const start = await at(page, 90, 65);
  const end = await at(page, 190, 65);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  expect(await layout(page, "a")).toMatchObject({ x: 40, y: 40 });
  await expect(page.locator('g[data-id="a"]')).toHaveAttribute("transform", "translate(140 40)");
  await expect(page.getByText("Unsaved changes")).toBeHidden();
  await page.mouse.up();
  expect(await layout(page, "a")).toMatchObject({ x: 140, y: 40 });
});

test("[T-015] Escape during a drag cancels it", async ({ page }) => {
  const start = await at(page, 90, 65);
  const end = await at(page, 190, 65);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await layout(page, "a")).toMatchObject({ x: 40, y: 40 });
  await expect(page.locator('g[data-id="a"]')).toHaveAttribute("transform", "translate(40 40)");
  await expect(page.getByText("Unsaved changes")).toBeHidden();
});

test("[T-015] a click without dragging changes nothing", async ({ page }) => {
  const p = await at(page, 90, 65);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByText("Unsaved changes")).toBeHidden();
});

test("[T-015] a multi-selection moves together, keeps the selection, and skips locked elements", async ({ page }) => {
  await select(page, ["a", "b", "c"]);
  await drag(page, [90, 65], [90, 105]);
  expect(await layout(page, "a")).toMatchObject({ x: 40, y: 80 });
  expect(await layout(page, "b")).toMatchObject({ x: 240, y: 80 });
  expect(await layout(page, "c")).toMatchObject({ x: 440, y: 40 });
  expect(await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.selection())).toEqual(["a", "b", "c"]);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await layout(page, "b")).toMatchObject({ y: 40 });
});

test("[T-015] the south-east handle resizes, and the opposite corner stays", async ({ page }) => {
  await select(page, ["a"]);
  await drag(page, [140, 90], [180, 130]);
  expect(await layout(page, "a")).toEqual({ id: "a", x: 40, y: 40, w: 140, h: 90 });
  await page.keyboard.press("ControlOrMeta+z");
  expect(await layout(page, "a")).toMatchObject({ w: 100, h: 50 });
});

test("[T-015] resizing stops at the minimum size", async ({ page }) => {
  await select(page, ["a"]);
  await drag(page, [140, 90], [0, 0]);
  expect(await layout(page, "a")).toMatchObject({ x: 40, y: 40, w: 8, h: 8 });
});

test("[T-015] resizing an element with no w and h writes both from its default size", async ({ page }) => {
  await select(page, ["b"]);
  await drag(page, [400, 120], [420, 130]);
  expect(await layout(page, "b")).toEqual({ id: "b", x: 240, y: 40, w: 180, h: 90 });
});

test("[T-015] a text box shows only east and west handles, and resizes its width", async ({ page }) => {
  await select(page, ["note"]);
  await expect(page.locator(".handle")).toHaveCount(2);
  await drag(page, [160, 312], [200, 330]);
  const entry = await layout(page, "note");
  expect(entry).toMatchObject({ x: 40, y: 300, w: 160 });
  expect(entry?.h).toBeUndefined();
});

test("[T-015] a locked element or several selected show no handles", async ({ page }) => {
  await select(page, ["c"]);
  await expect(page.locator(".handle")).toHaveCount(0);
  await select(page, ["a", "b"]);
  await expect(page.locator(".handle")).toHaveCount(0);
  await select(page, ["a"]);
  await expect(page.locator(".handle")).toHaveCount(8);
});

test("[T-015] arrow keys nudge 1px and shift-arrow 10px, and quick nudges undo as one step", async ({ page }) => {
  await select(page, ["a"]);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  expect(await layout(page, "a")).toMatchObject({ x: 42, y: 50 });
  await page.keyboard.press("ControlOrMeta+z");
  expect(await layout(page, "a")).toMatchObject({ x: 40, y: 40 });
});

test("[T-015] nudging does nothing without a selection and skips locked elements", async ({ page }) => {
  await page.keyboard.press("ArrowRight");
  await select(page, ["c"]);
  await page.keyboard.press("ArrowRight");
  expect(await layout(page, "c")).toMatchObject({ x: 440 });
  await expect(page.getByText("Unsaved changes")).toBeHidden();
});

test("[T-015] dragging 100 selected elements of a 500-element file stays inside the frame budget", async ({ page }) => {
  await page.evaluate(async () => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { generateDiagram } = await load<typeof import("../src/testing/generate-diagram.ts")>("/src/testing/generate-diagram.ts");
    const { writeDiagram } = await load<typeof import("../src/kdl/write.ts")>("/src/kdl/write.ts");
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const doc = generateDiagram({ count: 500 });
    const shell = await startShell(
      document.getElementById("app") as HTMLElement,
      new MemoryStorage({ "big.drawit.kdl": writeDiagram(doc) }),
    );
    shell.setView({ x: 0, y: 0, scale: 1 });
    const ids = doc.layout.filter((e) => doc.elements.find((x) => x.id === e.id)?.kind === "node").slice(0, 100).map((e) => e.id);
    if (shell.file) shell.file.history.selection = ids;
    shell.refresh();
    const first = doc.layout.find((e) => e.id === ids[0]);
    const times: number[] = [];
    let t0 = 0;
    addEventListener("pointermove", () => { t0 = performance.now(); }, true);
    addEventListener("pointermove", () => { times.push(performance.now() - t0); });
    (window as unknown as { times: number[]; first: unknown }).times = times;
    (window as unknown as { first: unknown }).first = first;
  });
  const first = await page.evaluate(() => (window as unknown as { first: { x: number; y: number } }).first);
  const start = await at(page, first.x + 10, first.y + 10);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 200, start.y + 100, { steps: 60 });
  await page.mouse.up();
  const times = await page.evaluate(() => (window as unknown as { times: number[] }).times);
  const sorted = [...times].sort((x, y) => x - y);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? Infinity;
  console.log(`T-015 pointermove handler p95 ${p95.toFixed(2)}ms over ${String(times.length)} moves`);
  expect(times.length).toBeGreaterThan(30);
  expect(p95).toBeLessThan(16);
});

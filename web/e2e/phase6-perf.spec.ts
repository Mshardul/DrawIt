import { expect, test } from "@playwright/test";
import { skipFrameBudgetOnCiWebkit } from "./frame-budget.ts";
import { dragAndMeasure, MAX_MISSED_SHARE, missedShare } from "./frame-measure.ts";

// The editor frame on a generated 500-element file: open, save, a repeated dirty check, and drag and resize.
const MANY = 100;
const HUB = "n1";

interface Hooks {
  openMs: number;
  select(ids: string[]): void;
  /** Pans so the first pressable id sits at (400, 300) of the canvas, and returns that point. */
  reveal(ids: string[]): { x: number; y: number };
  cursor(): string;
  positionX(): string;
  dirtyCost(): number;
  saveMs(): Promise<number>;
  startFrames(): void;
  stopFrames(): { frames: number[]; scripts: number[] };
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.evaluate(async () => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { mountShell } = await load<typeof import("../src/testing/mount-shell.ts")>("/src/testing/mount-shell.ts");
    const { generateDiagram } = await load<typeof import("../src/testing/generate-diagram.ts")>("/src/testing/generate-diagram.ts");
    const { writeDiagram } = await load<typeof import("../src/kdl/write.ts")>("/src/kdl/write.ts");
    const { createTextMeasurer } = await load<typeof import("../src/text/measure.ts")>("/src/text/measure.ts");
    const { renderThumbnail } = await load<typeof import("../src/app/thumbnail.ts")>("/src/app/thumbnail.ts");
    const { mount } = await load<typeof import("../src/render/mount.ts")>("/src/render/mount.ts");
    const { hitTest } = await load<typeof import("../src/select/select.ts")>("/src/select/select.ts");

    const text = writeDiagram(generateDiagram({ count: 500 }));
    const started = performance.now();
    const { shell } = await mountShell({ "perf.drawit.kdl": text });
    const openMs = performance.now() - started;
    shell.setView({ x: 0, y: 0, scale: 1 });
    const doc = shell.file?.document;
    if (!doc) throw new Error("file did not open");
    const measurer = createTextMeasurer();
    const picture = renderThumbnail(doc, measurer, () => ({ status: "loading" }));
    const thumb = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    thumb.setAttribute("class", "thumb");
    thumb.setAttribute("viewBox", picture.viewBox);
    thumb.setAttribute("width", "160");
    thumb.setAttribute("height", "100");
    mount(thumb, [...picture.defs, ...picture.nodes]);
    document.body.append(thumb);

    let frames: number[] = [];
    let scripts: number[] = [];
    let running = false;
    let moveStart = 0;
    window.addEventListener("pointermove", () => { moveStart = performance.now(); }, true);
    window.addEventListener("pointermove", () => { if (running) scripts.push(performance.now() - moveStart); });

    (window as unknown as { hooks: Hooks }).hooks = {
      openMs,
      select: (ids) => {
        if (shell.file) shell.file.history.selection = ids;
        shell.refresh();
      },
      reveal: (ids) => {
        const current = shell.file?.document;
        for (const id of ids) {
          const entry = current?.layout.find((item) => item.id === id);
          if (!current || !entry) continue;
          const point = { x: entry.x + (entry.w ?? 0) / 2, y: entry.y + (entry.h ?? 0) / 2 };
          if (hitTest(current, measurer, point, 1) !== id) continue;
          shell.setView({ x: 400 - point.x, y: 300 - point.y, scale: 1 });
          return { x: 400, y: 300 };
        }
        throw new Error("no node to press");
      },
      cursor: () => document.querySelector(".status .cursor")?.textContent ?? "",
      positionX: () => document.querySelector<HTMLInputElement>('[aria-label="x"]')?.value ?? "",
      dirtyCost: () => {
        const file = shell.file;
        if (!file) return -1;
        const startedAt = performance.now();
        let checks = 0;
        for (let i = 0; i < 500; i++) checks += file.dirty ? 1 : 0;
        const elapsed = performance.now() - startedAt;
        return checks >= 0 ? elapsed : elapsed;
      },
      saveMs: async () => {
        const startedAt = performance.now();
        await shell.save();
        return performance.now() - startedAt;
      },
      startFrames: () => {
        frames = [];
        scripts = [];
        running = true;
        let last = performance.now();
        const tick = (t: number): void => {
          if (!running) return;
          frames.push(t - last);
          last = t;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      stopFrames: () => {
        running = false;
        return { frames, scripts };
      },
    };
  });
});

test("opening a 500-element file stays under a second and saving stays under 200ms", async ({ page }) => {
  expect(await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.openMs)).toBeLessThan(1000);
  await page.keyboard.press("ArrowRight");
  const saveMs = await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.saveMs());
  expect(saveMs).toBeLessThan(200);
  const dirty = await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.dirtyCost());
  expect(dirty).toBeLessThan(50);
});

test("dragging a selection holds the 60fps budget with the cursor, position and a thumbnail @budget", async ({ page, browserName }) => {
  skipFrameBudgetOnCiWebkit(browserName);
  await expect(page.locator(".thumb")).toBeVisible();
  const ids = Array.from({ length: MANY }, (_, i) => `n${String(i + 1)}`);
  await page.evaluate((picked) => { (window as unknown as { hooks: Hooks }).hooks.select(picked); }, ids);
  const world = await page.evaluate((picked) => (window as unknown as { hooks: Hooks }).hooks.reveal(picked), ids);
  const box = await page.locator(".canvas").boundingBox();
  const from = { x: (box?.x ?? 0) + world.x, y: (box?.y ?? 0) + world.y };
  const before = await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.positionX());
  const measured = await dragAndMeasure(page, from, (i) => ({ x: from.x + 150 * Math.sin(i / 10), y: from.y + 80 * Math.sin(i / 5) }));
  const cursor = await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.cursor());
  const after = await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.positionX());
  expect(cursor).not.toBe("");
  expect(after).not.toBe(before);
  expect(missedShare(browserName, `selection drag of ${String(MANY)}`, measured)).toBeLessThanOrEqual(MAX_MISSED_SHARE);
});

test("resizing a shape holds the 60fps budget @budget", async ({ page, browserName }) => {
  skipFrameBudgetOnCiWebkit(browserName);
  await page.evaluate((id) => { (window as unknown as { hooks: Hooks }).hooks.select([id]); }, HUB);
  const handle = await page.locator('[data-handle="se"]').boundingBox();
  if (!handle) throw new Error("no resize handle");
  const from = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  const measured = await dragAndMeasure(page, from, (i) => ({ x: from.x + 40 + 30 * Math.sin(i / 8), y: from.y + 20 + 15 * Math.sin(i / 5) }));
  expect(missedShare(browserName, "shape resize", measured)).toBeLessThanOrEqual(MAX_MISSED_SHARE);
});

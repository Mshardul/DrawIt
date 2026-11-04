import { expect, test } from "@playwright/test";
import { skipFrameBudgetOnCiWebkit } from "./frame-budget.ts";
import { dragAndMeasure, MAX_MISSED_SHARE, missedShare } from "./frame-measure.ts";

// The real shell on a generated 500-element file with frames behind the nodes and loaded images
// among them, and routed edges between the nodes.
const MANY = 100;
const HUB = "n1";

interface Counts {
  elements: number;
  frames: number;
  images: number;
}
interface Hooks {
  counts(): Counts;
  select(ids: string[]): void;
  /** The centre of the first of `ids` that nothing above it covers, in world coordinates. */
  pressPoint(ids: string[]): { x: number; y: number };
  /** Pans so the first of `ids` that nothing above it covers is at (400, 300) of the canvas, and returns that point. */
  reveal(ids: string[]): { x: number; y: number };
  ids(kind: "frame" | "image"): string[];
  position(id: string): { x: number; y: number } | undefined;
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
    const { hitTest } = await load<typeof import("../src/select/select.ts")>("/src/select/select.ts");

    const generated = generateDiagram({ count: 500, ratios: { node: 0.6, edge: 0.3, frame: 0.03, image: 0.07 } });
    const edges = generated.elements.filter((e) => e.kind === "edge");
    const overrides = edges.filter((_, i) => i % 2 === 0).map((e) => ({ id: e.id, props: { route: "elbow" as const } }));
    const text = writeDiagram({ ...generated, style: { ...generated.style, overrides } });

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 40;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#e8732a";
      context.fillRect(0, 0, 64, 40);
    }
    const png = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, "image/png"); });
    const bytes = new Uint8Array(await (png as Blob).arrayBuffer());

    const { shell } = await mountShell({ "perf.drawit.kdl": text, "assets/pic.png": bytes });
    shell.setView({ x: 0, y: 0, scale: 1 });

    let frames: number[] = [];
    let scripts: number[] = [];
    let running = false;
    // The capture listener on window runs before the canvas handlers and the bubble listener after them.
    let moveStart = 0;
    window.addEventListener("pointermove", () => { moveStart = performance.now(); }, true);
    window.addEventListener("pointermove", () => { if (running) scripts.push(performance.now() - moveStart); });
    const measurer = createTextMeasurer();

    (window as unknown as { hooks: Hooks }).hooks = {
      counts: () => {
        const elements = shell.file?.document.elements ?? [];
        return {
          elements: elements.length,
          frames: elements.filter((e) => e.kind === "frame").length,
          images: elements.filter((e) => e.kind === "image").length,
        };
      },
      ids: (kind) => (shell.file?.document.elements ?? []).filter((e) => e.kind === kind).map((e) => e.id),
      position: (id) => shell.file?.document.layout.find((e) => e.id === id),
      select: (ids) => {
        if (shell.file) shell.file.history.selection = ids;
        shell.refresh();
      },
      pressPoint: (ids) => {
        const doc = shell.file?.document;
        for (const id of ids) {
          const entry = doc?.layout.find((e) => e.id === id);
          if (!doc || !entry) continue;
          const p = { x: entry.x + (entry.w ?? 0) / 2, y: entry.y + (entry.h ?? 0) / 2 };
          if (hitTest(doc, measurer, p, 1) === id) return p;
        }
        throw new Error("no press point");
      },
      reveal: (ids) => {
        const doc = shell.file?.document;
        for (const id of ids) {
          const entry = doc?.layout.find((e) => e.id === id);
          if (!doc || !entry) continue;
          const p = { x: entry.x + (entry.w ?? 0) / 2, y: entry.y + (entry.h ?? 0) / 2 };
          if (hitTest(doc, measurer, p, 1) !== id) continue;
          shell.setView({ x: 400 - p.x, y: 300 - p.y, scale: 1 });
          return { x: 400, y: 300 };
        }
        throw new Error("no image to press");
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

test("the file has frames and images, and every image has loaded", async ({ page }) => {
  const counts = await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.counts());
  expect(counts.elements).toBe(500);
  expect(counts.frames).toBeGreaterThan(10);
  expect(counts.images).toBeGreaterThan(30);
  await expect(page.locator(".elements > g > image").first()).toHaveAttribute("href", /^blob:/);
  await expect(page.locator(".elements > g > image")).toHaveCount(counts.images);
  await expect(page.locator(".elements > g > rect[stroke-dasharray]")).toHaveCount(0);
});

test("dragging a selection of nodes among frames and images holds the 60fps frame budget @budget", async ({ page, browserName }) => {
  skipFrameBudgetOnCiWebkit(browserName);
  const ids = Array.from({ length: MANY }, (_, i) => `n${String(i + 1)}`);
  await page.evaluate((i) => { (window as unknown as { hooks: Hooks }).hooks.select(i); }, ids);
  const world = await page.evaluate((i) => (window as unknown as { hooks: Hooks }).hooks.pressPoint(i), ids);
  const box = await page.locator(".canvas").boundingBox();
  const from = { x: (box?.x ?? 0) + world.x, y: (box?.y ?? 0) + world.y };
  const measured = await dragAndMeasure(page, from, (i) => ({ x: from.x + 150 * Math.sin(i / 10), y: from.y + 80 * Math.sin(i / 5) }));
  expect(missedShare(browserName, `selection drag of ${String(MANY)}`, measured)).toBeLessThanOrEqual(MAX_MISSED_SHARE);
});

test("dragging a selection of images and frames holds the budget @budget", async ({ page, browserName }) => {
  skipFrameBudgetOnCiWebkit(browserName);
  const images = await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.ids("image"));
  const frames = await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.ids("frame"));
  const ids = [...images, ...frames];
  await page.evaluate((i) => { (window as unknown as { hooks: Hooks }).hooks.select(i); }, ids);
  const local = await page.evaluate((i) => (window as unknown as { hooks: Hooks }).hooks.reveal(i), images);
  const box = await page.locator(".canvas").boundingBox();
  const from = { x: (box?.x ?? 0) + local.x, y: (box?.y ?? 0) + local.y };
  const before = await page.evaluate((id) => (window as unknown as { hooks: Hooks }).hooks.position(id), frames[0] ?? "");
  const measured = await dragAndMeasure(page, from, (i) => ({ x: from.x + 150 + 100 * Math.sin(i / 10), y: from.y + 80 + 40 * Math.sin(i / 5) }));
  const after = await page.evaluate((id) => (window as unknown as { hooks: Hooks }).hooks.position(id), frames[0] ?? "");
  expect(after?.x).not.toBe(before?.x);
  expect(missedShare(browserName, `drag of ${String(ids.length)} images and frames`, measured)).toBeLessThanOrEqual(MAX_MISSED_SHARE);
});

test("resizing a shape with attached edges holds the budget @budget", async ({ page, browserName }) => {
  skipFrameBudgetOnCiWebkit(browserName);
  await page.evaluate((id) => { (window as unknown as { hooks: Hooks }).hooks.select([id]); }, HUB);
  const handle = await page.locator('[data-handle="se"]').boundingBox();
  if (!handle) throw new Error("no resize handle");
  const from = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  const measured = await dragAndMeasure(page, from, (i) => ({ x: from.x + 40 + 30 * Math.sin(i / 8), y: from.y + 20 + 15 * Math.sin(i / 5) }));
  expect(missedShare(browserName, "shape resize", measured)).toBeLessThanOrEqual(MAX_MISSED_SHARE);
});

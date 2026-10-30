import { expect, test } from "@playwright/test";
import { skipFrameBudgetOnCiWebkit } from "./frame-budget.ts";
import { dragAndMeasure, MAX_MISSED_SHARE, missedShare } from "./frame-measure.ts";

// The real shell on a generated 500-element file whose nodes are pack shapes with curved and
// stretched outlines, and whose edges are half elbow and half attached at a side and position.
const MANY = 100;
const HUB = "n1";
const SHAPES = [
  "core.rounded-rect", "core.hexagon", "core.star", "core.callout-round", "core.terminator", "core.document", "core.arrow-curved", "core.data",
  "arch.server", "arch.database", "arch.cloud", "arch.user", "arch.storage-bucket", "net.vpn", "c4.person", "c4.component", "info.ribbon", "info.timeline-marker",
];

interface Counts {
  elements: number;
  packNodes: number;
  unknownShapes: number;
  elbowEdges: number;
  anchoredEdges: number;
}
interface Hooks {
  counts(): Counts;
  select(ids: string[]): void;
  /** The centre of the first of `ids` that no edge or label covers, in world coordinates. */
  pressPoint(ids: string[]): { x: number; y: number };
  startFrames(): void;
  stopFrames(): { frames: number[]; scripts: number[] };
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.evaluate(async (shapes) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { generateDiagram } = await load<typeof import("../src/testing/generate-diagram.ts")>("/src/testing/generate-diagram.ts");
    const { writeDiagram } = await load<typeof import("../src/kdl/write.ts")>("/src/kdl/write.ts");
    const { createTextMeasurer } = await load<typeof import("../src/text/measure.ts")>("/src/text/measure.ts");
    const { hitTest } = await load<typeof import("../src/select/select.ts")>("/src/select/select.ts");
    const { bundledLoader } = await load<typeof import("../src/shapes/bundled-packs.ts")>("/src/shapes/bundled-packs.ts");

    const generated = generateDiagram({ count: 500, shapes });
    const edges = generated.elements.filter((e) => e.kind === "edge");
    const overrides = edges.filter((_, i) => i % 2 === 0).map((e) => ({ id: e.id, props: { route: "elbow" as const } }));
    const anchored = new Set(edges.filter((_, i) => i % 2 === 1).map((e) => e.id));
    const layout = generated.layout.map((entry) =>
      anchored.has(entry.id) ? { ...entry, from: { side: "right" as const, at: 0.3 }, to: { side: "left" as const, at: 0.7 } } : entry,
    );
    const text = writeDiagram({ ...generated, layout, style: { ...generated.style, overrides } });

    const shell = await startShell(document.getElementById("app") as HTMLElement, new MemoryStorage({ "perf.drawit.kdl": text }));
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
        const doc = shell.file?.document;
        const nodes = doc?.elements.flatMap((e) => (e.kind === "node" ? [e.shape] : [])) ?? [];
        return {
          elements: doc?.elements.length ?? 0,
          packNodes: nodes.filter((s) => s.includes(".")).length,
          unknownShapes: bundledLoader.unknownShapes(nodes).length,
          elbowEdges: doc?.style.overrides.filter((o) => o.props.route === "elbow").length ?? 0,
          anchoredEdges: doc?.layout.filter((l) => typeof l.from === "object" && typeof l.to === "object").length ?? 0,
        };
      },
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
  }, SHAPES);
});

test("the nodes are pack shapes that every pack provides, and the edges are elbow or attached at a side and position", async ({ page }) => {
  const counts = await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.counts());
  expect(counts.elements).toBe(500);
  expect(counts.packNodes).toBeGreaterThan(250);
  expect(counts.unknownShapes).toBe(0);
  expect(counts.elbowEdges).toBeGreaterThan(80);
  expect(counts.anchoredEdges).toBeGreaterThan(80);
  await expect(page.locator(".elements > g path").first()).toBeAttached();
  await expect(page.locator(".elements > g text", { hasText: /^(core|arch|net|c4|info)\./ })).toHaveCount(0);
});

test("dragging a selection of pack shapes holds the 60fps frame budget @budget", async ({ page, browserName }) => {
  skipFrameBudgetOnCiWebkit(browserName);
  const ids = Array.from({ length: MANY }, (_, i) => `n${String(i + 1)}`);
  await page.evaluate((i) => { (window as unknown as { hooks: Hooks }).hooks.select(i); }, ids);
  const world = await page.evaluate((i) => (window as unknown as { hooks: Hooks }).hooks.pressPoint(i), ids);
  const box = await page.locator(".canvas").boundingBox();
  const from = { x: (box?.x ?? 0) + world.x, y: (box?.y ?? 0) + world.y };
  const measured = await dragAndMeasure(page, from, (i) => ({ x: from.x + 150 * Math.sin(i / 10), y: from.y + 80 * Math.sin(i / 5) }));
  expect(missedShare(browserName, `selection drag of ${String(MANY)}`, measured)).toBeLessThanOrEqual(MAX_MISSED_SHARE);
});

test("resizing a pack shape with attached edges holds the budget @budget", async ({ page, browserName }) => {
  skipFrameBudgetOnCiWebkit(browserName);
  await page.evaluate((id) => { (window as unknown as { hooks: Hooks }).hooks.select([id]); }, HUB);
  const handle = await page.locator('[data-handle="se"]').boundingBox();
  if (!handle) throw new Error("no resize handle");
  const from = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  const measured = await dragAndMeasure(page, from, (i) => ({ x: from.x + 40 + 30 * Math.sin(i / 8), y: from.y + 20 + 15 * Math.sin(i / 5) }));
  expect(missedShare(browserName, "shape resize", measured)).toBeLessThanOrEqual(MAX_MISSED_SHARE);
});

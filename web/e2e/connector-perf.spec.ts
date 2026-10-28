import { expect, test, type Page } from "@playwright/test";
import { skipFrameBudgetOnCiWebkit } from "./frame-budget.ts";

// Connector routing on a generated 500-element file. Functional checks of the routing and
// re-attach gestures in a real browser, then frame time while a connected shape is dragged,
// measured as in drag-perf.spec.ts (one pointermove per animation frame).
const FRAMES = 240;
const SELECTED = 100;
const HUB_EDGES = 20;
const MISSED_MS = 1.5 * (1000 / 60);
const MAX_MISSED_SHARE = 0.05;

interface DragRun {
  elements: number;
  edges: number;
  elbowEdges: number;
  selected: number;
  rerouted: number;
  moved: number;
  frameMs: number[];
  scriptMs: number[];
}
interface EdgeState {
  from: string | null;
  to: string | null;
  fromAnchor: unknown;
  toAnchor: unknown;
  toPoint: { x: number; y: number } | null;
}
interface ConnectorPerf {
  runDrag(frames: number): Promise<DragRun>;
  badElbows(): number;
  hubGap(): number;
  edge(id: string): EdgeState;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;
}

const run = (page: Page): Promise<DragRun> =>
  page.evaluate<DragRun, number>((frames) => (window as unknown as { connectorPerf: ConnectorPerf }).connectorPerf.runDrag(frames), FRAMES);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
});

test("a 500-element file routes every edge, and every elbow is made of right angles", async ({ page }) => {
  await page.goto("/connector-perf.html?mode=hub");
  const result = await page.evaluate(() => {
    const s = (window as unknown as { connectorPerf: ConnectorPerf }).connectorPerf;
    return { bad: s.badElbows(), paths: document.querySelectorAll("path.edge").length, elbows: document.querySelectorAll('path.edge[data-route="elbow"]').length };
  });
  expect(result.paths).toBeGreaterThan(100 + HUB_EDGES);
  expect(result.elbows).toBeGreaterThan(0);
  expect(result.bad).toBe(0);
});

test("dragging a shape keeps all its edges attached to its outline", async ({ page }) => {
  await page.goto("/connector-perf.html?mode=hub");
  const drag = await run(page);
  expect(drag.moved).toBeGreaterThan(0);
  expect(drag.rerouted).toBeGreaterThanOrEqual(HUB_EDGES);
  const gap = await page.evaluate(() => (window as unknown as { connectorPerf: ConnectorPerf }).connectorPerf.hubGap());
  expect(gap).toBeLessThan(1);
});

test("dragging an edge's end onto another shape re-attaches it at the nearest side and position", async ({ page }) => {
  await page.goto("/connector-perf.html?mode=hub");
  await page.evaluate(() => { (window as unknown as { connectorPerf: { showDemo(): void } }).connectorPerf.showDemo(); });
  const handle = await page.locator('[data-end="to"]').boundingBox();
  if (!handle) throw new Error("no end handle");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(895, 625, { steps: 5 });
  await page.mouse.up();
  const edge = await page.evaluate(() => (window as unknown as { connectorPerf: ConnectorPerf }).connectorPerf.edge("demo"));
  expect(edge.to).toBe("d3");
  expect(edge.toAnchor).toMatchObject({ side: "right" });
});

test("dropping an edge's end on empty canvas detaches it to a free point", async ({ page }) => {
  await page.goto("/connector-perf.html?mode=hub");
  await page.evaluate(() => { (window as unknown as { connectorPerf: { showDemo(): void } }).connectorPerf.showDemo(); });
  const handle = await page.locator('[data-end="to"]').boundingBox();
  if (!handle) throw new Error("no end handle");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  // The generated file fills the window, so ask the page for a spot with nothing under it.
  const empty = await page.evaluate(() => (window as unknown as { connectorPerf: { emptyPoint(): { x: number; y: number } } }).connectorPerf.emptyPoint());
  await page.mouse.move(empty.x, empty.y, { steps: 5 });
  await page.mouse.up();
  const edge = await page.evaluate(() => (window as unknown as { connectorPerf: ConnectorPerf }).connectorPerf.edge("demo"));
  expect(edge.to).toBeNull();
  expect(edge.toPoint).toEqual(empty);
});

for (const mode of ["hub", "selection"] as const) {
  test(`dragging ${mode === "hub" ? "one shape with 20 edges" : "100 shapes with their edges"} holds the 60fps frame budget`, async ({ page, browserName }) => {
    skipFrameBudgetOnCiWebkit(browserName);
    await page.goto(`/connector-perf.html?mode=${mode}&select=${String(SELECTED)}`);
    const drag = await page.evaluate<DragRun, number>(
      (frames) => (window as unknown as { connectorPerf: ConnectorPerf }).connectorPerf.runDrag(frames),
      FRAMES,
    );
    expect(drag.elements).toBeGreaterThanOrEqual(500);
    expect(drag.moved).toBeGreaterThan(0);
    expect(drag.rerouted).toBeGreaterThan(0);
    const frames = drag.frameMs.slice(10);
    const scripts = drag.scriptMs.slice(10);
    const summary = {
      mode,
      browser: browserName,
      edges: drag.edges,
      rerouted: drag.rerouted,
      frames: frames.length,
      frameP50: percentile(frames, 0.5),
      frameP95: percentile(frames, 0.95),
      frameMax: Math.max(...frames),
      missedShare: frames.filter((ms) => ms > MISSED_MS).length / frames.length,
      scriptP50: percentile(scripts, 0.5),
      scriptP95: percentile(scripts, 0.95),
      scriptMax: Math.max(...scripts),
    };
    console.log(`connector drag ${JSON.stringify(summary)}`);
    expect(summary.missedShare).toBeLessThanOrEqual(MAX_MISSED_SHARE);
  });
}

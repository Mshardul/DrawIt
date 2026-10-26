import { expect, test } from "@playwright/test";

// Spike T-009: drag a selection in a generated 500-element file and compare frame time with the
// 60fps budget (spec 7.1). Each frame, the page dispatches one pointermove and records the time
// from the previous animation frame.
const FRAMES = 240;
const SELECTED = 100;
// A frame misses the budget when it takes longer than 1.5 frame intervals (a vsync was skipped).
// WebKit rounds timestamps to whole milliseconds, so a threshold on the raw interval is too tight there.
const MISSED_MS = 1.5 * (1000 / 60);
const MAX_MISSED_SHARE = 0.05;

interface DragRun {
  elements: number;
  edges: number;
  selected: number;
  moved: number;
  frameMs: number[];
  scriptMs: number[];
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;
}

test("[T-009] a 500-element file renders as SVG with edges and a selection moves with the drag", async ({ page }) => {
  await page.goto(`/spike-drag.html?select=${String(SELECTED)}`);
  const run = await page.evaluate<DragRun, number>(
    (frames) => (window as unknown as { runDrag: (n: number) => Promise<DragRun> }).runDrag(frames),
    FRAMES,
  );
  expect(run.elements).toBe(500);
  expect(run.edges).toBeGreaterThan(100);
  expect(run.selected).toBe(SELECTED);
  expect(run.moved).toBeGreaterThan(0);
});

test("[T-009] dragging the selection holds the 60fps frame budget", async ({ page, browserName }) => {
  await page.goto(`/spike-drag.html?select=${String(SELECTED)}`);
  const run = await page.evaluate<DragRun, number>(
    (frames) => (window as unknown as { runDrag: (n: number) => Promise<DragRun> }).runDrag(frames),
    FRAMES,
  );
  // Skip the first frames: they include style recalculation for the first transform change.
  const frames = run.frameMs.slice(10);
  const scripts = run.scriptMs.slice(10);
  const summary = {
    browser: browserName,
    frames: frames.length,
    frameP50: percentile(frames, 0.5),
    frameP95: percentile(frames, 0.95),
    frameMax: Math.max(...frames),
    missedShare: frames.filter((ms) => ms > MISSED_MS).length / frames.length,
    scriptP50: percentile(scripts, 0.5),
    scriptP95: percentile(scripts, 0.95),
    scriptMax: Math.max(...scripts),
  };
  console.log(`T-009 ${JSON.stringify(summary)}`);
  expect(summary.missedShare).toBeLessThanOrEqual(MAX_MISSED_SHARE);
});

import { test } from "@playwright/test";

// Temporary: logs frame pacing in a few page setups so a slow runner can be told apart from a slow scene.
const FRAMES = 240;
const SKIP = 10;

interface Pacing {
  p50: number;
  p95: number;
  max: number;
  over25ms: number;
}

interface DragRun {
  frameMs: number[];
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;
}

function pacing(frameMs: number[]): Pacing {
  const frames = frameMs.slice(SKIP);
  return {
    p50: percentile(frames, 0.5),
    p95: percentile(frames, 0.95),
    max: Math.max(...frames),
    over25ms: frames.filter((ms) => ms > 25).length / frames.length,
  };
}

function report(label: string, browser: string, info: object): void {
  console.log(`frame diagnostic ${label} ${JSON.stringify({ browser, ...info })}`);
}

interface Variant {
  label: string;
  selected: number;
  scale?: number;
  prepare?: string;
}

// Each variant changes one thing about the 100-shape drag so the slow part shows up by elimination.
const VARIANTS: Variant[] = [
  { label: "sel-10", selected: 10 },
  { label: "sel-25", selected: 25 },
  { label: "sel-50", selected: 50 },
  { label: "sel-100", selected: 100 },
  { label: "sel-100-dpr1", selected: 100, scale: 1 },
  { label: "sel-100-no-markers", selected: 100, prepare: "document.querySelectorAll('path[marker-end]').forEach((p) => p.removeAttribute('marker-end'))" },
  { label: "sel-100-edges-hidden", selected: 100, prepare: "document.querySelectorAll('path[marker-end]').forEach((p) => p.setAttribute('display', 'none'))" },
  { label: "sel-100-will-change", selected: 100, prepare: "document.querySelectorAll('g[data-id]').forEach((g) => { g.style.willChange = 'transform'; })" },
];

for (const variant of VARIANTS) {
  test(`frame diagnostic: ${variant.label}`, async ({ browser, browserName }) => {
    const context = await browser.newContext({ deviceScaleFactor: variant.scale ?? 2, viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await page.goto(`/drag-perf.html?select=${String(variant.selected)}`);
    if (variant.prepare) await page.evaluate(variant.prepare);
    const run = await page.evaluate<DragRun, number>(
      (frames) => (window as unknown as { runDrag: (n: number) => Promise<DragRun> }).runDrag(frames),
      FRAMES,
    );
    report(variant.label, browserName, pacing(run.frameMs));
    await context.close();
  });
}

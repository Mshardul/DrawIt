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

// Runs inside the page: one animation frame per entry, with an optional per-frame mutation.
const measureFrames = (args: { frames: number; mutate: boolean }): Promise<number[]> =>
  new Promise((resolve) => {
    const out: number[] = [];
    const rect = document.getElementById("probe");
    let last = 0;
    let i = 0;
    const tick = (now: number): void => {
      if (last !== 0) out.push(now - last);
      last = now;
      if (args.mutate && rect) rect.setAttribute("transform", `translate(${String(i % 200)} 0)`);
      i += 1;
      if (i > args.frames) resolve(out);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

test("frame diagnostic: empty page", async ({ page, browserName }) => {
  await page.setContent("<!doctype html><html><body></body></html>");
  const frameMs = await page.evaluate(measureFrames, { frames: FRAMES, mutate: false });
  const env = await page.evaluate(() => ({ cores: navigator.hardwareConcurrency, dpr: window.devicePixelRatio }));
  report("empty", browserName, { ...env, ...pacing(frameMs) });
});

test("frame diagnostic: one moving svg rect", async ({ page, browserName }) => {
  await page.setContent(
    '<!doctype html><html><body><svg width="800" height="600"><rect id="probe" width="50" height="50"/></svg></body></html>',
  );
  const frameMs = await page.evaluate(measureFrames, { frames: FRAMES, mutate: true });
  report("one-rect", browserName, pacing(frameMs));
});

for (const selected of [1, 100]) {
  test(`frame diagnostic: drag scene with ${String(selected)} selected`, async ({ page, browserName }) => {
    await page.goto(`/drag-perf.html?select=${String(selected)}`);
    const run = await page.evaluate<DragRun, number>(
      (frames) => (window as unknown as { runDrag: (n: number) => Promise<DragRun> }).runDrag(frames),
      FRAMES,
    );
    report(`scene-${String(selected)}`, browserName, pacing(run.frameMs));
  });
}

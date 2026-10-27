import { expect, test } from "@playwright/test";

// The line breaker measures with the canvas; the same lines must take the same width in
// SVG text, in the editing overlay and in the rasterised SVG that PNG export draws.
interface CaseResult {
  fixture: string;
  width: number;
  lines: string[];
  svgDelta: number;
  overlayDelta: number;
  pngDelta: number;
  overflow: number;
}
interface WrapRun {
  font: string;
  cases: CaseResult[];
}

// DOM layout and canvas share the shaper, so the overlay must agree to well under a pixel.
const TOLERANCE_PX = 0.1;
// WebKit reports getComputedTextLength up to 1.2px away from the canvas width for the same line, while the
// pixels it draws match the canvas (see the raster test), so SVG length gets a looser bound than ink.
const SVG_LENGTH_TOLERANCE_PX = 1.5;
// Ink can extend past the advance width by a pixel or two (anti-aliasing).
const INK_TOLERANCE_PX = 1;

async function run(page: import("@playwright/test").Page): Promise<WrapRun> {
  await page.goto("/text-wrap.html");
  return page.evaluate<WrapRun>(() => (window as unknown as { runWrap: () => Promise<WrapRun> }).runWrap());
}

test("wrapped lines fit the box and cover every fixture", async ({ page }) => {
  const result = await run(page);
  expect(result.cases.length).toBeGreaterThanOrEqual(18);
  for (const c of result.cases) {
    expect(c.lines.length, `${c.fixture}@${String(c.width)}`).toBeGreaterThan(0);
    expect(c.overflow, `${c.fixture}@${String(c.width)} overflow`).toBeLessThanOrEqual(INK_TOLERANCE_PX);
  }
});

test("SVG text and the editing overlay take the width the line breaker measured", async ({ page, browserName }) => {
  const result = await run(page);
  console.log(`wrapped lines ${browserName} ${JSON.stringify(result.cases.map((c) => [c.fixture, c.width, c.lines]))}`);
  for (const c of result.cases) {
    expect(c.svgDelta, `${c.fixture}@${String(c.width)} svg`).toBeLessThanOrEqual(SVG_LENGTH_TOLERANCE_PX);
    expect(c.overlayDelta, `${c.fixture}@${String(c.width)} overlay`).toBeLessThanOrEqual(TOLERANCE_PX);
  }
});

test("the rasterised SVG draws each line as wide as the same line on a canvas", async ({ page, browserName }) => {
  const result = await run(page);
  const worst = Math.max(...result.cases.map((c) => c.pngDelta));
  console.log(`wrapped lines ${browserName} raster worst difference ${String(worst)}px`);
  for (const c of result.cases) {
    expect(c.pngDelta, `${c.fixture}@${String(c.width)} png`).toBeLessThanOrEqual(INK_TOLERANCE_PX);
  }
});

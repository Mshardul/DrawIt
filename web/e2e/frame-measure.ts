import type { Page } from "@playwright/test";

// Frame timing for drags in the real shell: one pointermove per animation frame, and the gap between
// animation frames recorded in the page. The page exposes `startFrames` and `stopFrames` on `window.hooks`.
export const FRAMES = 120;
// A frame misses the budget when it takes longer than 1.5 frame intervals (a vsync was skipped).
// WebKit rounds timestamps to whole milliseconds, so a threshold on the raw interval is too tight there.
export const MISSED_MS = 1.5 * (1000 / 60);
export const MAX_MISSED_SHARE = 0.05;

export interface Measured {
  frames: number[];
  scripts: number[];
}

interface FrameHooks {
  startFrames(): void;
  stopFrames(): Measured;
}

export const nextFrame = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); }));

export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;
}

/** Presses at `from` and moves along `path`, one pointermove per animation frame; the first ten frames are dropped. */
export async function dragAndMeasure(page: Page, from: { x: number; y: number }, path: (i: number) => { x: number; y: number }): Promise<Measured> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.evaluate(() => { (window as unknown as { hooks: FrameHooks }).hooks.startFrames(); });
  for (let i = 1; i <= FRAMES; i++) {
    const p = path(i);
    await page.mouse.move(p.x, p.y);
    await nextFrame(page);
  }
  const { frames, scripts } = await page.evaluate(() => (window as unknown as { hooks: FrameHooks }).hooks.stopFrames());
  await page.mouse.up();
  return { frames: frames.slice(10), scripts: scripts.slice(10) };
}

/** Logs a summary and returns the share of frames that missed the budget. */
export function missedShare(browser: string, label: string, { frames, scripts }: Measured): number {
  const share = frames.filter((ms) => ms > MISSED_MS).length / frames.length;
  const summary = {
    browser,
    frames: frames.length,
    frameP50: percentile(frames, 0.5),
    frameP95: percentile(frames, 0.95),
    frameMax: Math.max(...frames),
    missedShare: share,
    scriptP50: percentile(scripts, 0.5),
    scriptP95: percentile(scripts, 0.95),
    scriptMax: Math.max(...scripts),
  };
  console.log(`${label} ${JSON.stringify(summary)}`);
  return share;
}

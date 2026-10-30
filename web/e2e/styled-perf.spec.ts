import { expect, test, type Page } from "@playwright/test";
import type { StyleProps } from "../src/model/index.ts";
import { skipFrameBudgetOnCiWebkit } from "./frame-budget.ts";

// The real shell on a generated 500-element file where every shape has a shadow and styled text,
// every other shape a gradient fill, and every edge a dash. Real mouse input, one move per
// animation frame; frame time is the gap between animation frames recorded in the page.
const FRAMES = 120;
const MANY = 100;
const HUB = "n1";
// A frame misses the budget when it takes longer than 1.5 frame intervals (a vsync was skipped).
// WebKit rounds timestamps to whole milliseconds, so a threshold on the raw interval is too tight there.
const MISSED_MS = 1.5 * (1000 / 60);
const MAX_MISSED_SHARE = 0.05;

interface Counts {
  elements: number;
  shadowed: number;
  gradients: number;
  styledText: number;
  dashedEdges: number;
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
  await page.evaluate(async () => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { generateDiagram } = await load<typeof import("../src/testing/generate-diagram.ts")>("/src/testing/generate-diagram.ts");
    const { writeDiagram } = await load<typeof import("../src/kdl/write.ts")>("/src/kdl/write.ts");
    const { createTextMeasurer } = await load<typeof import("../src/text/measure.ts")>("/src/text/measure.ts");
    const { hitTest } = await load<typeof import("../src/select/select.ts")>("/src/select/select.ts");

    const generated = generateDiagram({ count: 500 });
    let shapeIndex = 0;
    const overrides = generated.elements.flatMap<{ id: string; props: StyleProps }>((e) => {
      if (e.kind === "edge") return [{ id: e.id, props: { dash: "dashed" as const } }];
      if (e.kind !== "node") return [];
      const gradient = shapeIndex++ % 2 === 0 ? { fill: "linear(135, $primary, $accent 0.7, $surface)" } : {};
      return [{ id: e.id, props: { ...gradient, shadow: "2 4 8 #00000066", font: "Source Serif 4", size: 16, weight: 700, italic: true, color: "$ink" } }];
    });
    const text = writeDiagram({ ...generated, style: { ...generated.style, overrides } });

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
        const props = doc?.style.overrides.map((o) => o.props) ?? [];
        return {
          elements: doc?.elements.length ?? 0,
          shadowed: props.filter((p) => p.shadow !== undefined).length,
          gradients: props.filter((p) => typeof p.fill === "string" && p.fill.startsWith("linear(")).length,
          styledText: props.filter((p) => p.font === "Source Serif 4").length,
          dashedEdges: props.filter((p) => p.dash === "dashed").length,
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
  });
});

type Calls = { [K in keyof Hooks]: Parameters<Hooks[K]> };

async function call<K extends keyof Hooks>(page: Page, name: K, ...args: Calls[K]): Promise<ReturnType<Hooks[K]>> {
  const result = await page.evaluate(
    ([hook, list]) => (window as unknown as { hooks: Record<string, (...a: unknown[]) => unknown> }).hooks[hook as string]?.(...(list as unknown[])),
    [name, args] as const,
  );
  return result as ReturnType<Hooks[K]>;
}

const nextFrame = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); }));

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;
}

interface Measured {
  frames: number[];
  scripts: number[];
}

/** Presses at `from` and moves along `path`, one pointermove per animation frame; the first ten frames are dropped. */
async function dragAndMeasure(
  page: Page,
  from: { x: number; y: number },
  path: (i: number) => { x: number; y: number },
  whileDown: () => Promise<void> = () => Promise.resolve(),
): Promise<Measured> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await call(page, "startFrames");
  for (let i = 1; i <= FRAMES; i++) {
    const p = path(i);
    await page.mouse.move(p.x, p.y);
    await nextFrame(page);
  }
  const { frames, scripts } = await call(page, "stopFrames");
  await whileDown();
  await page.mouse.up();
  return { frames: frames.slice(10), scripts: scripts.slice(10) };
}

function missedShare(browser: string, label: string, { frames, scripts }: Measured): number {
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

async function dragSelection(page: Page, browserName: string, label: string, count: number): Promise<Measured> {
  const ids = Array.from({ length: count }, (_, i) => `n${String(i + 1)}`);
  await call(page, "select", ids);
  const world = await call(page, "pressPoint", ids);
  const box = await page.locator(".canvas").boundingBox();
  const from = { x: (box?.x ?? 0) + world.x, y: (box?.y ?? 0) + world.y };
  const measured = await dragAndMeasure(page, from, (i) => ({ x: from.x + 150 * Math.sin(i / 10), y: from.y + 80 * Math.sin(i / 5) }));
  expect(missedShare(browserName, label, measured)).toBeLessThanOrEqual(MAX_MISSED_SHARE);
  return measured;
}

test("every shape has a shadow and styled text, every other one a gradient, and every edge a dash", async ({ page }) => {
  const counts = await call(page, "counts");
  expect(counts.elements).toBe(500);
  expect(counts.shadowed).toBeGreaterThan(250);
  expect(counts.styledText).toBe(counts.shadowed);
  expect(counts.gradients).toBeGreaterThan(100);
  expect(counts.dashedEdges).toBeGreaterThan(100);
  await expect(page.locator(".elements > g[filter]").first()).toBeVisible();
  await expect(page.locator('.elements > g rect[fill^="url(#"]').first()).toBeVisible();
  await expect(page.locator('.elements > g text[font-family="\\"Source Serif 4\\""]').first()).toBeVisible();
  await expect(page.locator(".elements path[stroke-dasharray]").first()).toBeAttached();
});

test("dragging a selection of shadowed shapes holds the 60fps frame budget @budget", async ({ page, browserName }) => {
  skipFrameBudgetOnCiWebkit(browserName);
  await dragSelection(page, browserName, `selection drag of ${String(MANY)}`, MANY);
});

test("dragging as many shadowed shapes as keep their shadows holds the budget @budget", async ({ page, browserName }) => {
  skipFrameBudgetOnCiWebkit(browserName);
  const limit = await page.evaluate(async () => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    return (await load<typeof import("../src/render/defs.ts")>("/src/render/defs.ts")).SHADOW_DRAG_LIMIT;
  });
  await dragSelection(page, browserName, `selection drag of ${String(limit)}`, limit);
  await expect(page.locator(".elements > g[filter]").first()).toBeVisible();
});

test("resizing a shadowed shape with attached edges holds the budget @budget", async ({ page, browserName }) => {
  skipFrameBudgetOnCiWebkit(browserName);
  await call(page, "select", [HUB]);
  const handle = await page.locator('[data-handle="se"]').boundingBox();
  if (!handle) throw new Error("no resize handle");
  const from = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  const measured = await dragAndMeasure(page, from, (i) => ({ x: from.x + 40 + 30 * Math.sin(i / 8), y: from.y + 20 + 15 * Math.sin(i / 5) }));
  expect(missedShare(browserName, "shape resize", measured)).toBeLessThanOrEqual(MAX_MISSED_SHARE);
});

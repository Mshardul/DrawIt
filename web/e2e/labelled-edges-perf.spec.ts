import { expect, test, type Page } from "@playwright/test";
import { skipFrameBudgetOnCiWebkit } from "./frame-budget.ts";

// The real shell on a generated 500-element file with labelled shapes, labelled edges (a third of
// them elbows) and one shape with 20 more labelled edges. Real mouse input, one move per animation
// frame; frame time is the gap between animation frames recorded in the page.
const FRAMES = 120;
const SELECTED = 100;
const HUB = "n1";
const HUB_EDGES = 20;
// A frame misses the budget when it takes longer than 1.5 frame intervals (a vsync was skipped).
// WebKit rounds timestamps to whole milliseconds, so a threshold on the raw interval is too tight there.
const MISSED_MS = 1.5 * (1000 / 60);
const MAX_MISSED_SHARE = 0.05;

interface Counts {
  elements: number;
  edges: number;
  labelledEdges: number;
  labelledNodes: number;
}
interface Hooks {
  counts(): Counts;
  select(ids: string[]): void;
  /** The edges with an end on `id`. */
  attachedEdges(id: string): string[];
  /** The centre of the first of `ids` that no edge or label covers, in world coordinates. */
  pressPoint(ids: string[]): { x: number; y: number };
  startFrames(): void;
  /** Frame gaps, and the time every handler took to run per pointermove. */
  stopFrames(): { frames: number[]; scripts: number[] };
  /** Starts recording which drawn elements change, and counting canvas text measurements. */
  watchRedraws(): void;
  redrawn(): string[];
  measureCalls(): number;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.evaluate(
    async ({ hub, hubEdges }) => {
      const load = <T>(path: string) => import(path) as Promise<T>;
      const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
      const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
      const { generateDiagram } = await load<typeof import("../src/testing/generate-diagram.ts")>("/src/testing/generate-diagram.ts");
      const { writeDiagram } = await load<typeof import("../src/kdl/write.ts")>("/src/kdl/write.ts");
      const { createTextMeasurer } = await load<typeof import("../src/text/measure.ts")>("/src/text/measure.ts");
      const { hitTest } = await load<typeof import("../src/select/select.ts")>("/src/select/select.ts");

      const generated = generateDiagram({ count: 500 });
      const others = generated.elements.filter((e) => e.kind === "node" && e.id !== hub).map((e) => e.id);
      const extra = Array.from({ length: hubEdges }, (_, i) => ({ id: `hub${String(i)}`, to: others[(i * 13) % others.length] as string }));
      const elements = [
        ...generated.elements.map((e, i) => (e.kind === "edge" ? { ...e, label: `link ${String(i)}` } : e)),
        ...extra.map(({ id, to }) => ({ kind: "edge" as const, id, from: hub, to, label: id })),
      ];
      const overrides = elements.filter((e, i) => e.kind === "edge" && i % 3 === 0).map((e) => ({ id: e.id, props: { route: "elbow" as const } }));
      const text = writeDiagram({
        ...generated,
        elements,
        style: { ...generated.style, overrides },
        layout: [...generated.layout, ...extra.map(({ id }) => ({ id, x: 0, y: 0 }))],
      });

      const shell = await startShell(document.getElementById("app") as HTMLElement, new MemoryStorage({ "perf.drawit.kdl": text }));
      shell.setView({ x: 0, y: 0, scale: 1 });

      // Counted from watchRedraws on: the first draw has measured every text.
      let measured = 0;
      const measureText: (this: CanvasRenderingContext2D, value: string) => TextMetrics = Reflect.get(CanvasRenderingContext2D.prototype, "measureText");
      CanvasRenderingContext2D.prototype.measureText = function (this: CanvasRenderingContext2D, value: string) {
        measured++;
        return measureText.call(this, value);
      };

      const root = document.querySelector(".elements") as SVGGElement;
      const idOf = (node: Node | null): string => {
        let n = node;
        while (n && n.parentNode !== root) n = n.parentNode;
        return n instanceof Element ? (n.getAttribute("data-id") ?? "") : "";
      };
      const touched = new Set<string>();
      const collect = (records: MutationRecord[]): void => {
        for (const r of records) {
          if (r.target !== root) {
            touched.add(idOf(r.target));
            continue;
          }
          for (const n of [...r.addedNodes, ...r.removedNodes]) if (n instanceof Element) touched.add(n.getAttribute("data-id") ?? "");
        }
      };
      let observer: MutationObserver | null = null;

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
          const edges = doc?.elements.filter((e) => e.kind === "edge") ?? [];
          return {
            elements: doc?.elements.length ?? 0,
            edges: edges.length,
            labelledEdges: edges.filter((e) => e.label).length,
            labelledNodes: doc?.elements.filter((e) => e.kind === "node" && e.label).length ?? 0,
          };
        },
        select: (ids) => {
          if (shell.file) shell.file.history.selection = ids;
          shell.refresh();
        },
        attachedEdges: (id) =>
          shell.file?.document.elements.filter((e) => e.kind === "edge" && (e.from === id || e.to === id)).map((e) => e.id) ?? [],
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
        watchRedraws: () => {
          touched.clear();
          observer?.disconnect();
          observer = new MutationObserver(collect);
          observer.observe(root, { childList: true, attributes: true, characterData: true, subtree: true });
          measured = 0;
        },
        redrawn: () => {
          if (observer) collect(observer.takeRecords());
          observer?.disconnect();
          return [...touched];
        },
        measureCalls: () => measured,
      };
    },
    { hub: HUB, hubEdges: HUB_EDGES },
  );
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

/**
 * Presses at `from` and moves along `path`, one pointermove per animation frame. Returns the frame
 * gaps and handler times after the first ten. `beforeRelease` runs while the button is still down,
 * since releasing commits the drag with one full redraw.
 */
async function dragAndMeasure(
  page: Page,
  from: { x: number; y: number },
  path: (i: number) => { x: number; y: number },
  beforeRelease: () => Promise<void> = () => Promise.resolve(),
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
  await beforeRelease();
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

async function canvasOrigin(page: Page): Promise<{ x: number; y: number }> {
  const r = await page.locator(".canvas").boundingBox();
  return { x: r?.x ?? 0, y: r?.y ?? 0 };
}

test("the file has 500 elements and 20 more edges, with labels on shapes and on every edge", async ({ page }) => {
  const counts = await call(page, "counts");
  expect(counts.elements).toBe(500 + HUB_EDGES);
  expect(counts.edges).toBeGreaterThan(100 + HUB_EDGES);
  expect(counts.labelledEdges).toBe(counts.edges);
  expect(counts.labelledNodes).toBeGreaterThan(250);
  expect(await page.locator(".elements > g > text").count()).toBeGreaterThan(counts.edges);
  expect((await call(page, "attachedEdges", HUB)).length).toBeGreaterThanOrEqual(HUB_EDGES);
});

test("dragging a selection of shapes holds the 60fps frame budget @budget", async ({ page, browserName }) => {
  skipFrameBudgetOnCiWebkit(browserName);
  const ids = Array.from({ length: SELECTED }, (_, i) => `n${String(i + 1)}`);
  await call(page, "select", ids);
  const world = await call(page, "pressPoint", ids);
  const o = await canvasOrigin(page);
  const from = { x: o.x + world.x, y: o.y + world.y };
  const measured = await dragAndMeasure(page, from, (i) => ({ x: from.x + 150 * Math.sin(i / 10), y: from.y + 80 * Math.sin(i / 5) }));
  expect(missedShare(browserName, "selection drag", measured)).toBeLessThanOrEqual(MAX_MISSED_SHARE);
});

test("resizing a shape with 20 labelled edges holds the budget, redraws only its own edges and measures no text again @budget", async ({ page, browserName }) => {
  skipFrameBudgetOnCiWebkit(browserName);
  await call(page, "select", [HUB]);
  const handle = await page.locator('[data-handle="se"]').boundingBox();
  if (!handle) throw new Error("no resize handle");
  const from = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  await call(page, "watchRedraws");
  let redrawn: string[] = [];
  let measureCalls = -1;
  const measured = await dragAndMeasure(
    page,
    from,
    (i) => ({ x: from.x + 40 + 30 * Math.sin(i / 8), y: from.y + 20 + 15 * Math.sin(i / 5) }),
    async () => {
      redrawn = await call(page, "redrawn");
      measureCalls = await call(page, "measureCalls");
    },
  );
  const attached = new Set([HUB, ...(await call(page, "attachedEdges", HUB))]);
  expect(redrawn).toContain(HUB);
  expect(redrawn.filter((id) => !attached.has(id))).toEqual([]);
  expect(measureCalls).toBe(0);
  expect(missedShare(browserName, "hub resize", measured)).toBeLessThanOrEqual(MAX_MISSED_SHARE);
});

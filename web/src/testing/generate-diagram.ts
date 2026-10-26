import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";

export type GeneratedKind = "frame" | "node" | "shape" | "text" | "edge";

export interface GenerateOptions {
  /** Total number of elements. Default 500 (spec 7.1). */
  count?: number;
  /** Same seed, same document. */
  seed?: number;
  /** Relative share per kind. Kinds left out get none. Default: 60% nodes, 35% edges, the rest text, frames and shapes. */
  ratios?: Partial<Record<GeneratedKind, number>>;
}

const DEFAULT_RATIOS: Record<GeneratedKind, number> = { node: 0.6, edge: 0.35, text: 0.03, frame: 0.01, shape: 0.01 };

/** Kinds in structure order: frames sit behind everything, edges come last. */
const KINDS: GeneratedKind[] = ["frame", "node", "shape", "text", "edge"];

const NODE_SHAPES = ["rect", "ellipse", "arch.server", "arch.database", "arch.queue"];

const CELL_W = 240;
const CELL_H = 140;
const NODE_W = 160;
const NODE_H = 60;

/** mulberry32: small seeded generator, enough for reproducible test data. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Splits `count` by ratio, largest remainder first, so the parts always sum to `count`. */
function allocate(count: number, ratios: Record<GeneratedKind, number>): Record<GeneratedKind, number> {
  const sum = KINDS.reduce((total, k) => total + ratios[k], 0);
  const exact = KINDS.map((k) => (ratios[k] / sum) * count);
  const counts = exact.map(Math.floor);
  let left = count - counts.reduce((total, c) => total + c, 0);
  const byRemainder = KINDS.map((_, i) => i).sort(
    (a, b) => (exact[b] ?? 0) - (counts[b] ?? 0) - ((exact[a] ?? 0) - (counts[a] ?? 0)) || a - b,
  );
  for (const i of byRemainder) {
    if (left === 0) break;
    counts[i] = (counts[i] ?? 0) + 1;
    left--;
  }
  return Object.fromEntries(KINDS.map((k, i) => [k, counts[i] ?? 0])) as Record<GeneratedKind, number>;
}

/** Builds a deterministic test diagram for the performance budgets (spec 7.1). */
export function generateDiagram(options: GenerateOptions = {}): DiagramDocument {
  const { count = 500, seed = 1, ratios: given = DEFAULT_RATIOS } = options;
  if (!Number.isInteger(count) || count < 0) throw new Error(`count must be a non-negative integer, got ${String(count)}`);
  const ratios = Object.fromEntries(KINDS.map((k) => [k, given[k] ?? 0])) as Record<GeneratedKind, number>;
  if (KINDS.some((k) => !(ratios[k] >= 0))) throw new Error("ratios must be zero or greater");
  if (KINDS.every((k) => ratios[k] === 0)) throw new Error("at least one ratio must be above zero");

  const n = allocate(count, ratios);
  if (n.edge > 0 && n.node < 2) throw new Error("edges need at least two nodes");

  const rand = random(seed);
  const pick = (max: number): number => Math.floor(rand() * max);
  const cols = Math.max(1, Math.ceil(Math.sqrt(n.node)));
  const rows = Math.max(1, Math.ceil(n.node / cols));
  const width = cols * CELL_W;
  const height = rows * CELL_H;

  const elements: DiagramElement[] = [];
  const layout: LayoutEntry[] = [];
  const nodePos: { x: number; y: number }[] = [];

  for (let i = 0; i < n.frame; i++) {
    const id = `f${String(i + 1)}`;
    elements.push({ kind: "frame", id, name: `Frame ${String(i + 1)}` });
    layout.push({ id, x: pick(width), y: pick(height), w: 720, h: 640 });
  }
  for (let i = 0; i < n.node; i++) {
    const id = `n${String(i + 1)}`;
    elements.push({ kind: "node", id, label: `Node ${String(i + 1)}`, shape: NODE_SHAPES[i % NODE_SHAPES.length] ?? "rect" });
    const pos = { x: (i % cols) * CELL_W, y: Math.floor(i / cols) * CELL_H };
    nodePos.push(pos);
    layout.push({ id, ...pos, w: NODE_W, h: NODE_H });
  }
  for (let i = 0; i < n.shape; i++) {
    const id = `s${String(i + 1)}`;
    elements.push({ kind: "shape", id, shape: "rect" });
    layout.push({ id, x: pick(width), y: pick(height), w: 200, h: 120 });
  }
  for (let i = 0; i < n.text; i++) {
    const id = `t${String(i + 1)}`;
    elements.push({ kind: "text", id, content: `Text ${String(i + 1)}` });
    layout.push({ id, x: pick(width), y: pick(height), w: 200 });
  }
  // Each edge joins a node to a grid neighbour, as in a typical connected diagram.
  const offsets = [1, -1, cols, -cols];
  for (let i = 0; i < n.edge; i++) {
    const id = `e${String(i + 1)}`;
    const from = pick(n.node);
    let to = from + (offsets[pick(offsets.length)] ?? 1);
    if (to < 0 || to >= n.node) to = from === 0 ? 1 : from - 1;
    elements.push({ kind: "edge", id, from: `n${String(from + 1)}`, to: `n${String(to + 1)}` });
    layout.push({ id, x: nodePos[from]?.x ?? 0, y: nodePos[from]?.y ?? 0, from: "auto", to: "auto" });
  }

  return {
    version: 1,
    title: "Generated",
    plugins: [{ id: "core", version: 1 }],
    elements,
    style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
    layout,
  };
}

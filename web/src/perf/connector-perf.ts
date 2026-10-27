// Connectors on a generated 500-element file. Edges are routed with
// `routing.ts`; dragging a shape re-routes only the edges attached to it. Also hosts the
// re-attach gesture: drag an edge's end handle onto a shape or onto empty canvas.
import type { Anchor, Point } from "../model/layout.ts";
import type { Box } from "../render/boxes.ts";
import { generateDiagram } from "../testing/generate-diagram.ts";
import { attachTarget, type End, route, type ShapeKind, type Target } from "../connectors/routing.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_W = 160;
const DEFAULT_H = 60;
/** Extra edges from one hub node, so a single drag moves 20 connected edges. */
const HUB_EDGES = 20;

interface Node {
  id: string;
  box: Box;
  shape: ShapeKind;
  group: SVGGElement;
  /** Frames are regions for export, not things an edge attaches to. */
  frame: boolean;
}

interface EdgeState {
  id: string;
  from: string | null;
  to: string | null;
  fromAnchor: Anchor;
  toAnchor: Anchor;
  fromPoint: Point | null;
  toPoint: Point | null;
  kind: "straight" | "elbow";
  via: Point[];
  path: SVGPathElement;
}

export interface DragRun {
  elements: number;
  edges: number;
  elbowEdges: number;
  selected: number;
  rerouted: number;
  moved: number;
  frameMs: number[];
  scriptMs: number[];
}

function svg<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

const params = new URLSearchParams(location.search);
const root = document.getElementById("canvas") as unknown as SVGSVGElement;
const doc = generateDiagram({ count: 500 });

const nodes = new Map<string, Node>();
const edges = new Map<string, EdgeState>();
/** Edges attached to each node, so a move visits only those. */
const attached = new Map<string, Set<EdgeState>>();
const selection = new Set<string>();
let reroutedCount = 0;

const defs = svg("defs");
const marker = svg("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: "auto-start-reverse" });
marker.append(svg("path", { d: "M0 0L10 5L0 10z", fill: "#444" }));
defs.append(marker);
root.append(defs);
const edgeLayer = svg("g");
const nodeLayer = svg("g");
const handleLayer = svg("g");
root.append(edgeLayer, nodeLayer, handleLayer);

const targets = (): Target[] => [...nodes.values()].filter((n) => !n.frame).map((n) => ({ id: n.id, box: n.box, shape: n.shape }));

function addNode(id: string, label: string, box: Box, shape: ShapeKind, frame = false): void {
  const g = svg("g", { transform: `translate(${String(box.x)} ${String(box.y)})`, "data-id": id });
  g.append(
    shape === "ellipse"
      ? svg("ellipse", { cx: box.w / 2, cy: box.h / 2, rx: box.w / 2, ry: box.h / 2, fill: "#dbe8f5", stroke: "#1f4e79" })
      : svg("rect", { width: box.w, height: box.h, rx: 6, fill: frame ? "none" : "#dbe8f5", stroke: "#1f4e79" }),
  );
  const text = svg("text", { x: box.w / 2, y: box.h / 2 + 5, "text-anchor": "middle", "font-size": 14 });
  text.textContent = label;
  g.append(text);
  nodeLayer.append(g);
  nodes.set(id, { id, box, shape, group: g, frame });
}

const endOf = (edge: EdgeState, which: "from" | "to"): End => {
  const id = which === "from" ? edge.from : edge.to;
  const node = id ? nodes.get(id) : undefined;
  if (node) return { box: node.box, shape: node.shape, anchor: which === "from" ? edge.fromAnchor : edge.toAnchor };
  return { point: (which === "from" ? edge.fromPoint : edge.toPoint) ?? { x: 0, y: 0 } };
};

const pathData = (points: Point[]): string => points.map((p, i) => `${i === 0 ? "M" : "L"}${String(p.x)} ${String(p.y)}`).join("");

function routeEdge(edge: EdgeState): void {
  const points = route(endOf(edge, "from"), endOf(edge, "to"), { route: edge.kind, via: edge.via });
  edge.path.setAttribute("d", pathData(points));
  reroutedCount++;
}

function attach(edge: EdgeState): void {
  for (const id of [edge.from, edge.to]) if (id) (attached.get(id) ?? attached.set(id, new Set()).get(id))?.add(edge);
}
function detachIndex(edge: EdgeState): void {
  for (const id of [edge.from, edge.to]) if (id) attached.get(id)?.delete(edge);
}

function addEdge(spec: { id: string; from: string; to: string; kind: "straight" | "elbow"; via?: Point[] }): EdgeState {
  const path = svg("path", { class: "edge", "data-route": spec.kind, fill: "none", stroke: "#444", "stroke-width": 1.5, "marker-end": "url(#arrow)" });
  const edge: EdgeState = { ...spec, fromAnchor: "auto", toAnchor: "auto", fromPoint: null, toPoint: null, via: spec.via ?? [], path };
  edges.set(edge.id, edge);
  attach(edge);
  edgeLayer.append(path);
  routeEdge(edge);
  return edge;
}

// Build the scene: layout order is z-order. Every second edge is an elbow, every fifth has two bend points.
let edgeIndex = 0;
for (const entry of doc.layout) {
  const element = doc.elements.find((e) => e.id === entry.id);
  if (!element) continue;
  if (element.kind === "edge") continue;
  const box = { x: entry.x, y: entry.y, w: entry.w ?? DEFAULT_W, h: entry.h ?? DEFAULT_H };
  const label = element.kind === "node" ? (element.label ?? element.id) : element.kind === "text" ? element.content : "";
  addNode(element.id, label, box, element.kind === "node" && element.shape === "ellipse" ? "ellipse" : "rect", element.kind === "frame");
}
for (const element of doc.elements) {
  if (element.kind !== "edge" || !element.from || !element.to || !nodes.has(element.from) || !nodes.has(element.to)) continue;
  const from = nodes.get(element.from) as Node;
  const to = nodes.get(element.to) as Node;
  const mid = { x: (from.box.x + to.box.x) / 2 + 40, y: (from.box.y + to.box.y) / 2 + 40 };
  addEdge({
    id: element.id,
    from: element.from,
    to: element.to,
    kind: edgeIndex % 2 === 0 ? "elbow" : "straight",
    ...(edgeIndex % 5 === 0 ? { via: [mid, { x: mid.x, y: mid.y + 30 }] } : {}),
  });
  edgeIndex++;
}
const hubId = "n1";
const nodeIds = [...nodes.keys()].filter((id) => id.startsWith("n") && id !== hubId);
for (let i = 0; i < HUB_EDGES; i++) {
  addEdge({ id: `hub${String(i)}`, from: hubId, to: nodeIds[(i * 13) % nodeIds.length] as string, kind: i % 2 === 0 ? "elbow" : "straight" });
}

const mode = params.get("mode") === "selection" ? "selection" : "hub";
if (mode === "hub") selection.add(hubId);
else {
  const wanted = Number(params.get("select") ?? 100);
  for (const id of nodeIds) {
    if (selection.size >= wanted) break;
    selection.add(id);
  }
}

/** Moves the selection to its start positions plus (dx, dy) and re-routes the edges attached to it. */
function move(starts: Map<string, Box>, dx: number, dy: number): void {
  const touched = new Set<EdgeState>();
  for (const id of selection) {
    const start = starts.get(id);
    const node = nodes.get(id);
    if (!start || !node) continue;
    node.box.x = start.x + dx;
    node.box.y = start.y + dy;
    node.group.setAttribute("transform", `translate(${String(node.box.x)} ${String(node.box.y)})`);
    for (const edge of attached.get(id) ?? []) touched.add(edge);
  }
  for (const edge of touched) routeEdge(edge);
}

// Pointer drag of the selection, and of an edge end handle.
let dragStart: { x: number; y: number; boxes: Map<string, Box> } | null = null;
let endDrag: { edge: EdgeState; which: "from" | "to" } | null = null;

root.addEventListener("pointerdown", (event) => {
  const target = event.target as Element;
  const end = target.getAttribute("data-end");
  const edgeId = target.getAttribute("data-edge");
  if ((end === "from" || end === "to") && edgeId) {
    endDrag = { edge: edges.get(edgeId) as EdgeState, which: end };
    return;
  }
  const id = target.closest("g")?.getAttribute("data-id");
  if (!id || !selection.has(id)) return;
  dragStart = { x: event.clientX, y: event.clientY, boxes: new Map([...selection].map((s) => [s, { ...(nodes.get(s) as Node).box }])) };
});
root.addEventListener("pointermove", (event) => {
  if (dragStart) move(dragStart.boxes, event.clientX - dragStart.x, event.clientY - dragStart.y);
  else if (endDrag) {
    // The end follows the pointer as a free point until release.
    const { edge, which } = endDrag;
    const p = { x: event.clientX, y: event.clientY };
    detachIndex(edge);
    if (which === "from") Object.assign(edge, { from: null, fromPoint: p });
    else Object.assign(edge, { to: null, toPoint: p });
    attach(edge);
    routeEdge(edge);
    drawHandles(edge);
  }
});
root.addEventListener("pointerup", (event) => {
  if (endDrag) {
    const { edge, which } = endDrag;
    endDrag = null;
    const p = { x: event.clientX, y: event.clientY };
    const own = new Set<string>();
    const hit = attachTarget(targets(), p, own);
    detachIndex(edge);
    if (hit) {
      if (which === "from") Object.assign(edge, { from: hit.id, fromAnchor: hit.anchor, fromPoint: null });
      else Object.assign(edge, { to: hit.id, toAnchor: hit.anchor, toPoint: null });
    } else if (which === "from") Object.assign(edge, { from: null, fromAnchor: "auto", fromPoint: p });
    else Object.assign(edge, { to: null, toAnchor: "auto", toPoint: p });
    attach(edge);
    routeEdge(edge);
    drawHandles(edge);
  }
  dragStart = null;
});

function drawHandles(edge: EdgeState): void {
  handleLayer.replaceChildren();
  const points = (edge.path.getAttribute("d") ?? "").split(/(?=[ML])/).map((s) => s.slice(1).split(" ").map(Number));
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return;
  for (const [which, p] of [["from", first], ["to", last]] as const) {
    handleLayer.append(svg("circle", { cx: p[0] ?? 0, cy: p[1] ?? 0, r: 6, fill: "#fff", stroke: "#1a73e8", "stroke-width": 2, "data-end": which, "data-edge": edge.id }));
  }
}

/** Distance from `p` to the outline of `node`. */
function outlineGap(node: Node, p: Point): number {
  const { x, y, w, h } = node.box;
  if (node.shape === "rect") {
    const dx = Math.max(x - p.x, 0, p.x - (x + w));
    const dy = Math.max(y - p.y, 0, p.y - (y + h));
    if (dx > 0 || dy > 0) return Math.hypot(dx, dy);
    return Math.min(p.x - x, x + w - p.x, p.y - y, y + h - p.y);
  }
  const k = Math.hypot((p.x - x - w / 2) / (w / 2), (p.y - y - h / 2) / (h / 2));
  return Math.abs(k - 1) * Math.min(w, h) / 2;
}

const parse = (edge: EdgeState): Point[] =>
  (edge.path.getAttribute("d") ?? "").split(/(?=[ML])/).map((s) => {
    const [x, y] = s.slice(1).split(" ").map(Number);
    return { x: x ?? 0, y: y ?? 0 };
  });

/** Drags the selection in a circle, one pointermove per animation frame, and times each frame. */
function runDrag(frames: number): Promise<DragRun> {
  const firstId = [...selection][0] ?? "";
  const first = nodes.get(firstId)?.group.getBoundingClientRect();
  const x0 = (first?.x ?? 0) + 10;
  const y0 = (first?.y ?? 0) + 10;
  // Dispatch on the node itself: another element may be drawn over its corner.
  const target = nodes.get(firstId)?.group.firstElementChild ?? root;
  const fire = (type: string, x: number, y: number): void => {
    target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
  };
  const before = nodes.get(firstId)?.box.x ?? 0;
  const startReroutes = reroutedCount;
  const frameMs: number[] = [];
  const scriptMs: number[] = [];
  return new Promise((resolve) => {
    fire("pointerdown", x0, y0);
    let last = performance.now();
    let i = 0;
    const tick = (now: number): void => {
      frameMs.push(now - last);
      last = now;
      if (i === frames) {
        fire("pointerup", x0, y0);
        resolve({
          elements: doc.elements.length,
          edges: edges.size,
          elbowEdges: [...edges.values()].filter((e) => e.kind === "elbow").length,
          selected: selection.size,
          rerouted: reroutedCount - startReroutes,
          moved: Math.abs((nodes.get(firstId)?.box.x ?? 0) - before),
          frameMs: frameMs.slice(1),
          scriptMs,
        });
        return;
      }
      const angle = (i / 60) * Math.PI * 2;
      const t0 = performance.now();
      fire("pointermove", x0 + Math.cos(angle) * 200, y0 + Math.sin(angle) * 200);
      scriptMs.push(performance.now() - t0);
      i++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const connectorPerf = {
  runDrag,
  /** Elbow edges with a diagonal segment. */
  badElbows: (): number =>
    [...edges.values()].filter((e) => e.kind === "elbow" && parse(e).some((p, i, a) => i > 0 && p.x !== (a[i - 1] as Point).x && p.y !== (a[i - 1] as Point).y)).length,
  /** Largest distance from a hub edge's end to the hub's outline. */
  hubGap: (): number => {
    const hub = nodes.get(hubId) as Node;
    return Math.max(...[...edges.values()].filter((e) => e.from === hubId).map((e) => outlineGap(hub, parse(e)[0] as Point)));
  },
  /** Three shapes and one edge near the bottom of the window, with its end handles shown. */
  showDemo: (): void => {
    addNode("d1", "D1", { x: 100, y: 600, w: 100, h: 50 }, "rect");
    addNode("d2", "D2", { x: 500, y: 600, w: 100, h: 50 }, "rect");
    addNode("d3", "D3", { x: 800, y: 600, w: 100, h: 50 }, "ellipse");
    drawHandles(addEdge({ id: "demo", from: "d1", to: "d2", kind: "elbow" }));
  },
  /** A point inside the window with no attachable shape under it. */
  emptyPoint: (): Point => {
    const all = targets();
    for (let y = 100; y < 560; y += 10) for (let x = 100; x < 1200; x += 10) if (!attachTarget(all, { x, y })) return { x, y };
    throw new Error("no empty point");
  },
  edge: (id: string) => {
    const e = edges.get(id) as EdgeState;
    return { from: e.from, to: e.to, fromAnchor: e.fromAnchor, toAnchor: e.toAnchor, toPoint: e.toPoint };
  },
};
(window as unknown as { connectorPerf: typeof connectorPerf }).connectorPerf = connectorPerf;

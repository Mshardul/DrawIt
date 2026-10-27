// Draws a generated file as SVG with edges and drags a selection.
import type { DiagramDocument } from "../model/index.ts";
import { generateDiagram } from "../testing/generate-diagram.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_W = 160;
const DEFAULT_H = 60;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface EdgeView {
  path: SVGPathElement;
  from: string | null;
  to: string | null;
}

export interface DragRun {
  elements: number;
  edges: number;
  selected: number;
  moved: number;
  frameMs: number[];
  scriptMs: number[];
}

function svg<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

class Scene {
  readonly boxes = new Map<string, Box>();
  readonly groups = new Map<string, SVGGElement>();
  readonly edges: EdgeView[] = [];
  readonly selection = new Set<string>();

  readonly root: SVGSVGElement;
  readonly doc: DiagramDocument;

  constructor(root: SVGSVGElement, doc: DiagramDocument) {
    this.root = root;
    this.doc = doc;
    const defs = svg("defs");
    const marker = svg("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: "auto-start-reverse" });
    marker.append(svg("path", { d: "M0 0L10 5L0 10z", fill: "#444" }));
    defs.append(marker);
    root.append(defs);

    // Layout order is z-order, so draw in layout order.
    for (const entry of doc.layout) {
      const element = doc.elements.find((e) => e.id === entry.id);
      if (!element) continue;
      if (element.kind === "edge") {
        const path = svg("path", { fill: "none", stroke: "#444", "stroke-width": 1.5, "marker-end": "url(#arrow)" });
        this.edges.push({ path, from: element.from, to: element.to });
        root.append(path);
        continue;
      }
      const box = { x: entry.x, y: entry.y, w: entry.w ?? DEFAULT_W, h: entry.h ?? DEFAULT_H };
      this.boxes.set(element.id, box);
      const g = svg("g", { transform: `translate(${String(box.x)} ${String(box.y)})`, "data-id": element.id });
      if (element.kind === "text") {
        const text = svg("text", { y: 16, "font-size": 14 });
        text.textContent = element.content;
        g.append(text);
      } else {
        const ellipse = element.kind === "node" && element.shape === "ellipse";
        g.append(
          ellipse
            ? svg("ellipse", { cx: box.w / 2, cy: box.h / 2, rx: box.w / 2, ry: box.h / 2, fill: "#dbe8f5", stroke: "#1f4e79" })
            : svg("rect", { width: box.w, height: box.h, rx: 6, fill: element.kind === "frame" ? "none" : "#dbe8f5", stroke: "#1f4e79" }),
        );
        const label = element.kind === "node" ? (element.label ?? element.id) : "";
        if (label) {
          const text = svg("text", { x: box.w / 2, y: box.h / 2 + 5, "text-anchor": "middle", "font-size": 14 });
          text.textContent = label;
          g.append(text);
        }
      }
      this.groups.set(element.id, g);
      root.append(g);
    }
    for (const edge of this.edges) this.routeEdge(edge);
  }

  center(id: string | null): { x: number; y: number } {
    const box = id ? this.boxes.get(id) : undefined;
    return box ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : { x: 0, y: 0 };
  }

  routeEdge(edge: EdgeView): void {
    const a = this.center(edge.from);
    const b = this.center(edge.to);
    edge.path.setAttribute("d", `M${String(a.x)} ${String(a.y)}L${String(b.x)} ${String(b.y)}`);
  }

  /** Moves the selection by (dx, dy) from its start positions and re-routes attached edges. */
  move(starts: Map<string, Box>, dx: number, dy: number): void {
    for (const id of this.selection) {
      const start = starts.get(id);
      const box = this.boxes.get(id);
      if (!start || !box) continue;
      box.x = start.x + dx;
      box.y = start.y + dy;
      this.groups.get(id)?.setAttribute("transform", `translate(${String(box.x)} ${String(box.y)})`);
    }
    for (const edge of this.edges) {
      if ((edge.from && this.selection.has(edge.from)) || (edge.to && this.selection.has(edge.to))) this.routeEdge(edge);
    }
  }
}

const root = document.getElementById("canvas") as unknown as SVGSVGElement;
const scene = new Scene(root, generateDiagram({ count: 500 }));

const wanted = Number(new URLSearchParams(location.search).get("select") ?? 0);
for (const [id] of scene.boxes) {
  if (scene.selection.size >= wanted) break;
  if (id.startsWith("n")) scene.selection.add(id);
}

// Pointer drag: down on a selected node, move, up.
let dragStart: { x: number; y: number; boxes: Map<string, Box> } | null = null;
root.addEventListener("pointerdown", (event) => {
  const id = (event.target as Element).closest("g")?.getAttribute("data-id");
  if (!id || !scene.selection.has(id)) return;
  const boxes = new Map([...scene.selection].map((s) => [s, { ...(scene.boxes.get(s) as Box) }]));
  dragStart = { x: event.clientX, y: event.clientY, boxes };
});
root.addEventListener("pointermove", (event) => {
  if (dragStart) scene.move(dragStart.boxes, event.clientX - dragStart.x, event.clientY - dragStart.y);
});
root.addEventListener("pointerup", () => {
  dragStart = null;
});

/** Drags the selection in a circle, one pointermove per animation frame, and times each frame. */
function runDrag(frames: number): Promise<DragRun> {
  const first = scene.groups.get([...scene.selection][0] ?? "")?.getBoundingClientRect();
  const x0 = (first?.x ?? 0) + 10;
  const y0 = (first?.y ?? 0) + 10;
  const target = document.elementFromPoint(x0, y0) ?? root;
  const fire = (type: string, x: number, y: number): void => {
    target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
  };
  const before = scene.boxes.get([...scene.selection][0] ?? "")?.x ?? 0;
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
        const after = scene.boxes.get([...scene.selection][0] ?? "")?.x ?? 0;
        resolve({
          elements: scene.doc.elements.length,
          edges: scene.edges.length,
          selected: scene.selection.size,
          moved: Math.abs(after - before),
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

(window as unknown as { runDrag: typeof runDrag }).runDrag = runDrag;

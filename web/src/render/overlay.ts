// What the editor draws over the diagram: selection outlines, handles and the drag-box. Like
// `describeDiagram` it is data and holds no state. Each node is keyed by `data-id` so `mount`
// can reconcile it; strokes keep their screen width at any zoom.
import { routedEdges } from "../connectors/edges.ts";
import type { DiagramDocument, Point } from "../model/index.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { type Box, drawnBoxes, stackOrder } from "./boxes.ts";
import { handlesFor } from "../move/transform.ts";
import type { SvgNode } from "./describe.ts";

/** Side of a resize handle in screen px. */
const HANDLE_PX = 8;

const node = (attrs: SvgNode["attrs"], tag = "rect"): SvgNode => ({ tag, attrs: { "vector-effect": "non-scaling-stroke", ...attrs }, children: [] });

/**
 * Outlines for the selected shapes, text boxes and edges in z-order; resize handles for a lone
 * shape or an end handle on each end of a lone edge; then the drag-box if there is one, and the
 * line of an edge being drawn. Width and height of `marquee` may be negative.
 */
export function describeOverlay(
  doc: DiagramDocument,
  measurer: TextMeasurer,
  selection: string[],
  marquee: Box | null,
  scale = 1,
  draft: Point[] | null = null,
): SvgNode[] {
  const selected = new Set(selection);
  const boxes = new Map(drawnBoxes(doc, measurer).map((b) => [b.element.id, b]));
  const edges = routedEdges(doc, measurer, selected);
  const out: SvgNode[] = [];
  for (const id of stackOrder(doc)) {
    if (!selected.has(id)) continue;
    const b = boxes.get(id);
    const edge = edges.get(id);
    if (b) out.push(node({ "data-id": `select-${id}`, class: "selection", x: b.x, y: b.y, width: b.w, height: b.h, fill: "none" }));
    else if (edge) {
      const points = edge.points.map((p) => `${String(p.x)},${String(p.y)}`).join(" ");
      out.push(node({ "data-id": `select-${id}`, class: "selection", points, fill: "none" }, "polyline"));
    }
  }
  const size = HANDLE_PX / scale;
  const [only] = selection;
  const lone = selection.length === 1 && only !== undefined ? edges.get(only) : undefined;
  const ends = lone && ([["from", lone.points[0]], ["to", lone.points.at(-1)]] as const);
  for (const [end, p] of ends ?? []) {
    if (p) out.push(node({ "data-id": `end-${end}`, "data-end": end, class: "handle", x: p.x - size / 2, y: p.y - size / 2, width: size, height: size }));
  }
  for (const h of handlesFor(doc, measurer, selection)) {
    out.push(
      node({
        "data-id": `handle-${h.handle}`,
        "data-handle": h.handle,
        class: "handle",
        x: h.x - size / 2,
        y: h.y - size / 2,
        width: size,
        height: size,
      }),
    );
  }
  if (marquee) {
    out.push(
      node({
        "data-id": "marquee",
        class: "marquee",
        x: Math.min(marquee.x, marquee.x + marquee.w),
        y: Math.min(marquee.y, marquee.y + marquee.h),
        width: Math.abs(marquee.w),
        height: Math.abs(marquee.h),
      }),
    );
  }
  if (draft && draft.length > 0) {
    const points = draft.map((p) => `${String(p.x)},${String(p.y)}`).join(" ");
    out.push(node({ "data-id": "edge-draft", class: "draft", points, fill: "none" }, "polyline"));
  }
  return out;
}

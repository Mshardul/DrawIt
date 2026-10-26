// What the editor draws over the diagram: selection outlines and the drag-box. Like
// `describeDiagram` it is data and holds no state. Each node is keyed by `data-id` so `mount`
// can reconcile it; strokes keep their screen width at any zoom.
import type { DiagramDocument } from "../model/index.ts";
import { type Box, drawnBoxes } from "./boxes.ts";
import { handlesFor } from "../move/transform.ts";
import type { SvgNode } from "./describe.ts";

/** Side of a resize handle in screen px. */
const HANDLE_PX = 8;

const node = (attrs: SvgNode["attrs"]): SvgNode => ({ tag: "rect", attrs: { "vector-effect": "non-scaling-stroke", ...attrs }, children: [] });

/** Outlines for the selected drawn elements, resize handles for a lone one, then the drag-box if there is one. Width and height of `marquee` may be negative. */
export function describeOverlay(doc: DiagramDocument, selection: string[], marquee: Box | null, scale = 1): SvgNode[] {
  const selected = new Set(selection);
  const out = drawnBoxes(doc)
    .filter((b) => selected.has(b.element.id))
    .map((b) =>
      node({ "data-id": `select-${b.element.id}`, class: "selection", x: b.x, y: b.y, width: b.w, height: b.h, fill: "none" }),
    );
  const size = HANDLE_PX / scale;
  for (const h of handlesFor(doc, selection)) {
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
  return out;
}

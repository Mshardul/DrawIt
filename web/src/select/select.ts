// Selection rules as pure functions over the document, so they need no browser. They see what the
// renderer draws: shapes and text boxes by their boxes, edges by their routed paths, in one
// z-order. Frames, images and unknown elements cannot be selected until they are drawn.
import { routedEdges } from "../connectors/edges.ts";
import { distanceToPath, pathTouchesRect } from "../connectors/path.ts";
import type { DiagramDocument } from "../model/index.ts";
import { type Box, type DrawnBox, drawnBoxes, outlineKind, stackOrder } from "../render/boxes.ts";
import type { TextMeasurer } from "../text/measure.ts";
import type { Pt } from "../view/view.ts";

/** How close (screen px) the pointer must be to an edge's path to hit it. */
export const EDGE_REACH_PX = 4;

interface Pickable {
  id: string;
  locked: boolean;
  /** `reach` is the world distance from an edge's path that still counts as on it. */
  covers(p: Pt, reach: number): boolean;
  overlaps(rect: Box): boolean;
}

function boxPickable(box: DrawnBox): Pickable {
  return {
    id: box.element.id,
    locked: box.locked,
    covers(p) {
      if (outlineKind(box.element) === "ellipse") {
        const rx = box.w / 2;
        const ry = box.h / 2;
        const dx = (p.x - (box.x + rx)) / rx;
        const dy = (p.y - (box.y + ry)) / ry;
        return dx * dx + dy * dy <= 1;
      }
      return p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
    },
    overlaps: (r) => box.x <= r.x + r.w && box.x + box.w >= r.x && box.y <= r.y + r.h && box.y + box.h >= r.y,
  };
}

/** Everything that can be selected, bottom to top. */
function pickables(doc: DiagramDocument, measurer: TextMeasurer): Pickable[] {
  const boxes = new Map(drawnBoxes(doc, measurer).map((b) => [b.element.id, boxPickable(b)]));
  const edges = routedEdges(doc, measurer);
  const out: Pickable[] = [];
  for (const id of stackOrder(doc)) {
    const edge = edges.get(id);
    const picked =
      boxes.get(id) ??
      (edge && {
        id,
        locked: edge.locked,
        covers: (p: Pt, reach: number) => distanceToPath(edge.points, p) <= reach,
        overlaps: (r: Box) => pathTouchesRect(edge.points, r),
      });
    if (picked) out.push(picked);
  }
  return out;
}

/**
 * The topmost shape, text box or edge under the world point at the given zoom. A point counts as
 * on an edge within a fixed number of screen px of its path. Locked elements can be clicked.
 */
export function hitTest(doc: DiagramDocument, measurer: TextMeasurer, p: Pt, scale = 1): string | null {
  const reach = EDGE_REACH_PX / scale;
  const stack = pickables(doc, measurer);
  for (let i = stack.length - 1; i >= 0; i--) {
    const item = stack[i];
    if (item?.covers(p, reach)) return item.id;
  }
  return null;
}

/**
 * The selection after a click on `hit` (null for empty canvas). A plain click selects one element
 * and an empty click clears; an additive click (shift or Cmd/Ctrl) toggles. A plain click on an
 * element that is already selected keeps the selection, so dragging it moves all of them.
 */
export function clickSelection(selection: string[], hit: string | null, additive: boolean): string[] {
  if (hit === null) return additive ? selection : [];
  if (additive) return selection.includes(hit) ? selection.filter((id) => id !== hit) : [...selection, hit];
  return selection.includes(hit) ? selection : [hit];
}

/** The unlocked shapes and edges that overlap the world rectangle, in z-order. Width and height may be negative. */
export function idsInRect(doc: DiagramDocument, measurer: TextMeasurer, rect: Box): string[] {
  const box = { x: Math.min(rect.x, rect.x + rect.w), y: Math.min(rect.y, rect.y + rect.h), w: Math.abs(rect.w), h: Math.abs(rect.h) };
  return pickables(doc, measurer)
    .filter((item) => !item.locked && item.overlaps(box))
    .map((item) => item.id);
}

/** Every unlocked shape, text box and edge, in z-order. */
export function selectAll(doc: DiagramDocument, measurer: TextMeasurer): string[] {
  return pickables(doc, measurer)
    .filter((item) => !item.locked)
    .map((item) => item.id);
}

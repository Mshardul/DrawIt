// Selection rules as pure functions over the document, so they need no
// browser. They only see what the renderer draws (`drawnBoxes`): edges, frames, images and
// unknown elements cannot be selected until they are drawn.
import type { DiagramDocument } from "../model/index.ts";
import { type Box, type DrawnBox, drawnBoxes } from "../render/boxes.ts";
import type { TextMeasurer } from "../text/measure.ts";
import type { Pt } from "../view/view.ts";

function covers(box: DrawnBox, p: Pt): boolean {
  const { element } = box;
  if ((element.kind === "node" || element.kind === "shape") && element.shape === "ellipse") {
    const rx = box.w / 2;
    const ry = box.h / 2;
    const dx = (p.x - (box.x + rx)) / rx;
    const dy = (p.y - (box.y + ry)) / ry;
    return dx * dx + dy * dy <= 1;
  }
  return p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
}

/** The topmost drawn element whose outline contains the world point. Locked elements can be clicked. */
export function hitTest(doc: DiagramDocument, measurer: TextMeasurer, p: Pt): string | null {
  const boxes = drawnBoxes(doc, measurer);
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (box && covers(box, p)) return box.element.id;
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

/** The unlocked drawn elements whose box overlaps the world rectangle, in z-order. Width and height may be negative. */
export function idsInRect(doc: DiagramDocument, measurer: TextMeasurer, rect: Box): string[] {
  const x0 = Math.min(rect.x, rect.x + rect.w);
  const x1 = Math.max(rect.x, rect.x + rect.w);
  const y0 = Math.min(rect.y, rect.y + rect.h);
  const y1 = Math.max(rect.y, rect.y + rect.h);
  return drawnBoxes(doc, measurer)
    .filter((b) => !b.locked && b.x <= x1 && b.x + b.w >= x0 && b.y <= y1 && b.y + b.h >= y0)
    .map((b) => b.element.id);
}

/** Every unlocked drawn element, in z-order. */
export function selectAll(doc: DiagramDocument, measurer: TextMeasurer): string[] {
  return drawnBoxes(doc, measurer)
    .filter((b) => !b.locked)
    .map((b) => b.element.id);
}

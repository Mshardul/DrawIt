// Elements without a layout line are placed in a grid on open; their
// positions are written on save.
import type { DiagramDocument } from "../model/index.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { defaultSize } from "./size.ts";

const ROW_WIDTH = 1200;
const GAP = 80;

/**
 * Returns the document with a layout entry appended for every element that has none: left to
 * right in file order, wrapping at 1200px, at default size with 80px between elements. Edges have
 * no box and are left out. Returns `doc` itself when nothing needs placing.
 */
export function placeUnplaced(doc: DiagramDocument, measurer: TextMeasurer): DiagramDocument {
  const placed = new Set(doc.layout.map((entry) => entry.id));
  const added = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const element of doc.elements) {
    const size = defaultSize(element, measurer);
    if (!size || placed.has(element.id)) continue;
    if (x > 0 && x + size.w > ROW_WIDTH) {
      x = 0;
      y += rowHeight + GAP;
      rowHeight = 0;
    }
    added.push({ id: element.id, x, y });
    x += size.w + GAP;
    rowHeight = Math.max(rowHeight, size.h);
  }
  return added.length === 0 ? doc : { ...doc, layout: [...doc.layout, ...added] };
}

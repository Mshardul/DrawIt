// The canvas grid as data, like `describeDiagram`: one tiled pattern filling one large rect, so a
// pan or zoom touches attributes and never adds nodes. Lines keep a 1 screen px width, and the
// cell coarsens at low zoom so they never crowd (spec 2.2).
import { gridStep } from "../move/snap.ts";
import type { SvgNode } from "./describe.ts";

/** Half the side of the filled square, in world px. */
const EXTENT = 100_000;
const PATTERN_ID = "grid-pattern";

/** The pattern and the rect that fills the canvas with it, for grid size `size` at zoom `scale`. */
export function describeGrid(size: number, scale: number): SvgNode[] {
  const step = gridStep(size, scale);
  return [
    {
      tag: "pattern",
      attrs: { "data-id": PATTERN_ID, id: PATTERN_ID, width: step, height: step, patternUnits: "userSpaceOnUse" },
      children: [{ tag: "path", attrs: { class: "grid-line", d: `M ${String(step)} 0 H 0 V ${String(step)}`, fill: "none", "stroke-width": 1 / scale }, children: [] }],
    },
    {
      tag: "rect",
      attrs: { "data-id": "grid-fill", x: -EXTENT, y: -EXTENT, width: 2 * EXTENT, height: 2 * EXTENT, fill: `url(#${PATTERN_ID})`, "pointer-events": "none" },
      children: [],
    },
  ];
}

// The boxes of the elements the renderer draws, in z-order. Selection, hit-testing and zoom to fit
// share it, so they agree with what describeDiagram puts on screen.
import type { DiagramDocument, DiagramElement } from "../model/index.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { sizeOf } from "./size.ts";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DrawnBox extends Box {
  element: DiagramElement;
  locked: boolean;
}

/** Nodes, decorative shapes and text boxes; edges, frames, images and unknown elements are not drawn. */
export function isDrawn(element: DiagramElement): boolean {
  return element.kind === "node" || element.kind === "shape" || element.kind === "text";
}

/** Drawn elements with a layout entry, in layout order (bottom to top). */
export function drawnBoxes(doc: DiagramDocument, measurer: TextMeasurer): DrawnBox[] {
  const elements = new Map(doc.elements.map((e) => [e.id, e]));
  const out: DrawnBox[] = [];
  for (const entry of doc.layout) {
    const element = elements.get(entry.id);
    if (!element || !isDrawn(element)) continue;
    const size = sizeOf(element, entry, measurer);
    if (size) out.push({ element, x: entry.x, y: entry.y, w: size.w, h: size.h, locked: entry.locked === true });
  }
  return out;
}

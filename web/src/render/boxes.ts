// The boxes of the elements the renderer draws, in z-order. Selection, hit-testing and zoom to fit
// share it, so they agree with what describeDiagram puts on screen.
import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { sizeOf } from "./size.ts";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The outline an element is drawn, hit and connected with. Shapes without a dedicated outline use their bounding box. */
export type ShapeKind = "rect" | "ellipse";

export function outlineKind(element: DiagramElement): ShapeKind {
  const isShape = element.kind === "node" || element.kind === "shape";
  return isShape && (element.shape === "ellipse" || element.shape === "core.ellipse") ? "ellipse" : "rect";
}

export interface DrawnBox extends Box {
  element: DiagramElement;
  locked: boolean;
}

/** Nodes, decorative shapes and text boxes; edges, frames, images and unknown elements are not drawn. */
export function isDrawn(element: DiagramElement): boolean {
  return element.kind === "node" || element.kind === "shape" || element.kind === "text";
}

/** The box an element takes: its layout position with its layout or default size. Null for an element with no layout entry and for an edge, which has no box. */
export function elementBox(element: DiagramElement, entry: LayoutEntry | undefined, measurer: TextMeasurer): Box | null {
  const size = entry && sizeOf(element, entry, measurer);
  return entry && size ? { x: entry.x, y: entry.y, w: size.w, h: size.h } : null;
}

/** Drawn elements with a layout entry, in layout order (bottom to top). */
export function drawnBoxes(doc: DiagramDocument, measurer: TextMeasurer): DrawnBox[] {
  const elements = new Map(doc.elements.map((e) => [e.id, e]));
  const out: DrawnBox[] = [];
  for (const entry of doc.layout) {
    const element = elements.get(entry.id);
    const box = element && isDrawn(element) ? elementBox(element, entry, measurer) : null;
    if (element && box) out.push({ ...box, element, locked: entry.locked === true });
  }
  return out;
}

/**
 * The IDs of the elements that exist, bottom to top: layout order, which nodes and edges share,
 * then the edges that have no layout entry, on top in file order.
 */
export function stackOrder(doc: DiagramDocument): string[] {
  const known = new Set(doc.elements.map((e) => e.id));
  const placed = doc.layout.map((entry) => entry.id).filter((id) => known.has(id));
  const seen = new Set(placed);
  const unplaced = doc.elements.filter((e) => e.kind === "edge" && !seen.has(e.id)).map((e) => e.id);
  return [...placed, ...unplaced];
}

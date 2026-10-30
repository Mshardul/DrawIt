// Default sizes: `w` and `h` fall back to the shape default. These constants stand in for the
// sizes in shape pack manifests, all multiples of 8.
import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";
import { textLookFor } from "../style/of.ts";
import type { TextLook } from "../style/text-look.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { layoutTextBox } from "./text-layout.ts";

export const SHAPE_W = 160;
export const SHAPE_H = 80;
export const IMAGE_SIZE = 80;
export const FRAME_W = 480;
export const FRAME_H = 320;

export interface Size {
  w: number;
  h: number;
}

/** Default size of an element, or null for an edge, which has no box. A text box fits its content. */
export function defaultSize(element: DiagramElement, measurer: TextMeasurer, look: TextLook): Size | null {
  switch (element.kind) {
    case "node":
    case "shape":
    case "unknown":
      return { w: SHAPE_W, h: SHAPE_H };
    case "text":
      return layoutTextBox(element.content, undefined, measurer, look);
    case "image":
      return { w: IMAGE_SIZE, h: IMAGE_SIZE };
    case "frame":
      return { w: FRAME_W, h: FRAME_H };
    case "edge":
      return null;
  }
}

/**
 * The size layout gives an element, falling back to its default per axis. A text box takes only
 * `w` from layout: it wraps there, and its height is the wrapped lines.
 */
export function sizeOf(doc: DiagramDocument, element: DiagramElement, entry: LayoutEntry | undefined, measurer: TextMeasurer): Size | null {
  const look = textLookFor(doc, element);
  if (element.kind === "text") return layoutTextBox(element.content, entry?.w, measurer, look);
  const size = defaultSize(element, measurer, look);
  if (!size) return null;
  return { w: entry?.w ?? size.w, h: entry?.h ?? size.h };
}

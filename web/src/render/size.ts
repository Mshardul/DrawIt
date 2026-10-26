// Default sizes (spec 4.5: `w` and `h` fall back to the shape default). Shape packs (T-022) will
// supply manifest sizes; until then these constants stand in, all multiples of 8.
import type { DiagramElement, LayoutEntry } from "../model/index.ts";

export const SHAPE_W = 160;
export const SHAPE_H = 80;
export const TEXT_W = 160;
export const TEXT_LINE_H = 24;
export const IMAGE_SIZE = 80;
export const FRAME_W = 480;
export const FRAME_H = 320;

export interface Size {
  w: number;
  h: number;
}

/** Default size of an element, or null for an edge, which has no box. */
export function defaultSize(element: DiagramElement): Size | null {
  switch (element.kind) {
    case "node":
    case "shape":
    case "unknown":
      return { w: SHAPE_W, h: SHAPE_H };
    case "text":
      return { w: TEXT_W, h: element.content.split("\n").length * TEXT_LINE_H };
    case "image":
      return { w: IMAGE_SIZE, h: IMAGE_SIZE };
    case "frame":
      return { w: FRAME_W, h: FRAME_H };
    case "edge":
      return null;
  }
}

/** The size layout gives an element, falling back to its default per axis. */
export function sizeOf(element: DiagramElement, entry?: LayoutEntry): Size | null {
  const size = defaultSize(element);
  if (!size) return null;
  return { w: entry?.w ?? size.w, h: entry?.h ?? size.h };
}

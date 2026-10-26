// The view transform: pan and zoom of the canvas. It is not document state, so it never enters
// history or the file (spec 2.1). The renderer draws world coordinates into a wrapping group; the
// shell sets that group's `transform` from `viewTransform`.
import type { DiagramDocument } from "../model/index.ts";
import { type Box, drawnBoxes } from "../render/boxes.ts";

/** A world point appears on screen at `world * scale + (x, y)`. */
export interface View {
  x: number;
  y: number;
  scale: number;
}

export interface Pt {
  x: number;
  y: number;
}

export const IDENTITY: View = { x: 0, y: 0, scale: 1 };
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;

const clampScale = (scale: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

export const worldToScreen = (view: View, p: Pt): Pt => ({ x: p.x * view.scale + view.x, y: p.y * view.scale + view.y });

export const screenToWorld = (view: View, p: Pt): Pt => ({ x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale });

export const viewTransform = (view: View): string =>
  `translate(${String(view.x)} ${String(view.y)}) scale(${String(view.scale)})`;

export const panBy = (view: View, dx: number, dy: number): View => ({ ...view, x: view.x + dx, y: view.y + dy });

/** Multiplies the scale by `factor` (clamped), keeping the world point under screen point `at` fixed. */
export function zoomAt(view: View, at: Pt, factor: number): View {
  const scale = clampScale(view.scale * factor);
  const ratio = scale / view.scale;
  return { scale, x: at.x - (at.x - view.x) * ratio, y: at.y - (at.y - view.y) * ratio };
}

/** The box around every drawn element, or null when nothing is drawn. */
export function documentBounds(doc: DiagramDocument): Box | null {
  const boxes = drawnBoxes(doc);
  if (boxes.length === 0) return null;
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Fits `bounds` in the viewport with `margin` px around it, centred, never zooming in past 100%. */
export function zoomToFit(bounds: Box | null, viewport: { w: number; h: number }, margin: number): View {
  if (!bounds) return IDENTITY;
  const fit = Math.min((viewport.w - 2 * margin) / bounds.w, (viewport.h - 2 * margin) / bounds.h);
  const scale = clampScale(Math.min(1, fit));
  return {
    scale,
    x: viewport.w / 2 - (bounds.x + bounds.w / 2) * scale,
    y: viewport.h / 2 - (bounds.y + bounds.h / 2) * scale,
  };
}

/** How far a toolbar sits from the edges of the canvas, in px. */
export const TOOLBAR_MARGIN = 8;
/** The gap under a toolbar that has not been moved, in px. */
export const TOOLBAR_BOTTOM = 16;

export interface ToolbarPlace {
  x: number;
  y: number;
  /** Stored for a later preference. The editor still draws the toolbar. */
  shown: boolean;
}

/** An offset from the bottom centre that keeps the toolbar inside the canvas. */
export function clampToolbar(offset: { x: number; y: number }, canvas: { w: number; h: number }, bar: { w: number; h: number }): { x: number; y: number } {
  const restLeft = (canvas.w - bar.w) / 2;
  const restTop = canvas.h - bar.h - TOOLBAR_BOTTOM;
  const maxLeft = Math.max(TOOLBAR_MARGIN, canvas.w - bar.w - TOOLBAR_MARGIN);
  const maxTop = Math.max(TOOLBAR_MARGIN, canvas.h - bar.h - TOOLBAR_MARGIN);
  const left = Math.min(Math.max(restLeft + offset.x, TOOLBAR_MARGIN), maxLeft);
  const top = Math.min(Math.max(restTop - offset.y, TOOLBAR_MARGIN), maxTop);
  return { x: left - restLeft, y: restTop - top };
}

/** The toolbar entry in the preferences file. Missing fields sit at the bottom centre, shown. */
export function readToolbar(value: unknown): ToolbarPlace {
  if (typeof value !== "object" || value === null) return { x: 0, y: 0, shown: true };
  const record = value as Record<string, unknown>;
  const x = record["x"];
  const y = record["y"];
  const shown = record["shown"];
  return {
    x: typeof x === "number" && Number.isFinite(x) ? x : 0,
    y: typeof y === "number" && Number.isFinite(y) ? y : 0,
    shown: typeof shown === "boolean" ? shown : true,
  };
}

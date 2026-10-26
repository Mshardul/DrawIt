// Grid snapping helpers (spec 5.2). The grid is a view setting, not document state; a grid size
// of 0 means snapping is off.

/** Smallest on-screen gap (px) between drawn grid lines. */
export const MIN_GRID_PX = 8;

/** `value` rounded to the nearest multiple of `size` (halves round up); unchanged when `size` is 0. */
export const snapTo = (value: number, size: number): number => (size > 0 ? Math.floor(value / size + 0.5) * size : value);

/** The drawn cell size: `size` doubled until a cell is at least `MIN_GRID_PX` wide on screen at `scale`. */
export function gridStep(size: number, scale: number): number {
  let step = size;
  while (step * scale < MIN_GRID_PX) step *= 2;
  return step;
}

/** Cell sizes the status pill offers. */
export const GRID_SIZES = [4, 8, 16, 32, 64] as const;

/** How far a pill sits from the canvas edge, and the least gap between the two pills. */
export const PILL_INSET = 12;

/** Grid display and snap. View settings: not in history or the file. */
export interface GridSettings {
  show: boolean;
  snap: boolean;
  /** Cell size in world px. */
  size: number;
}

export const DEFAULT_GRID: GridSettings = { show: false, snap: false, size: 8 };

export type StatusFit = "full" | "short" | "hidden";

/** The grid entry in the preferences file. Missing fields use the defaults. */
export function readGrid(value: unknown): GridSettings {
  const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const size = record["size"];
  return {
    show: typeof record["show"] === "boolean" ? record["show"] : DEFAULT_GRID.show,
    snap: typeof record["snap"] === "boolean" ? record["snap"] : DEFAULT_GRID.snap,
    size: typeof size === "number" && (GRID_SIZES as readonly number[]).includes(size) ? size : DEFAULT_GRID.size,
  };
}

/** Full when both pills fit with `inset` between them, short without the cursor, hidden when neither fits. */
export function statusFit(stageWidth: number, fullWidth: number, shortWidth: number, fileWidth: number, inset = PILL_INSET): StatusFit {
  const room = stageWidth - fileWidth - inset * 3;
  if (fullWidth <= room) return "full";
  if (shortWidth <= room) return "short";
  return "hidden";
}

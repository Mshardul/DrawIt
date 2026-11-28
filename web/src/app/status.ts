import type { WheelMode } from "../view/input.ts";

export type { WheelMode };

/** Least and greatest grid size Preferences accepts, in world px. */
export const GRID_SIZE_MIN = 4;
export const GRID_SIZE_MAX = 128;

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

export const DEFAULT_WHEEL: WheelMode = "pan";

/** Grid, snap, size and wheel mode as Preferences edits them. */
export interface CanvasPrefs {
  grid(): GridSettings;
  setGrid(change: Partial<GridSettings>): void;
  wheel(): WheelMode;
  setWheel(mode: WheelMode): void;
}

export type StatusFit = "full" | "short" | "hidden";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

/** A whole grid size in range, or null when the value is not one. */
export function parseGridSize(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < GRID_SIZE_MIN || value > GRID_SIZE_MAX) return null;
  return value;
}

/** The grid entry in the preferences file. Missing fields use the defaults. */
export function readGrid(value: unknown): GridSettings {
  const record = asRecord(value);
  return {
    show: typeof record["show"] === "boolean" ? record["show"] : DEFAULT_GRID.show,
    snap: typeof record["snap"] === "boolean" ? record["snap"] : DEFAULT_GRID.snap,
    size: parseGridSize(record["size"]) ?? DEFAULT_GRID.size,
  };
}

/** The wheel entry in the preferences file. */
export function readWheel(value: unknown): WheelMode {
  return asRecord(value)["mode"] === "zoom" ? "zoom" : DEFAULT_WHEEL;
}

/** The status entry in the preferences file. */
export function readStatusShown(value: unknown): boolean {
  return asRecord(value)["shown"] !== false;
}

/** Full when both pills fit with `inset` between them, short without the cursor, hidden when neither fits. */
export function statusFit(stageWidth: number, fullWidth: number, shortWidth: number, fileWidth: number, inset = PILL_INSET): StatusFit {
  const room = stageWidth - fileWidth - inset * 3;
  if (fullWidth <= room) return "full";
  if (shortWidth <= room) return "short";
  return "hidden";
}

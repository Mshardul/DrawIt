// Layout section: geometry only, one entry per element, keyed by ID.
import type { KdlValue } from "./structure.ts";

/** Integer px at 1x zoom, absolute canvas coordinates. */
export interface Point {
  x: number;
  y: number;
}

export type Side = "top" | "right" | "bottom" | "left";

/** `auto` (nearest side, recomputed on move) or a side with an optional position 0..1 along it. */
export type Anchor = "auto" | { side: Side; at?: number };

export interface LayoutEntry {
  id: string;
  x: number;
  y: number;
  /** Falls back to the shape default when absent. */
  w?: number;
  h?: number;
  locked?: boolean;
  // Edge entries
  from?: Anchor;
  to?: Anchor;
  /** Position of an end written as `-` in structure. */
  fromPoint?: Point;
  toPoint?: Point;
  /** Bend points. */
  via?: Point[];
  /** Label position, 0..1 along the path. */
  labelAt?: number;
  /** Properties no installed pack defines, kept as written. */
  ext?: Record<string, KdlValue>;
}

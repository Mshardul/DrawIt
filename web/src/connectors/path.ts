// Geometry on a polyline, for picking an edge with the pointer.
import type { Point } from "../model/layout.ts";
import type { Box } from "../render/boxes.ts";

interface Foot {
  point: Point;
  distance: number;
  /** Where the foot lies on the segment, 0 at its start and 1 at its end. */
  t: number;
}

function footOnSegment(a: Point, b: Point, p: Point): Foot {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, distance: Math.hypot(p.x - point.x, p.y - point.y), t };
}

export interface NearestOnPath {
  point: Point;
  distance: number;
  /** How far along the path the point lies, as a fraction of its length: 0 at the start, 1 at the end. */
  along: number;
}

/** The point of the polyline nearest `p`; null for an empty path. A path with no length gives `along` 0. */
export function nearestOnPath(path: Point[], p: Point): NearestOnPath | null {
  const [first] = path;
  if (!first) return null;
  let total = 0;
  let best: { foot: Foot; before: number; length: number } | null = null;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Point;
    const b = path[i] as Point;
    const foot = footOnSegment(a, b, p);
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (!best || foot.distance < best.foot.distance) best = { foot, before: total, length };
    total += length;
  }
  if (!best) return { point: first, distance: Math.hypot(p.x - first.x, p.y - first.y), along: 0 };
  const along = total === 0 ? 0 : (best.before + best.foot.t * best.length) / total;
  return { point: best.foot.point, distance: best.foot.distance, along };
}

/** The point `along` (0..1, clamped) of the way along the polyline's length; null for an empty path. */
export function pointAlongPath(path: Point[], along: number): Point | null {
  const [first] = path;
  if (!first) return null;
  const lengths = path.slice(1).map((b, i) => Math.hypot(b.x - (path[i] as Point).x, b.y - (path[i] as Point).y));
  const total = lengths.reduce((sum, l) => sum + l, 0);
  let left = Math.min(1, Math.max(0, along)) * total;
  for (const [i, length] of lengths.entries()) {
    const a = path[i] as Point;
    const b = path[i + 1] as Point;
    if (left <= length) return length === 0 ? a : { x: a.x + ((b.x - a.x) * left) / length, y: a.y + ((b.y - a.y) * left) / length };
    left -= length;
  }
  return path.at(-1) ?? first;
}

/** The distance from `p` to the nearest point of the polyline; infinite for an empty path. */
export function distanceToPath(path: Point[], p: Point): number {
  return nearestOnPath(path, p)?.distance ?? Infinity;
}

/** Liang-Barsky: does the segment have any point inside the rectangle, edges included? */
function segmentTouchesRect(a: Point, b: Point, box: Box): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    return t0 <= t1;
  };
  return clip(-dx, a.x - box.x) && clip(dx, box.x + box.w - a.x) && clip(-dy, a.y - box.y) && clip(dy, box.y + box.h - a.y);
}

/** True when any part of the polyline lies inside the rectangle or on its edge. */
export function pathTouchesRect(path: Point[], box: Box): boolean {
  if (path.length === 1) {
    const [only] = path as [Point];
    return segmentTouchesRect(only, only, box);
  }
  return path.some((p, i) => i > 0 && segmentTouchesRect(path[i - 1] as Point, p, box));
}

// Geometry on a polyline, for picking an edge with the pointer.
import type { Point } from "../model/layout.ts";
import type { Box } from "../render/boxes.ts";

function distanceToSegment(a: Point, b: Point, p: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** The distance from `p` to the nearest point of the polyline; infinite for an empty path. */
export function distanceToPath(path: Point[], p: Point): number {
  const [first] = path;
  if (!first) return Infinity;
  if (path.length === 1) return Math.hypot(p.x - first.x, p.y - first.y);
  let nearest = Infinity;
  for (let i = 1; i < path.length; i++) nearest = Math.min(nearest, distanceToSegment(path[i - 1] as Point, path[i] as Point, p));
  return nearest;
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

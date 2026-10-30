// Geometry on a shape's flattened outline: a closed polygon in the element's own space. Hit-testing
// and straight routing use it, so a diamond is hit and connected along its edges, not its box.
import type { Point } from "../model/layout.ts";

/** Slack for a ray that starts on a segment or passes through a corner. */
const EPSILON = 1e-9;

/** True when `p` is inside the polygon (even-odd rule). */
export function insideOutline(outline: readonly Point[], p: Point): boolean {
  let inside = false;
  for (let i = 1; i < outline.length; i++) {
    const a = outline[i - 1] as Point;
    const b = outline[i] as Point;
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)) inside = !inside;
  }
  return inside;
}

/** True when `p` is within `margin` of the polygon's edge. */
export function nearOutline(outline: readonly Point[], p: Point, margin: number): boolean {
  for (let i = 1; i < outline.length; i++) {
    const a = outline[i - 1] as Point;
    const b = outline[i] as Point;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
    if (Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) <= margin) return true;
  }
  return false;
}

/**
 * Where the ray from `from` towards `toward` meets the outline for the last time, so a line never
 * ends inside a notch of the shape. Null when the ray does not meet the outline.
 */
export function exitPoint(outline: readonly Point[], from: Point, toward: Point): Point | null {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  let farthest = -Infinity;
  for (let i = 1; i < outline.length; i++) {
    const a = outline[i - 1] as Point;
    const b = outline[i] as Point;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denominator = dx * ey - dy * ex;
    if (denominator === 0) continue;
    const t = ((a.x - from.x) * ey - (a.y - from.y) * ex) / denominator;
    const u = ((a.x - from.x) * dy - (a.y - from.y) * dx) / denominator;
    if (t > 0 && u >= 0 && u <= 1 && t > farthest) farthest = t;
  }
  return farthest === -Infinity ? null : { x: from.x + dx * farthest, y: from.y + dy * farthest };
}

/**
 * Where the ray from `from` towards `toward` first meets the outline, `from` itself when it lies on
 * it. Null when the ray does not meet the outline.
 */
export function entryPoint(outline: readonly Point[], from: Point, toward: Point): Point | null {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  let nearest = Infinity;
  for (let i = 1; i < outline.length; i++) {
    const a = outline[i - 1] as Point;
    const b = outline[i] as Point;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denominator = dx * ey - dy * ex;
    if (denominator === 0) continue;
    const t = ((a.x - from.x) * ey - (a.y - from.y) * ex) / denominator;
    const u = ((a.x - from.x) * dy - (a.y - from.y) * dx) / denominator;
    if (t >= -EPSILON && u >= -EPSILON && u <= 1 + EPSILON && t < nearest) nearest = Math.max(0, t);
  }
  return nearest === Infinity ? null : { x: from.x + dx * nearest, y: from.y + dy * nearest };
}

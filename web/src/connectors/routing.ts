// Connector routing as a pure function from the two ends to a polyline. Straight routes clip the
// centre line to the outlines; elbow routes leave each shape along the normal of its side and turn
// at right angles. Elbows do not avoid shapes.
import type { Anchor, Point, Side } from "../model/layout.ts";
import type { Box, ShapeKind } from "../render/boxes.ts";
import { entryPoint, exitPoint, insideOutline, nearOutline } from "../shapes/outline.ts";

/** An end attached to a shape. */
export interface NodeEnd {
  box: Box;
  shape: ShapeKind;
  anchor: Anchor;
  /** The shape's outline as a closed polygon in the box's own space; absent for a shape routed by its box. */
  outline?: readonly Point[];
  /** The shape's default attach points for `auto`, in the box's own space; absent for a shape that has none. */
  anchors?: Readonly<Record<Side, Point>>;
}
/** An end attached to nothing. */
export interface PointEnd {
  point: Point;
}
export type End = NodeEnd | PointEnd;

export interface RouteOptions {
  route: "straight" | "elbow";
  /** Manual bend points, kept in order. */
  via?: Point[];
}

/** An element an end can attach to. */
export interface Target {
  id: string;
  box: Box;
  shape: ShapeKind;
  /** The shape's outline in the box's own space, as for a node end. */
  outline?: readonly Point[];
  /** The shape's default attach points, as for a node end. */
  anchors?: Readonly<Record<Side, Point>>;
  /** False for a shape with no filled inside: a drop attaches to it only on its outline. */
  filled?: boolean;
}

/** How close (px) a drop must be to the outline of a shape with no filled inside to attach to it. */
const OUTLINE_REACH = 6;

/** Length (px) an elbow runs straight out of a shape before it may turn. */
const STUB = 16;

const NORMAL: Record<Side, Point> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

const round = (v: number): number => Math.round(v * 100) / 100;
const centre = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const isNode = (end: End): end is NodeEnd => "box" in end;
const centreOf = (end: End): Point => (isNode(end) ? centre(end.box) : end.point);

/** The point on `side` of the shape's box, `at` (0..1) of the way along it. */
function boxPoint({ x, y, w, h }: Box, side: Side, at: number): Point {
  if (side === "top") return { x: x + w * at, y };
  if (side === "bottom") return { x: x + w * at, y: y + h };
  return { x: side === "left" ? x : x + w, y: y + h * at };
}

/**
 * The point on `side` of the shape, `at` (0..1, default the middle) of the way along it. A shape with
 * an outline is met by a line from that spot on its box running straight inward, and keeps the box
 * point where the line meets nothing.
 */
function sidePoint(end: NodeEnd, side: Side, at = 0.5): Point {
  const { x, y, w, h } = end.box;
  if (end.outline) {
    const start = boxPoint(end.box, side, at);
    const inward = NORMAL[side];
    const hit = entryPoint(end.outline, { x: start.x - x, y: start.y - y }, { x: start.x - x - inward.x, y: start.y - y - inward.y });
    return hit ? { x: hit.x + x, y: hit.y + y } : start;
  }
  if (end.shape === "rect") {
    if (side === "top") return { x: x + w * at, y };
    if (side === "bottom") return { x: x + w * at, y: y + h };
    return { x: side === "left" ? x : x + w, y: y + h * at };
  }
  const c = centre(end.box);
  if (side === "top" || side === "bottom") {
    const px = x + w * at;
    const k = (px - c.x) / (w / 2);
    const dy = Math.sqrt(Math.max(0, 1 - k * k)) * (h / 2);
    return { x: px, y: side === "top" ? c.y - dy : c.y + dy };
  }
  const py = y + h * at;
  const k = (py - c.y) / (h / 2);
  const dx = Math.sqrt(Math.max(0, 1 - k * k)) * (w / 2);
  return { x: side === "left" ? c.x - dx : c.x + dx, y: py };
}

/** The side of the shape that faces `toward`. */
function facingSide(box: Box, toward: Point): Side {
  const c = centre(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (Math.abs(dx) / box.w >= Math.abs(dy) / box.h) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

/** Where the line from the shape's centre towards `toward` leaves the shape. */
function clip(end: NodeEnd, toward: Point): Point {
  const c = centre(end.box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  if (end.outline) {
    const { x, y } = end.box;
    const hit = exitPoint(end.outline, { x: c.x - x, y: c.y - y }, { x: toward.x - x, y: toward.y - y });
    if (hit) return { x: hit.x + x, y: hit.y + y };
  }
  const t =
    end.shape === "rect"
      ? Math.min(end.box.w / 2 / Math.abs(dx || Number.EPSILON), end.box.h / 2 / Math.abs(dy || Number.EPSILON))
      : 1 / Math.hypot(dx / (end.box.w / 2), dy / (end.box.h / 2));
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** What each end looks towards: the nearest bend point, or the other end. */
function lookTargets(from: End, to: End, via: Point[]): [Point, Point] {
  return [via[0] ?? centreOf(to), via.at(-1) ?? centreOf(from)];
}

function straight(from: End, to: End, via: Point[]): Point[] {
  const [towardTo, towardFrom] = lookTargets(from, to, via);
  const end = (e: End, toward: Point): Point => {
    if (!isNode(e)) return e.point;
    return e.anchor === "auto" ? clip(e, toward) : sidePoint(e, e.anchor.side, e.anchor.at);
  };
  return [end(from, towardTo), ...via, end(to, towardFrom)];
}

interface Port {
  /** Where the line meets the shape (or the free point). */
  at: Point;
  /** The point after the stub; the same as `at` for a free end. */
  out: Point;
  dir: Point;
}

function port(end: End, toward: Point): Port {
  if (!isNode(end)) {
    const dx = toward.x - end.point.x;
    const dy = toward.y - end.point.y;
    const dir = Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) };
    return { at: end.point, out: end.point, dir };
  }
  const side = end.anchor === "auto" ? facingSide(end.box, toward) : end.anchor.side;
  const anchored = end.anchor === "auto" ? end.anchors?.[side] : undefined;
  const at = anchored ? { x: anchored.x + end.box.x, y: anchored.y + end.box.y } : sidePoint(end, side, end.anchor === "auto" ? 0.5 : end.anchor.at);
  const dir = NORMAL[side];
  // A shape with an outline can be met inside its box, so the stub starts at the box side.
  const edge = end.outline ? boxPoint(end.box, side, 0.5) : at;
  const out = dir.x !== 0 ? { x: edge.x + dir.x * STUB, y: at.y } : { x: at.x, y: edge.y + dir.y * STUB };
  return { at, out, dir };
}

/** The bends between two stub ends, for a path with no manual bend points. */
function join(a: Port, b: Port): Point[] {
  const p = a.out;
  const q = b.out;
  const ph = a.dir.x !== 0;
  const qh = b.dir.x !== 0;
  if (ph && qh) {
    const facing = a.dir.x * (q.x - p.x) > 0 && b.dir.x * (p.x - q.x) > 0;
    if (facing || a.dir.x === b.dir.x) {
      const xm = facing ? (p.x + q.x) / 2 : a.dir.x > 0 ? Math.max(p.x, q.x) : Math.min(p.x, q.x);
      return [{ x: xm, y: p.y }, { x: xm, y: q.y }];
    }
    const ym = (p.y + q.y) / 2;
    return [{ x: p.x, y: ym }, { x: q.x, y: ym }];
  }
  if (!ph && !qh) {
    const facing = a.dir.y * (q.y - p.y) > 0 && b.dir.y * (p.y - q.y) > 0;
    if (facing || a.dir.y === b.dir.y) {
      const ym = facing ? (p.y + q.y) / 2 : a.dir.y > 0 ? Math.max(p.y, q.y) : Math.min(p.y, q.y);
      return [{ x: p.x, y: ym }, { x: q.x, y: ym }];
    }
    const xm = (p.x + q.x) / 2;
    return [{ x: xm, y: p.y }, { x: xm, y: q.y }];
  }
  if (ph) {
    const ok = a.dir.x * (q.x - p.x) > 0 && b.dir.y * (p.y - q.y) > 0;
    return [ok ? { x: q.x, y: p.y } : { x: p.x, y: q.y }];
  }
  const ok = a.dir.y * (q.y - p.y) > 0 && b.dir.x * (p.x - q.x) > 0;
  return [ok ? { x: p.x, y: q.y } : { x: q.x, y: p.y }];
}

/** Joins `a` to `b` through a corner, turning first perpendicular to the way the path arrived. */
function leg(a: Point, b: Point, arrivedHorizontally: boolean): Point[] {
  if (a.x === b.x || a.y === b.y) return [];
  return [arrivedHorizontally ? { x: a.x, y: b.y } : { x: b.x, y: a.y }];
}

function elbow(from: End, to: End, via: Point[]): Point[] {
  const [towardTo, towardFrom] = lookTargets(from, to, via);
  const a = port(from, towardTo);
  const b = port(to, towardFrom);
  if (via.length === 0) return [a.at, a.out, ...join(a, b), b.out, b.at];
  const out: Point[] = [a.at, a.out];
  let horizontal = a.dir.x !== 0;
  let at = a.out;
  for (const next of [...via, b.out]) {
    const corner = leg(at, next, horizontal);
    out.push(...corner, next);
    const last = corner.at(-1) ?? at;
    horizontal = last.y === next.y && last.x !== next.x ? true : last.x === next.x && last.y !== next.y ? false : horizontal;
    at = next;
  }
  out.push(b.at);
  return out;
}

/** Drops repeated points and the middle point of three in a row on one axis. */
function tidy(path: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of path) {
    const q = { x: round(p.x), y: round(p.y) };
    const last = out.at(-1);
    if (last && last.x === q.x && last.y === q.y) continue;
    const before = out.at(-2);
    if (last && before && ((before.x === last.x && last.x === q.x) || (before.y === last.y && last.y === q.y))) out.pop();
    out.push(q);
  }
  return out;
}

/** The polyline from `from` to `to`. Ends recompute from the shapes; `via` points are kept. */
export function route(from: End, to: End, options: RouteOptions): Point[] {
  const via = options.via ?? [];
  const path = options.route === "straight" ? straight(from, to, via) : elbow(from, to, via);
  return options.route === "straight" ? path.map((p) => ({ x: round(p.x), y: round(p.y) })) : tidy(path);
}

const inside = (t: Target, p: Point): boolean => {
  const { x, y, w, h } = t.box;
  if (p.x < x || p.x > x + w || p.y < y || p.y > y + h) return false;
  if (t.outline) {
    const local = { x: p.x - x, y: p.y - y };
    return t.filled === false ? nearOutline(t.outline, local, OUTLINE_REACH) : insideOutline(t.outline, local);
  }
  if (t.shape === "rect") return true;
  return ((p.x - x - w / 2) / (w / 2)) ** 2 + ((p.y - y - h / 2) / (h / 2)) ** 2 <= 1;
};

/**
 * The topmost target under `p` (targets run bottom to top) with the side and position nearest
 * `p`, or null when `p` is over nothing and the end should detach. `exclude` skips elements.
 */
export function attachTarget(targets: Target[], p: Point, exclude: ReadonlySet<string> = new Set()): { id: string; anchor: Anchor } | null {
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i];
    if (!t || exclude.has(t.id) || !inside(t, p)) continue;
    const { x, y, w, h } = t.box;
    const distances: [Side, number][] = [["top", p.y - y], ["bottom", y + h - p.y], ["left", p.x - x], ["right", x + w - p.x]];
    const [side] = distances.reduce((best, d) => (d[1] < best[1] ? d : best));
    const along = side === "top" || side === "bottom" ? (p.x - x) / w : (p.y - y) / h;
    return { id: t.id, anchor: { side, at: round(Math.min(1, Math.max(0, along))) } };
  }
  return null;
}

// Outline and drawing paths in shape packs use absolute M, L, H, V, C, Q and Z only. That is
// enough for every flat shape in the standard, and every coordinate then stretches (A15) by
// mapping numbers: arcs and relative commands would need geometry, not mapping.
import type { Point } from "../model/layout.ts";

export type PathCommand = "M" | "L" | "H" | "V" | "C" | "Q" | "Z";
export interface PathSegment {
  cmd: PathCommand;
  args: number[];
}

const ARGS: Record<PathCommand, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, Z: 0 };
const TOKEN = /([A-Za-z])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;

const isCommand = (c: string): c is PathCommand => c in ARGS;

/** Parses `d`. Throws an Error naming the first thing it does not accept. */
export function parsePath(d: string): PathSegment[] {
  const out: PathSegment[] = [];
  let cmd: PathCommand | null = null;
  let nums: number[] = [];
  const flush = (): void => {
    if (cmd === null) return;
    const n = ARGS[cmd];
    if (n === 0 ? nums.length > 0 : nums.length === 0 || nums.length % n !== 0) {
      throw new Error(`${cmd} needs ${String(n)} number${n === 1 ? "" : "s"} per group, got ${String(nums.length)}`);
    }
    if (n === 0) out.push({ cmd, args: [] });
    for (let i = 0; i < nums.length; i += n) {
      // Extra pairs after a moveto are linetos.
      out.push({ cmd: cmd === "M" && i > 0 ? "L" : cmd, args: nums.slice(i, i + n) });
    }
    nums = [];
  };
  for (const m of d.matchAll(TOKEN)) {
    if (m[1] !== undefined) {
      flush();
      if (m[1] !== m[1].toUpperCase()) throw new Error(`relative command ${m[1]} is not allowed; use absolute commands`);
      if (!isCommand(m[1])) throw new Error(`command ${m[1]} is not allowed; use M, L, H, V, C, Q or Z`);
      cmd = m[1];
      if (out.length === 0 && cmd !== "M") throw new Error("a path must start with M");
    } else {
      if (cmd === null) throw new Error("a path must start with M");
      nums.push(Number(m[2]));
    }
  }
  if (cmd === null) throw new Error("a path must start with M");
  flush();
  if (out[0]?.cmd !== "M") throw new Error("a path must start with M");
  return out;
}

const fmt = (n: number): string => String(Number(n.toFixed(3)));

export function formatPath(segments: PathSegment[]): string {
  return segments.map((s) => [s.cmd, ...s.args.map(fmt)].join(" ")).join(" ");
}

export interface Polyline {
  points: Point[];
  /** The last command is Z. */
  closed: boolean;
  /** Number of M commands. */
  subpaths: number;
}

const CURVE_STEPS = 16;

/** The path as a polyline, curves sampled, for hit-testing and for checking the outline. */
export function flatten(segments: PathSegment[]): Polyline {
  const points: Point[] = [];
  let start: Point = { x: 0, y: 0 };
  let at: Point = { x: 0, y: 0 };
  let subpaths = 0;
  const add = (p: Point): void => {
    points.push(p);
    at = p;
  };
  for (const { cmd, args } of segments) {
    const a = (i: number): number => args[i] ?? 0;
    if (cmd === "M") {
      subpaths++;
      start = { x: a(0), y: a(1) };
      add(start);
    } else if (cmd === "L") add({ x: a(0), y: a(1) });
    else if (cmd === "H") add({ x: a(0), y: at.y });
    else if (cmd === "V") add({ x: at.x, y: a(0) });
    else if (cmd === "Z") add(start);
    else {
      const p0 = at;
      for (let s = 1; s <= CURVE_STEPS; s++) {
        const t = s / CURVE_STEPS;
        const u = 1 - t;
        points.push(
          cmd === "C"
            ? {
                x: u ** 3 * p0.x + 3 * u * u * t * a(0) + 3 * u * t * t * a(2) + t ** 3 * a(4),
                y: u ** 3 * p0.y + 3 * u * u * t * a(1) + 3 * u * t * t * a(3) + t ** 3 * a(5),
              }
            : {
                x: u * u * p0.x + 2 * u * t * a(0) + t * t * a(2),
                y: u * u * p0.y + 2 * u * t * a(1) + t * t * a(3),
              },
        );
      }
      at = points.at(-1) ?? at;
    }
  }
  return { points, closed: segments.at(-1)?.cmd === "Z", subpaths };
}

/** True when `p` is within `tolerance` of the polyline. */
export function pointOnOutline(poly: Polyline, p: Point, tolerance: number): boolean {
  for (let i = 1; i < poly.points.length; i++) {
    const a = poly.points[i - 1] as Point;
    const b = poly.points[i] as Point;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    if (Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) <= tolerance) return true;
  }
  return false;
}

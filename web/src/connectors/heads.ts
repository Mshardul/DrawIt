// The shapes drawn at the ends of an edge, as geometry. The renderer turns them into SVG.
import type { Point } from "../model/layout.ts";
import type { ArrowHead } from "../model/style.ts";

/** Arrowhead length along the path, and half its width, in px. */
export const HEAD_LENGTH = 10;
export const HEAD_HALF_WIDTH = 4;
export const DOT_RADIUS = 4;

export type HeadShape =
  | { kind: "arrow"; points: [Point, Point, Point] }
  | { kind: "dot"; centre: Point; r: number };

/**
 * The head at one end of `path`, or null for none. An arrow has its tip on the end point; a dot
 * sits just outside it. The direction is that of the last segment with length, so a path that
 * ends in a repeated point still points the right way.
 */
export function headShape(head: ArrowHead, path: Point[], at: "start" | "end"): HeadShape | null {
  if (head === "none") return null;
  const ordered = at === "end" ? [...path].reverse() : path;
  const tip = ordered[0];
  const neighbour = ordered.find((p) => tip && (p.x !== tip.x || p.y !== tip.y));
  if (!tip || !neighbour) return null;
  const length = Math.hypot(tip.x - neighbour.x, tip.y - neighbour.y);
  const out = { x: (tip.x - neighbour.x) / length, y: (tip.y - neighbour.y) / length };
  if (head === "dot") return { kind: "dot", centre: { x: tip.x + out.x * DOT_RADIUS, y: tip.y + out.y * DOT_RADIUS }, r: DOT_RADIUS };
  const base = { x: tip.x - out.x * HEAD_LENGTH, y: tip.y - out.y * HEAD_LENGTH };
  const side = { x: -out.y * HEAD_HALF_WIDTH, y: out.x * HEAD_HALF_WIDTH };
  return {
    kind: "arrow",
    points: [tip, { x: base.x + side.x, y: base.y + side.y }, { x: base.x - side.x, y: base.y - side.y }],
  };
}

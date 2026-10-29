// Manual bend points of an edge: adding, moving and removing one. Each is one command that writes
// the whole `via` list. Pure functions over the document.
import type { Command } from "../commands/command.ts";
import type { DiagramDocument, Point } from "../model/index.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { routedEdges } from "./edges.ts";
import { nearestOnPath } from "./path.ts";

const roundPoint = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });

/** The bend points of an unlocked edge, or null for an unknown or locked edge or an element that is not an edge. */
function bendsOf(doc: DiagramDocument, edgeId: string): Point[] | null {
  const edge = doc.elements.find((e) => e.id === edgeId);
  const entry = doc.layout.find((e) => e.id === edgeId);
  return edge?.kind !== "edge" || entry?.locked === true ? null : (entry?.via ?? []);
}

const setVia = (edgeId: string, via: Point[]): Command =>
  via.length === 0
    ? { type: "setLayout", changes: [{ id: edgeId, unset: ["via"] }] }
    : { type: "setLayout", changes: [{ id: edgeId, set: { via } }] };

/**
 * The command that adds a bend point on the routed path of the edge at the point nearest `p`, and
 * the index the new point takes in the list. The point goes after every existing one that lies
 * earlier along the path, so the path keeps its shape and only gains a place to grab. Null when
 * the edge cannot be drawn or is locked.
 */
export function addBendCommand(doc: DiagramDocument, measurer: TextMeasurer, edgeId: string, p: Point): { command: Command; index: number } | null {
  const via = bendsOf(doc, edgeId);
  const routed = via && routedEdges(doc, measurer, new Set([edgeId])).get(edgeId);
  const hit = routed && nearestOnPath(routed.points, p);
  if (!via || !hit) return null;
  const index = via.filter((v) => (nearestOnPath(routed.points, v)?.along ?? 0) < hit.along).length;
  return { command: setVia(edgeId, [...via.slice(0, index), roundPoint(hit.point), ...via.slice(index)]), index };
}

/** The command that moves bend point `index` to `p`; null for a point that does not exist, one left where it was, or a locked edge. */
export function moveBendCommand(doc: DiagramDocument, edgeId: string, index: number, p: Point): Command | null {
  const via = bendsOf(doc, edgeId);
  const old = via?.[index];
  const next = roundPoint(p);
  if (!via || !old || (old.x === next.x && old.y === next.y)) return null;
  return setVia(edgeId, via.map((v, i) => (i === index ? next : v)));
}

/** The command that removes bend point `index`; null for a point that does not exist or a locked edge. */
export function removeBendCommand(doc: DiagramDocument, edgeId: string, index: number): Command | null {
  const via = bendsOf(doc, edgeId);
  if (!via?.[index]) return null;
  return setVia(edgeId, via.filter((_, i) => i !== index));
}

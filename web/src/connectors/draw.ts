// Drawing an edge with the line tool: what is under the pointer, the edge made on release and the
// line shown while dragging. Pure functions over the document.
import type { Command } from "../commands/command.ts";
import type { DiagramDocument, EdgeElement, LayoutEntry, Point } from "../model/index.ts";
import { unusedId } from "../model/index.ts";
import { drawnBoxes, outlineKind } from "../render/boxes.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { attachTarget, type End, route, type Target } from "./routing.ts";

/** One end of an edge being drawn: an element, or a point on the canvas. */
export type DrawEnd = { id: string } | { point: Point };

/** Shapes and text boxes an edge can attach to, bottom to top. Frames are regions, not things to connect. */
export function attachTargets(doc: DiagramDocument, measurer: TextMeasurer): Target[] {
  return drawnBoxes(doc, measurer).map(({ x, y, w, h, element }) => ({ id: element.id, box: { x, y, w, h }, shape: outlineKind(element) }));
}

const roundPoint = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });

/** The topmost shape or text box under the world point, or the point itself, rounded to whole px. */
export function drawEndAt(doc: DiagramDocument, measurer: TextMeasurer, p: Point): DrawEnd {
  const hit = attachTarget(attachTargets(doc, measurer), p);
  return hit ? { id: hit.id } : { point: roundPoint(p) };
}

const sameEnd = (a: DrawEnd, b: DrawEnd): boolean =>
  "id" in a ? "id" in b && a.id === b.id : !("id" in b) && a.point.x === b.point.x && a.point.y === b.point.y;

/**
 * The command that adds an edge from one end to the other, and the new edge's ID; null when both
 * ends are the same, which would draw nothing. Both ends on elements make the default ID
 * (`from->to`) when it is free; every other edge needs an explicit one.
 */
export function newEdgeCommand(doc: DiagramDocument, from: DrawEnd, to: DrawEnd): { command: Command; id: string } | null {
  const a = "id" in from ? from : { point: roundPoint(from.point) };
  const b = "id" in to ? to : { point: roundPoint(to.point) };
  if (sameEnd(a, b)) return null;
  const derived = "id" in a && "id" in b ? `${a.id}->${b.id}` : undefined;
  const id = derived !== undefined && !doc.elements.some((e) => e.id === derived) ? derived : unusedId(doc.elements, "edge");
  const element: EdgeElement = { kind: "edge", id, from: "id" in a ? a.id : null, to: "id" in b ? b.id : null };
  const layout: LayoutEntry = { id, x: 0, y: 0 };
  if (!("id" in a)) layout.fromPoint = a.point;
  if (!("id" in b)) layout.toPoint = b.point;
  const placed = layout.fromPoint !== undefined || layout.toPoint !== undefined;
  return { command: { type: "add", items: [placed ? { element, layout } : { element }] }, id };
}

/** The straight line shown while dragging; empty while both ends are still the same element. */
export function draftPath(doc: DiagramDocument, measurer: TextMeasurer, from: DrawEnd, to: DrawEnd): Point[] {
  if (sameEnd(from, to)) return [];
  const boxes = new Map(attachTargets(doc, measurer).map((t) => [t.id, t]));
  const endOf = (e: DrawEnd): End | null => {
    if (!("id" in e)) return { point: e.point };
    const t = boxes.get(e.id);
    return t ? { box: t.box, shape: t.shape, anchor: "auto" } : null;
  };
  const start = endOf(from);
  const end = endOf(to);
  return start && end ? route(start, end, { route: "straight" }) : [];
}

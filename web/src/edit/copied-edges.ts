// Which edges travel with a copied set of elements, and where their ends land.
import type { DiagramDocument, DiagramElement, EdgeElement, LayoutEntry, Point } from "../model/index.ts";
import { isValidId } from "../model/index.ts";

type EndName = "from" | "to";
const ENDS: readonly EndName[] = ["from", "to"];

/** Edges that travel with a copy: the selected ones, and any edge whose both ends are copied. */
export function includedEdges(doc: DiagramDocument, selected: ReadonlySet<string>, copiedNodeIds: ReadonlySet<string>): EdgeElement[] {
  return doc.elements.filter(
    (element): element is EdgeElement =>
      element.kind === "edge" &&
      (selected.has(element.id) || (element.from !== null && element.to !== null && copiedNodeIds.has(element.from) && copiedNodeIds.has(element.to))),
  );
}

/** What a new element like this one is called: its shape without the pack prefix, or its kind. */
export function elementBaseId(element: DiagramElement): string {
  const shape = element.kind === "node" || element.kind === "shape" ? element.shape.replace(/^[^.]+\./, "") : element.kind;
  return isValidId(shape) ? shape : element.kind;
}

const whole = (point: Point): Point => ({ x: Math.round(point.x), y: Math.round(point.y) });

export interface RetargetedEnds {
  from: string | null;
  to: string | null;
  points: Partial<Record<EndName, Point>>;
  /** False when a free end has nowhere to sit, so the edge cannot be copied. */
  ok: boolean;
}

/**
 * An end on a copied element stays on the copy. Any other end becomes a free point: where the edge
 * was drawn, or the free point it already had, then moved by `mapPoint`.
 */
export function retargetEdge(
  edge: EdgeElement,
  entry: LayoutEntry | undefined,
  path: readonly Point[] | undefined,
  newIds: ReadonlyMap<string, string>,
  mapPoint: (point: Point) => Point,
): RetargetedEnds {
  const ends: Record<EndName, string | null> = { from: null, to: null };
  const points: Partial<Record<EndName, Point>> = {};
  for (const end of ENDS) {
    const target = edge[end];
    const copy = target === null ? undefined : newIds.get(target);
    if (copy !== undefined) {
      ends[end] = copy;
      continue;
    }
    const at = target === null ? (end === "from" ? entry?.fromPoint : entry?.toPoint) : end === "from" ? path?.[0] : path?.at(-1);
    if (!at) return { from: ends.from, to: ends.to, points, ok: false };
    points[end] = mapPoint(whole(at));
  }
  return { from: ends.from, to: ends.to, points, ok: true };
}

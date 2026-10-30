// Edges as the document describes them: the style an edge resolves to and the path it takes,
// worked out from the layout of the elements at its ends.
import type { DiagramDocument, DiagramElement, EdgeElement, LayoutEntry, Point, StyleProps } from "../model/index.ts";
import { elementsById, layoutById } from "../model/lookup.ts";
import { elementBox, outlineKind, packGeometry } from "../render/boxes.ts";
import { styleOf } from "../style/of.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { type End, route } from "./routing.ts";

export interface RoutedEdge {
  edge: EdgeElement;
  /** The polyline from the start of the edge to its end. */
  points: Point[];
  /** The resolved style of the edge. */
  style: StyleProps;
  locked: boolean;
  /** Where the label sits along the path (0..1); absent when the layout gives none. */
  labelAt?: number;
}

/**
 * Routes the edges of the document, or only those in `only`. An edge whose end names no element
 * with a box, or whose free end has no point in the layout, cannot be drawn and is left out.
 */
export function routedEdges(doc: DiagramDocument, measurer: TextMeasurer, only?: ReadonlySet<string>): Map<string, RoutedEdge> {
  const elements = elementsById(doc);
  const entries = layoutById(doc);

  const endOf = (edge: EdgeElement, entry: LayoutEntry | undefined, which: "from" | "to"): End | null => {
    const id = edge[which];
    if (id === null) {
      const point = which === "from" ? entry?.fromPoint : entry?.toPoint;
      return point ? { point } : null;
    }
    const target: DiagramElement | undefined = elements.get(id);
    const box = target && elementBox(doc, target, entries.get(id), measurer);
    if (!target || !box) return null;
    const geometry = packGeometry(target, box);
    return { box, shape: outlineKind(target), anchor: entry?.[which] ?? "auto", ...(geometry && { outline: geometry.outline, anchors: geometry.anchors }) };
  };

  const out = new Map<string, RoutedEdge>();
  for (const edge of doc.elements) {
    if (edge.kind !== "edge" || (only && !only.has(edge.id))) continue;
    const entry = entries.get(edge.id);
    const from = endOf(edge, entry, "from");
    const to = endOf(edge, entry, "to");
    if (!from || !to) continue;
    const style = styleOf(doc, edge);
    const kind = style.route ?? "straight";
    const via = entry?.via;
    const points = route(from, to, via ? { route: kind, via } : { route: kind });
    out.set(edge.id, { edge, points, style, locked: entry?.locked === true, ...(entry?.labelAt !== undefined && { labelAt: entry.labelAt }) });
  }
  return out;
}

/** The IDs of the edges with an end on any of the elements. */
export function edgesAttachedTo(doc: DiagramDocument, ids: Iterable<string>): string[] {
  const wanted = new Set(ids);
  return doc.elements
    .filter((e): e is EdgeElement => e.kind === "edge" && ((e.from !== null && wanted.has(e.from)) || (e.to !== null && wanted.has(e.to))))
    .map((e) => e.id);
}

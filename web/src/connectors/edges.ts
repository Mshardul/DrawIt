// Edges as the document describes them: the style an edge resolves to and the path it takes,
// worked out from the layout of the elements at its ends.
import type { DiagramDocument, DiagramElement, EdgeElement, LayoutEntry, Point, StyleProps } from "../model/index.ts";
import type { ArrowHead, Route } from "../model/style.ts";
import { elementBox, outlineKind } from "../render/boxes.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { type End, route } from "./routing.ts";

export interface EdgeStyle {
  route: Route;
  headStart: ArrowHead;
  headEnd: ArrowHead;
}

export interface RoutedEdge {
  edge: EdgeElement;
  /** The polyline from the start of the edge to its end. */
  points: Point[];
  style: EdgeStyle;
  locked: boolean;
}

const DEFAULT_STYLE: EdgeStyle = { route: "straight", headStart: "none", headEnd: "arrow" };

const pick = (props: StyleProps | undefined): Partial<EdgeStyle> => {
  const out: Partial<EdgeStyle> = {};
  if (props?.route !== undefined) out.route = props.route;
  if (props?.headStart !== undefined) out.headStart = props.headStart;
  if (props?.headEnd !== undefined) out.headEnd = props.headEnd;
  return out;
};

/** The edge properties after the defaults, then the edge's class, then its own overrides; the last to set one wins. */
export function edgeStyle(doc: DiagramDocument, edge: EdgeElement): EdgeStyle {
  const cls = edge.class === undefined ? undefined : doc.style.classes.find((c) => c.name === edge.class);
  const own = doc.style.overrides.find((o) => o.id === edge.id);
  return { ...DEFAULT_STYLE, ...pick(cls?.props), ...pick(own?.props) };
}

/**
 * Routes the edges of the document, or only those in `only`. An edge whose end names no element
 * with a box, or whose free end has no point in the layout, cannot be drawn and is left out.
 */
export function routedEdges(doc: DiagramDocument, measurer: TextMeasurer, only?: ReadonlySet<string>): Map<string, RoutedEdge> {
  const elements = new Map(doc.elements.map((e) => [e.id, e]));
  const entries = new Map<string, LayoutEntry>();
  for (const entry of doc.layout) if (!entries.has(entry.id)) entries.set(entry.id, entry);

  const endOf = (edge: EdgeElement, entry: LayoutEntry | undefined, which: "from" | "to"): End | null => {
    const id = edge[which];
    if (id === null) {
      const point = which === "from" ? entry?.fromPoint : entry?.toPoint;
      return point ? { point } : null;
    }
    const target: DiagramElement | undefined = elements.get(id);
    const box = target && elementBox(target, entries.get(id), measurer);
    return target && box ? { box, shape: outlineKind(target), anchor: entry?.[which] ?? "auto" } : null;
  };

  const out = new Map<string, RoutedEdge>();
  for (const edge of doc.elements) {
    if (edge.kind !== "edge" || (only && !only.has(edge.id))) continue;
    const entry = entries.get(edge.id);
    const from = endOf(edge, entry, "from");
    const to = endOf(edge, entry, "to");
    if (!from || !to) continue;
    const style = edgeStyle(doc, edge);
    const via = entry?.via;
    const points = route(from, to, via ? { route: style.route, via } : { route: style.route });
    out.set(edge.id, { edge, points, style, locked: entry?.locked === true });
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

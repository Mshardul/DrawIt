// Duplicate as a pure function from a document and a selection to one command and the new selection.
import type { AddCommand, Command } from "../commands/command.ts";
import { routedEdges } from "../connectors/edges.ts";
import { isValidId, unusedId } from "../model/index.ts";
import type { DiagramDocument, DiagramElement, EdgeElement, LayoutEntry, Point } from "../model/index.ts";
import { layoutById } from "../model/lookup.ts";
import type { TextMeasurer } from "../text/measure.ts";

/** How far (px, on the 8px grid) a copy sits right of and below its original. */
export const DUPLICATE_OFFSET = 16;

export interface Duplicate {
  command: Command;
  /** The IDs of the copies, in document order. */
  selection: string[];
}

type End = "from" | "to";
const ENDS: readonly End[] = ["from", "to"];

const shift = (p: Point): Point => ({ x: p.x + DUPLICATE_OFFSET, y: p.y + DUPLICATE_OFFSET });
const whole = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });

/**
 * One command copying the selected elements at an offset, and the new selection; null if none of
 * the selection exists. Edges between two copied elements are copied between the copies, selected
 * or not. A selected edge keeps each end that is on a copy, and an end that is not becomes a free
 * end where it was drawn. Copies are not locked and carry neither comments nor a lock.
 */
export function duplicateCommand(doc: DiagramDocument, measurer: TextMeasurer, ids: readonly string[]): Duplicate | null {
  const entries = layoutById(doc);
  const selected = new Set(ids);
  const copiedNodes = doc.elements.filter((e) => selected.has(e.id) && e.kind !== "edge" && e.kind !== "unknown");
  const nodeIds = new Set(copiedNodes.map((e) => e.id));
  const edges = doc.elements.filter(
    (e): e is EdgeElement =>
      e.kind === "edge" && (selected.has(e.id) || (e.from !== null && e.to !== null && nodeIds.has(e.from) && nodeIds.has(e.to))),
  );
  if (copiedNodes.length === 0 && edges.length === 0) return null;

  // A copy is named like a new element of its kind, so its id does not point back at the original.
  const taken: { id: string }[] = [...doc.elements];
  const fresh = (base: string): string => {
    const id = unusedId(taken, base);
    taken.push({ id });
    return id;
  };
  const newIds = new Map<string, string>(copiedNodes.map((e) => [e.id, fresh(baseId(e))]));

  const drawn = routedEdges(doc, measurer, new Set(edges.map((e) => e.id)));
  const items = new Map<string, AddCommand["items"][number]>();
  const copyIds = new Map<string, string>(newIds);

  for (const node of copiedNodes) {
    const id = newIds.get(node.id) ?? node.id;
    const entry = entries.get(node.id);
    const element: DiagramElement = { ...node, id };
    Reflect.deleteProperty(element, "comments");
    items.set(node.id, { element, ...(entry && { layout: moved(entry, id) }) });
  }

  for (const edge of edges) {
    const path = drawn.get(edge.id)?.points;
    const entry = entries.get(edge.id);
    const ends: Record<End, string | null> = { from: null, to: null };
    const points: Partial<Record<End, Point>> = {};
    let routable = true;
    for (const end of ENDS) {
      const target = edge[end];
      const copy = target === null ? undefined : newIds.get(target);
      if (copy !== undefined) {
        ends[end] = copy;
        continue;
      }
      const at = target === null ? (end === "from" ? entry?.fromPoint : entry?.toPoint) : end === "from" ? path?.[0] : path?.at(-1);
      if (!at) routable = false;
      else points[end] = shift(whole(at));
    }
    if (!routable) continue;
    const derived = ends.from !== null && ends.to !== null ? `${ends.from}->${ends.to}` : undefined;
    const id = derived !== undefined && !taken.some((e) => e.id === derived) ? derived : fresh("edge");
    taken.push({ id });
    copyIds.set(edge.id, id);
    const layout = moved(entry ?? { id: edge.id, x: 0, y: 0 }, id, false);
    for (const end of ENDS) {
      const point = points[end];
      if (point) {
        Reflect.deleteProperty(layout, end);
        layout[end === "from" ? "fromPoint" : "toPoint"] = point;
      } else Reflect.deleteProperty(layout, end === "from" ? "fromPoint" : "toPoint");
    }
    const element: EdgeElement = { ...edge, id, from: ends.from, to: ends.to };
    Reflect.deleteProperty(element, "comments");
    items.set(edge.id, { element, layout });
  }

  // Document order, so a copy sits in the same relative place as its original.
  const ordered = doc.elements.flatMap((e) => items.get(e.id) ?? []);
  const add: AddCommand = { type: "add", items: ordered };
  const overrides = doc.style.overrides.filter((o) => copyIds.has(o.id));
  const styled: Command[] = overrides.map((o) => ({
    type: "setStyle",
    target: { kind: "el", id: copyIds.get(o.id) ?? o.id },
    set: o.props,
  }));
  return {
    command: styled.length === 0 ? add : { type: "batch", commands: [add, ...styled] },
    selection: ordered.map((i) => i.element.id),
  };
}

/** What a new element like this one is called: its shape without the pack prefix, or its kind. */
function baseId(element: DiagramElement): string {
  const shape = element.kind === "node" || element.kind === "shape" ? element.shape.replace(/^[^.]+\./, "") : element.kind;
  return isValidId(shape) ? shape : element.kind;
}

/** The layout line of a copy: the original's, shifted unless it is an edge's, with bend points shifted and no lock. */
function moved(entry: LayoutEntry, id: string, shiftPosition = true): LayoutEntry {
  const copy: LayoutEntry = { ...entry, id };
  Reflect.deleteProperty(copy, "locked");
  if (shiftPosition) Object.assign(copy, shift(entry));
  if (entry.via) copy.via = entry.via.map(shift);
  return copy;
}

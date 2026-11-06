// Paste as a pure function from the open file and a clipboard document to one command.
import type { AddCommand, Command, SetThemeCommand } from "../commands/command.ts";
import { routedEdges } from "../connectors/edges.ts";
import { elementBaseId, includedEdges, retargetEdge } from "../edit/copied-edges.ts";
import type { DiagramDocument, DiagramElement, EdgeElement, LayoutEntry, Point, StyleProps, Theme } from "../model/index.ts";
import { unusedId } from "../model/index.ts";
import { layoutById } from "../model/lookup.ts";
import { placeUnplaced } from "../render/place.ts";
import { BUILT_IN_THEME } from "../style/defaults.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { DUPLICATE_OFFSET } from "../edit/duplicate.ts";
import { clipboardDocument } from "./copy.ts";

export interface Paste {
  command: Command;
  /** The IDs of the pasted elements, in document order. */
  selection: string[];
}

const TOKEN = /\$([A-Za-z][A-Za-z0-9_-]*)/g;

function tokenNames(props: StyleProps): string[] {
  const names: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      for (const match of value.matchAll(TOKEN)) if (match[1]) names.push(match[1]);
    } else if (typeof value === "object" && value !== null) {
      for (const nested of Object.values(value)) visit(nested);
    }
  };
  visit(props);
  return names;
}

/**
 * The clipboard document for a selection. An edge between two selected elements is included even
 * when the edge itself is not, and an end on an element that was not copied becomes a free point
 * where that end was drawn.
 */
export function selectionDocument(source: DiagramDocument, ids: readonly string[], measurer: TextMeasurer): DiagramDocument {
  const selected = new Set(ids);
  const nodes = source.elements.filter((element) => selected.has(element.id) && element.kind !== "edge");
  const nodeIds = new Set(nodes.map((element) => element.id));
  const edges = includedEdges(source, selected, nodeIds);
  const clip = clipboardDocument(source, [...nodeIds, ...edges.map((edge) => edge.id)]);
  const present = new Set(clip.elements.map((element) => element.id));
  const routed = routedEdges(source, measurer, new Set(edges.map((edge) => edge.id)));
  const layout = clip.layout.map((entry) => ({ ...entry }));
  const entries = new Map(layout.map((entry) => [entry.id, entry]));
  const elements = clip.elements.map((element) => {
    if (element.kind !== "edge") return { ...element };
    const edge: EdgeElement = { ...element };
    const entry = entries.get(edge.id);
    const path = routed.get(edge.id)?.points;
    for (const end of ["from", "to"] as const) {
      const target = edge[end];
      if (target === null || present.has(target)) continue;
      const at = end === "from" ? path?.[0] : path?.at(-1);
      if (!at || !entry) continue;
      edge[end] = null;
      Reflect.deleteProperty(entry, end);
      entry[end === "from" ? "fromPoint" : "toPoint"] = { x: Math.round(at.x), y: Math.round(at.y) };
    }
    return edge;
  });
  return { ...clip, elements, layout };
}

function missingTokens(target: Theme, incoming: Theme, props: readonly StyleProps[]): SetThemeCommand | null {
  const names = new Set(props.flatMap(tokenNames));
  const colors: Record<string, string> = {};
  const fonts: Record<string, string> = {};
  const sizes: Record<string, number> = {};
  const spaces: Record<string, number> = {};
  const take = <T extends string | number>(from: Record<string, T>, have: Record<string, T>, builtIn: Record<string, T>, into: Record<string, T>): void => {
    for (const name of names) {
      const value = from[name];
      if (value !== undefined && have[name] === undefined && builtIn[name] === undefined) into[name] = value;
    }
  };
  take(incoming.colors, target.colors, BUILT_IN_THEME.colors, colors);
  take(incoming.fonts, target.fonts, BUILT_IN_THEME.fonts, fonts);
  take(incoming.sizes, target.sizes, BUILT_IN_THEME.sizes, sizes);
  take(incoming.spaces, target.spaces, BUILT_IN_THEME.spaces, spaces);
  if (Object.keys(colors).length + Object.keys(fonts).length + Object.keys(sizes).length + Object.keys(spaces).length === 0) return null;
  return { type: "setTheme", colors, fonts, sizes, spaces };
}

function groupCorner(doc: DiagramDocument): Point {
  let corner: Point | null = null;
  const entries = layoutById(doc);
  for (const element of doc.elements) {
    if (element.kind === "edge") continue;
    const entry = entries.get(element.id);
    if (!entry) continue;
    corner = corner === null ? { x: entry.x, y: entry.y } : { x: Math.min(corner.x, entry.x), y: Math.min(corner.y, entry.y) };
  }
  return corner ?? { x: 0, y: 0 };
}

/** Where a paste lands: the pointer when it is over the canvas, otherwise one duplicate-offset from the originals. */
export function pastePoint(pointer: Point | null, incoming: DiagramDocument): Point {
  if (pointer) return pointer;
  const corner = groupCorner(incoming);
  return { x: corner.x + DUPLICATE_OFFSET, y: corner.y + DUPLICATE_OFFSET };
}

function translated(entry: LayoutEntry, id: string, dx: number, dy: number, moveBox: boolean): LayoutEntry {
  const copy: LayoutEntry = { ...entry, id };
  Reflect.deleteProperty(copy, "locked");
  if (moveBox) {
    copy.x = entry.x + dx;
    copy.y = entry.y + dy;
  }
  if (entry.via) copy.via = entry.via.map((point) => ({ x: point.x + dx, y: point.y + dy }));
  return copy;
}

/**
 * One command pasting `incoming` into `target` so the top left of its elements lands at `at`.
 * Elements with no layout are placed first. A class or token the target already has keeps the
 * target's definition. Null when there is nothing to paste.
 */
export function pasteCommand(target: DiagramDocument, incoming: DiagramDocument, measurer: TextMeasurer, at: Point): Paste | null {
  const source = incoming.elements.some((element) => element.kind !== "edge" && !incoming.layout.some((entry) => entry.id === element.id))
    ? placeUnplaced(incoming, measurer)
    : incoming;
  const nodes = source.elements.filter((element) => element.kind !== "edge");
  const nodeIds = new Set(nodes.map((element) => element.id));
  const edges = includedEdges(source, new Set(source.elements.map((element) => element.id)), nodeIds);
  if (nodes.length === 0 && edges.length === 0) return null;

  const corner = groupCorner(source);
  const dx = at.x - corner.x;
  const dy = at.y - corner.y;
  const mapPoint = (point: Point): Point => ({ x: point.x + dx, y: point.y + dy });

  const taken: { id: string }[] = [...target.elements];
  const fresh = (base: string): string => {
    const id = unusedId(taken, base);
    taken.push({ id });
    return id;
  };
  const newIds = new Map<string, string>(nodes.map((element) => [element.id, fresh(elementBaseId(element))]));
  const entries = layoutById(source);
  const drawn = routedEdges(source, measurer, new Set(edges.map((edge) => edge.id)));
  const items = new Map<string, AddCommand["items"][number]>();

  for (const node of nodes) {
    const id = newIds.get(node.id) ?? node.id;
    const entry = entries.get(node.id);
    const element: DiagramElement = { ...node, id };
    items.set(node.id, { element, ...(entry && { layout: translated(entry, id, dx, dy, true) }) });
  }

  for (const edge of edges) {
    const entry = entries.get(edge.id);
    const ends = retargetEdge(edge, entry, drawn.get(edge.id)?.points, newIds, mapPoint);
    if (!ends.ok) continue;
    const derived = ends.from !== null && ends.to !== null ? `${ends.from}->${ends.to}` : undefined;
    const id = derived !== undefined && !taken.some((element) => element.id === derived) ? derived : fresh("edge");
    if (id === derived) taken.push({ id });
    newIds.set(edge.id, id);
    const layout = translated(entry ?? { id: edge.id, x: 0, y: 0 }, id, dx, dy, false);
    for (const end of ["from", "to"] as const) {
      const point = ends.points[end];
      if (point) {
        Reflect.deleteProperty(layout, end);
        layout[end === "from" ? "fromPoint" : "toPoint"] = point;
      } else Reflect.deleteProperty(layout, end === "from" ? "fromPoint" : "toPoint");
    }
    const element: EdgeElement = { ...edge, id, from: ends.from, to: ends.to };
    items.set(edge.id, { element, layout });
  }

  const ordered = source.elements.flatMap((element) => items.get(element.id) ?? []);
  if (ordered.length === 0) return null;
  const pastedIds = new Set(ordered.map((item) => item.element.id));
  const classNames = new Set(
    ordered.flatMap((item) => (item.element.kind !== "unknown" && item.element.class ? [item.element.class] : [])),
  );
  const classes = source.style.classes.filter((styleClass) => classNames.has(styleClass.name) && !target.style.classes.some((have) => have.name === styleClass.name));
  const overrides = source.style.overrides.filter((override) => newIds.has(override.id));
  const theme = missingTokens(target.style.theme, source.style.theme, [...classes.map((styleClass) => styleClass.props), ...overrides.map((override) => override.props)]);
  const commands: Command[] = [];
  if (theme) commands.push(theme);
  for (const styleClass of classes) commands.push({ type: "setStyle", target: { kind: "class", name: styleClass.name }, set: { ...styleClass.props } });
  commands.push({ type: "add", items: ordered });
  for (const override of overrides) {
    const id = newIds.get(override.id);
    if (!id || !pastedIds.has(id)) continue;
    commands.push({ type: "setStyle", target: { kind: "el", id }, set: { ...override.props } });
  }
  return {
    command: commands.length === 1 ? (commands[0] as Command) : { type: "batch", commands },
    selection: ordered.map((item) => item.element.id),
  };
}

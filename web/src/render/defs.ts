// The gradients and shadows a document draws, as SVG nodes for the canvas's `defs`. An element
// refers to one by the id derived from its value, so elements with the same value share a
// definition and an export can take the same nodes.
import type { DiagramDocument, DiagramElement } from "../model/index.ts";
import { styleOf, themeColour } from "../style/of.ts";
import { COLOUR, type Gradient, parseGradient, parseShadow, type Shadow } from "../style/values.ts";
import type { SvgNode } from "./describe.ts";

/** A drag that moves more shadowed elements than this is drawn without their filters. */
export const SHADOW_DRAG_LIMIT = 5;

/** A colour or a colour token as a plain colour, or undefined where nothing defines it. */
function colourOf(doc: DiagramDocument, value: string): string | undefined {
  const colour = value.startsWith("$") ? themeColour(doc, value.slice(1)) : value;
  return colour !== undefined && !colour.startsWith("$") && COLOUR.test(colour) ? colour : undefined;
}

/** Characters outside letters and digits become `_` and their code, so different values never share an id. */
const idFor = (prefix: string, value: string): string =>
  `${prefix}-${value.replace(/[^A-Za-z0-9]/g, (c) => `_${c.charCodeAt(0).toString(16)}_`)}`;

const round = (n: number): number => Math.round(n * 10000) / 10000;

/** Stops without a position are spaced evenly between the positioned stops around them. */
function offsets(stops: Gradient["stops"]): number[] {
  const out = stops.map((s) => s.at);
  const last = out.length - 1;
  out[0] ??= 0;
  out[last] ??= 1;
  let from = 0;
  for (let i = 1; i <= last; i++) {
    if (out[i] === undefined) continue;
    const gap = i - from;
    for (let j = from + 1; j < i; j++) out[j] = (out[from] as number) + (((out[i] as number) - (out[from] as number)) * (j - from)) / gap;
    from = i;
  }
  return out as number[];
}

interface Definition {
  id: string;
  node: SvgNode;
}

function gradientDefinition(doc: DiagramDocument, value: string): Definition | undefined {
  const gradient = parseGradient(value);
  if (!gradient) return undefined;
  const colours = gradient.stops.map((s) => colourOf(doc, s.color));
  if (colours.some((c) => c === undefined)) return undefined;
  const radians = (gradient.angle * Math.PI) / 180;
  const [sin, cos] = [Math.sin(radians), Math.cos(radians)];
  const at = offsets(gradient.stops);
  const id = idFor("gradient", value);
  const attrs = { id, "data-id": id, x1: round(0.5 - sin / 2), y1: round(0.5 + cos / 2), x2: round(0.5 + sin / 2), y2: round(0.5 - cos / 2) };
  const stops = gradient.stops.map((_, i) => ({ tag: "stop", attrs: { offset: round(at[i] as number), "stop-color": colours[i] as string }, children: [] }));
  return { id, node: { tag: "linearGradient", attrs, children: stops } };
}

function shadowDefinition(doc: DiagramDocument, value: string): Definition | undefined {
  const shadow: Shadow | undefined = parseShadow(value);
  const colour = shadow && colourOf(doc, shadow.color);
  if (!shadow || colour === undefined) return undefined;
  const id = idFor("shadow", value);
  const drop: SvgNode = { tag: "feDropShadow", attrs: { dx: shadow.dx, dy: shadow.dy, stdDeviation: shadow.blur / 2, "flood-color": colour }, children: [] };
  // The default region is too tight for a blur that reaches past the shape.
  return { id, node: { tag: "filter", attrs: { id, "data-id": id, x: "-50%", y: "-50%", width: "200%", height: "200%" }, children: [drop] } };
}

const url = (id: string): string => `url(#${id})`;

/** The paint for a fill: a plain colour, the gradient it names, or none where it cannot be drawn. */
export function fillPaint(doc: DiagramDocument, value: unknown): string {
  if (typeof value !== "string") return "none";
  if (value.startsWith("linear(")) {
    const gradient = gradientDefinition(doc, value);
    return gradient ? url(gradient.id) : "none";
  }
  return COLOUR.test(value) ? value : "none";
}

/** The filter reference for a shadow value, or undefined where the element casts none. */
export function shadowFilter(doc: DiagramDocument, value: unknown): string | undefined {
  const definition = typeof value === "string" ? shadowDefinition(doc, value) : undefined;
  return definition && url(definition.id);
}

function definitionsFor(doc: DiagramDocument, element: DiagramElement): Definition[] {
  const style = styleOf(doc, element);
  const fill = typeof style.fill === "string" && style.fill.startsWith("linear(") ? gradientDefinition(doc, style.fill) : undefined;
  const shadow = typeof style.shadow === "string" ? shadowDefinition(doc, style.shadow) : undefined;
  return [fill, shadow].flatMap((d) => d ?? []);
}

// Dragging changes only the layout, so the definitions of a style section and an element list are
// built once and shared by every frame of the drag.
const built = new WeakMap<object, WeakMap<object, SvgNode[]>>();

export function describeDefs(doc: DiagramDocument): SvgNode[] {
  const byElements = built.get(doc.style) ?? new WeakMap<object, SvgNode[]>();
  built.set(doc.style, byElements);
  const cached = byElements.get(doc.elements);
  if (cached) return cached;
  const unique = new Map<string, SvgNode>();
  for (const element of doc.elements) for (const d of definitionsFor(doc, element)) unique.set(d.id, d.node);
  const out = [...unique.values()];
  byElements.set(doc.elements, out);
  return out;
}

/** How many of these elements cast a shadow. */
export function countShadowed(doc: DiagramDocument, ids: ReadonlySet<string>): number {
  let count = 0;
  for (const element of doc.elements) if (ids.has(element.id) && shadowFilter(doc, styleOf(doc, element).shadow) !== undefined) count++;
  return count;
}

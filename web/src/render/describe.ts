// The renderer's output: a tree of SVG nodes describing a document. It is
// data, not DOM, so it needs no browser to test; `mount` puts it on the page. The renderer holds
// no state: the same document always gives the same tree.
import { headShape } from "../connectors/heads.ts";
import { edgeLabelLayout } from "../connectors/label.ts";
import { type RoutedEdge, routedEdges } from "../connectors/edges.ts";
import type { DiagramDocument, DiagramElement, StyleProps } from "../model/index.ts";
import { elementsById, layoutById } from "../model/lookup.ts";
import type { ShapeManifest } from "../shapes/types.ts";
import { styleOf, themeColour } from "../style/of.ts";
import { COLOUR } from "../style/values.ts";
import { svgTextAttrs, type TextMeasurer } from "../text/measure.ts";
import { outlineKind, stackOrder } from "./boxes.ts";
import { sizeOf } from "./size.ts";
import { DEFAULT_TEXT_STYLE, labelLayout, layoutTextBox, LINE_HEIGHT } from "./text-layout.ts";

export interface SvgNode {
  tag: string;
  attrs: Record<string, string | number>;
  children: SvgNode[];
  /** Text content, for `text` and `tspan` nodes. */
  text?: string;
}

export interface DescribeOptions {
  /** Describe only these elements. */
  only?: ReadonlySet<string>;
  /** Manifests of pack shapes, for their label rectangles. */
  shapes?: ShapeLookup;
  /** Elements drawn without their text, because an editor is showing it. */
  hideText?: ReadonlySet<string>;
}

/** Finds the manifest of a shape by the name written in the file, or undefined for a shape that has none. */
export type ShapeLookup = (shape: string) => ShapeManifest | undefined;

const INK = "#1a1a1a";

/** A resolved colour as an SVG paint; anything that is not a plain colour draws as none. */
const paint = (value: unknown): string => (typeof value === "string" && COLOUR.test(value) ? value : "none");

const numeric = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined);

/** The fill, stroke and corner attributes of an outline. */
function outlineAttrs(style: StyleProps): SvgNode["attrs"] {
  const width = numeric(style.strokeWidth);
  return { fill: paint(style.fill), stroke: paint(style.stroke), ...(width !== undefined && { "stroke-width": width }) };
}

/** Opacity on the element's group, written only when the element is not fully opaque. */
function opacityAttrs(style: StyleProps): SvgNode["attrs"] {
  const opacity = numeric(style.opacity);
  return opacity !== undefined && opacity !== 1 ? { opacity } : {};
}

function cornerAttrs(style: StyleProps): SvgNode["attrs"] {
  const radius = numeric(style.radius);
  return radius ? { rx: radius, ry: radius } : {};
}

const node = (tag: string, attrs: SvgNode["attrs"], children: SvgNode[] = [], text?: string): SvgNode =>
  text === undefined ? { tag, attrs, children } : { tag, attrs, children, text };

/** One `text` node per line, all on `x`, line `i` centred `i` line heights below `top`. */
function lineNodes(lines: string[], x: number, top: number, anchor: "start" | "middle"): SvgNode[] {
  return lines.map((line, i) =>
    node(
      "text",
      {
        x,
        y: top + LINE_HEIGHT / 2 + i * LINE_HEIGHT,
        "text-anchor": anchor,
        "dominant-baseline": "central",
        ...svgTextAttrs(DEFAULT_TEXT_STYLE),
        fill: INK,
      },
      [],
      line,
    ),
  );
}

function labelNodes(label: string, w: number, h: number, measurer: TextMeasurer, manifest?: ShapeManifest): SvgNode[] {
  const { lines, x, top } = labelLayout(label, { w, h }, measurer, manifest);
  return lineNodes(lines, x, top, "middle");
}

function body(
  element: DiagramElement,
  style: StyleProps,
  w: number,
  h: number,
  measurer: TextMeasurer,
  shapes: ShapeLookup | undefined,
  hideText: boolean,
): SvgNode[] | null {
  switch (element.kind) {
    case "node":
    case "shape": {
      const outline =
        outlineKind(element) === "ellipse"
          ? node("ellipse", { cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2, ...outlineAttrs(style) })
          : node("rect", { width: w, height: h, ...cornerAttrs(style), ...outlineAttrs(style) });
      const label =
        element.kind === "node" && !hideText ? labelNodes(element.label ?? element.id, w, h, measurer, shapes?.(element.shape)) : [];
      return [outline, ...label];
    }
    case "text": {
      const background =
        style.fill !== undefined || style.stroke !== undefined
          ? [node("rect", { width: w, height: h, ...cornerAttrs(style), ...outlineAttrs(style) })]
          : [];
      const lines = hideText ? [] : lineNodes(layoutTextBox(element.content, w, measurer).lines, 0, 0, "start");
      return [...background, ...lines];
    }
    default:
      return null;
  }
}

const fmt = (n: number): string => String(n);

/** The background behind a label, so the line does not run through the text, and its room around the text. */
const LABEL_PAD = 4;

function labelNodesOnEdge({ edge, points, labelAt }: RoutedEdge, measurer: TextMeasurer, paper: string): SvgNode[] {
  const layout = edge.label ? edgeLabelLayout(points, labelAt, edge.label, measurer) : null;
  if (!layout) return [];
  const { box, lines } = layout;
  const background = node("rect", {
    x: box.x - LABEL_PAD,
    y: box.y - LABEL_PAD,
    width: box.w + 2 * LABEL_PAD,
    height: box.h + 2 * LABEL_PAD,
    fill: paper,
  });
  return [background, ...lineNodes(lines, box.x + box.w / 2, box.y, "middle")];
}

function edgeNode(routed: RoutedEdge, measurer: TextMeasurer, hideText: boolean, paper: string): SvgNode {
  const { edge, points, style } = routed;
  const stroke = paint(style.stroke);
  const width = numeric(style.strokeWidth);
  const path = node("path", {
    d: points.map((p, i) => `${i === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`).join(""),
    fill: "none",
    stroke,
    ...(width !== undefined && { "stroke-width": width }),
    "stroke-linejoin": "round",
  });
  const heads = [headShape(style.headStart ?? "none", points, "start"), headShape(style.headEnd ?? "none", points, "end")].flatMap((head) => {
    if (!head) return [];
    if (head.kind === "dot") return [node("circle", { cx: head.centre.x, cy: head.centre.y, r: head.r, fill: stroke })];
    return [node("polygon", { points: head.points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(" "), fill: stroke })];
  });
  return node("g", { "data-id": edge.id, ...opacityAttrs(style) }, [
    path,
    ...heads,
    ...(hideText ? [] : labelNodesOnEdge(routed, measurer, paper)),
  ]);
}

/**
 * Describes the drawable elements bottom to top, which is z-order: the layout order, with edges
 * that have no layout entry on top. Each element is a `g` carrying its ID in `data-id`. Rectangles,
 * ellipses, text boxes and edges are drawn; frames, images, unknown elements, elements without
 * a layout entry and edges that cannot be routed are not.
 */
export function describeDiagram(doc: DiagramDocument, measurer: TextMeasurer, options: DescribeOptions = {}): SvgNode[] {
  const { only, shapes, hideText } = options;
  const elements = elementsById(doc);
  const entries = layoutById(doc);
  const edges = routedEdges(doc, measurer, only);
  const paper = themeColour(doc, "paper") ?? "#ffffff";
  const out: SvgNode[] = [];
  for (const id of stackOrder(doc)) {
    if (only && !only.has(id)) continue;
    const element = elements.get(id);
    if (!element) continue;
    if (element.kind === "edge") {
      const routed = edges.get(id);
      if (routed) out.push(edgeNode(routed, measurer, hideText?.has(id) === true, paper));
      continue;
    }
    const entry = entries.get(id);
    const size = sizeOf(element, entry, measurer);
    if (!entry || !size) continue;
    const style = styleOf(doc, element);
    const children = body(element, style, size.w, size.h, measurer, shapes, hideText?.has(element.id) === true);
    if (!children) continue;
    const attrs = { "data-id": element.id, transform: `translate(${fmt(entry.x)} ${fmt(entry.y)})`, ...opacityAttrs(style) };
    out.push(node("g", attrs, children));
  }
  return out;
}

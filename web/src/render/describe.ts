// The renderer's output: a tree of SVG nodes describing a document. It is
// data, not DOM, so it needs no browser to test; `mount` puts it on the page. The renderer holds
// no state: the same document always gives the same tree.
import { headShape } from "../connectors/heads.ts";
import { edgeLabelLayout } from "../connectors/label.ts";
import { type RoutedEdge, routedEdges } from "../connectors/edges.ts";
import type { DiagramDocument, DiagramElement, StyleProps } from "../model/index.ts";
import { elementsById, layoutById } from "../model/lookup.ts";
import { bundledLoader } from "../shapes/bundled-packs.ts";
import type { ShapeDrawing } from "../shapes/pack-loader.ts";
import type { SvgEl } from "../shapes/svg.ts";
import type { ShapeManifest, Size } from "../shapes/types.ts";
import { styleOf, themeColour } from "../style/of.ts";
import { type TextLook, textLookOf } from "../style/text-look.ts";
import { COLOUR } from "../style/values.ts";
import { svgTextAttrs, type TextMeasurer } from "../text/measure.ts";
import { fillPaint, shadowFilter } from "./defs.ts";
import { isBuiltInShape, outlineKind, stackOrder } from "./boxes.ts";
import { sizeOf } from "./size.ts";
import { alignedX, labelLayout, layoutTextBox } from "./text-layout.ts";

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
  /** Where pack shapes come from; the bundled packs when absent. */
  packs?: ShapeSource;
  /** Elements drawn without their text, because an editor is showing it. */
  hideText?: ReadonlySet<string>;
  /** Leave out shadow filters, which are the costly part of painting while elements move. */
  plain?: boolean;
}

/** Finds pack shapes by the name written in the file. Both answer undefined for a name no pack provides. */
export interface ShapeSource {
  shape(name: string): ShapeManifest | undefined;
  drawing(name: string, size: Size): ShapeDrawing | undefined;
}

/** A resolved colour as an SVG paint; anything that is not a plain colour draws as none. */
const paint = (value: unknown): string => (typeof value === "string" && COLOUR.test(value) ? value : "none");

const numeric = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined);

/** Dash lengths in stroke widths, so a thick line has longer dashes. */
const DASH_PATTERNS = { dashed: [4, 3], dotted: [1, 2] } as const;

function dashAttrs(style: StyleProps): SvgNode["attrs"] {
  const pattern = style.dash === "dashed" || style.dash === "dotted" ? DASH_PATTERNS[style.dash] : undefined;
  const width = numeric(style.strokeWidth) ?? 1;
  return pattern ? { "stroke-dasharray": pattern.map((n) => n * width).join(" ") } : {};
}

/** The fill, stroke and dash attributes of an outline. */
function outlineAttrs(doc: DiagramDocument, style: StyleProps): SvgNode["attrs"] {
  const width = numeric(style.strokeWidth);
  return {
    fill: fillPaint(doc, style.fill),
    stroke: paint(style.stroke),
    ...(width !== undefined && { "stroke-width": width }),
    ...dashAttrs(style),
  };
}

/** The shadow filter on the element's group, unless the render is plain. */
function shadowAttrs(doc: DiagramDocument, style: StyleProps, plain: boolean | undefined): SvgNode["attrs"] {
  const filter = plain ? undefined : shadowFilter(doc, style.shadow);
  return filter === undefined ? {} : { filter };
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
function lineNodes(lines: string[], x: number, top: number, anchor: "start" | "middle" | "end", look: TextLook): SvgNode[] {
  return lines.map((line, i) =>
    node(
      "text",
      {
        x,
        y: top + look.lineHeight / 2 + i * look.lineHeight,
        "text-anchor": anchor,
        "dominant-baseline": "central",
        ...svgTextAttrs(look.style),
        ...(look.underline && { "text-decoration": "underline" }),
        fill: look.color,
      },
      [],
      line,
    ),
  );
}

function labelNodes(label: string, w: number, h: number, measurer: TextMeasurer, look: TextLook, manifest?: ShapeManifest): SvgNode[] {
  const { lines, x, top } = labelLayout(label, { w, h }, measurer, look, manifest);
  return lineNodes(lines, x, top, alignedX(look.align, 0, 0).anchor, look);
}

/** Dashes of the placeholder for a shape no pack provides. */
const PLACEHOLDER_DASH = "6 4";

/** The paint a part of a pack shape takes from its role: fill takes fill and stroke, stroke only the stroke, detail the stroke at two thirds of the width. */
function roleAttrs(doc: DiagramDocument, style: StyleProps, role: string | undefined): SvgNode["attrs"] {
  const width = numeric(style.strokeWidth);
  if (role === "fill") return outlineAttrs(doc, style);
  if (role === "stroke") return { ...outlineAttrs(doc, style), fill: "none" };
  if (role === "detail") return { fill: "none", stroke: paint(style.stroke), "stroke-width": ((width ?? 1) * 2) / 3 };
  return {};
}

function packNode(doc: DiagramDocument, style: StyleProps, el: SvgEl): SvgNode {
  const { "data-role": role, ...attrs } = el.attrs;
  return node(el.tag, { ...attrs, ...roleAttrs(doc, style, role) }, el.children.map((child) => packNode(doc, style, child)));
}

/** The shape's drawing, centred in the element's box when its aspect is locked. */
function packShapeNode(doc: DiagramDocument, style: StyleProps, drawing: ShapeDrawing, w: number, h: number): SvgNode {
  const x = (w - drawing.box.w) / 2;
  const y = (h - drawing.box.h) / 2;
  return node(
    "g",
    { "stroke-linejoin": "round", "stroke-linecap": "round", ...((x !== 0 || y !== 0) && { transform: `translate(${fmt(x)} ${fmt(y)})` }) },
    drawing.svg.children.map((child) => packNode(doc, style, child)),
  );
}

function placeholderNodes(doc: DiagramDocument, style: StyleProps, name: string, w: number, h: number, measurer: TextMeasurer, hideText: boolean): SvgNode[] {
  const outline = node("rect", { width: w, height: h, ...outlineAttrs(doc, style), fill: "none", "stroke-dasharray": PLACEHOLDER_DASH });
  return [outline, ...(hideText ? [] : labelNodes(name, w, h, measurer, textLookOf(style)))];
}

function body(
  doc: DiagramDocument,
  element: DiagramElement,
  style: StyleProps,
  w: number,
  h: number,
  measurer: TextMeasurer,
  packs: ShapeSource,
  hideText: boolean,
): SvgNode[] | null {
  switch (element.kind) {
    case "node":
    case "shape": {
      if (!isBuiltInShape(element.shape)) {
        const drawing = packs.drawing(element.shape, { w, h });
        if (!drawing) return placeholderNodes(doc, style, element.shape, w, h, measurer, hideText);
        const label =
          element.kind === "node" && !hideText ? labelNodes(element.label ?? element.id, w, h, measurer, textLookOf(style), packs.shape(element.shape)) : [];
        return [packShapeNode(doc, style, drawing, w, h), ...label];
      }
      const outline =
        outlineKind(element) === "ellipse"
          ? node("ellipse", { cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2, ...outlineAttrs(doc, style) })
          : node("rect", { width: w, height: h, ...cornerAttrs(style), ...outlineAttrs(doc, style) });
      const label =
        element.kind === "node" && !hideText ? labelNodes(element.label ?? element.id, w, h, measurer, textLookOf(style)) : [];
      return [outline, ...label];
    }
    case "text": {
      const background =
        style.fill !== undefined || style.stroke !== undefined
          ? [node("rect", { width: w, height: h, ...cornerAttrs(style), ...outlineAttrs(doc, style) })]
          : [];
      const look = textLookOf(style);
      const at = alignedX(look.align, 0, w);
      const lines = hideText ? [] : lineNodes(layoutTextBox(element.content, w, measurer, look).lines, at.x, 0, at.anchor, look);
      return [...background, ...lines];
    }
    default:
      return null;
  }
}

const fmt = (n: number): string => String(n);

/** The background behind a label, so the line does not run through the text, and its room around the text. */
const LABEL_PAD = 4;

function labelNodesOnEdge({ edge, points, labelAt, style }: RoutedEdge, measurer: TextMeasurer, paper: string): SvgNode[] {
  const look = textLookOf(style);
  const layout = edge.label ? edgeLabelLayout(points, labelAt, edge.label, measurer, look) : null;
  if (!layout) return [];
  const { box, lines } = layout;
  const background = node("rect", {
    x: box.x - LABEL_PAD,
    y: box.y - LABEL_PAD,
    width: box.w + 2 * LABEL_PAD,
    height: box.h + 2 * LABEL_PAD,
    fill: paper,
  });
  const at = alignedX(look.align, box.x, box.w);
  return [background, ...lineNodes(lines, at.x, box.y, at.anchor, look)];
}

function edgeNode(doc: DiagramDocument, routed: RoutedEdge, measurer: TextMeasurer, hideText: boolean, paper: string, plain: boolean | undefined): SvgNode {
  const { edge, points, style } = routed;
  const stroke = paint(style.stroke);
  const width = numeric(style.strokeWidth);
  const path = node("path", {
    d: points.map((p, i) => `${i === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`).join(""),
    fill: "none",
    stroke,
    ...(width !== undefined && { "stroke-width": width }),
    "stroke-linejoin": "round",
    ...dashAttrs(style),
  });
  const heads = [headShape(style.headStart ?? "none", points, "start"), headShape(style.headEnd ?? "none", points, "end")].flatMap((head) => {
    if (!head) return [];
    if (head.kind === "dot") return [node("circle", { cx: head.centre.x, cy: head.centre.y, r: head.r, fill: stroke })];
    return [node("polygon", { points: head.points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(" "), fill: stroke })];
  });
  return node("g", { "data-id": edge.id, ...opacityAttrs(style), ...shadowAttrs(doc, style, plain) }, [
    path,
    ...heads,
    ...(hideText ? [] : labelNodesOnEdge(routed, measurer, paper)),
  ]);
}

/**
 * Describes the drawable elements bottom to top, which is z-order: the layout order, with edges
 * that have no layout entry on top. Each element is a `g` carrying its ID in `data-id`. Rectangles,
 * ellipses, pack shapes, text boxes and edges are drawn, and a shape no pack provides is a dashed
 * placeholder; frames, images, unknown elements, elements without a layout entry and edges that
 * cannot be routed are not.
 */
export function describeDiagram(doc: DiagramDocument, measurer: TextMeasurer, options: DescribeOptions = {}): SvgNode[] {
  const { only, packs = bundledLoader, hideText, plain } = options;
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
      if (routed) out.push(edgeNode(doc, routed, measurer, hideText?.has(id) === true, paper, plain));
      continue;
    }
    const entry = entries.get(id);
    const size = sizeOf(doc, element, entry, measurer, (name) => packs.shape(name));
    if (!entry || !size) continue;
    const style = styleOf(doc, element);
    const children = body(doc, element, style, size.w, size.h, measurer, packs, hideText?.has(element.id) === true);
    if (!children) continue;
    const attrs = { "data-id": element.id, transform: `translate(${fmt(entry.x)} ${fmt(entry.y)})`, ...opacityAttrs(style), ...shadowAttrs(doc, style, plain) };
    out.push(node("g", attrs, children));
  }
  return out;
}

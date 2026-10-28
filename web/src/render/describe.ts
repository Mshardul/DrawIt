// The renderer's output: a tree of SVG nodes describing a document. It is
// data, not DOM, so it needs no browser to test; `mount` puts it on the page. The renderer holds
// no state: the same document always gives the same tree.
import type { DiagramDocument, DiagramElement } from "../model/index.ts";
import type { ShapeManifest } from "../shapes/types.ts";
import { svgTextAttrs, type TextMeasurer } from "../text/measure.ts";
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

const FILL = "#dbe8f5";
const STROKE = "#1f4e79";
const INK = "#1a1a1a";

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

function body(element: DiagramElement, w: number, h: number, measurer: TextMeasurer, shapes: ShapeLookup | undefined, hideText: boolean): SvgNode[] | null {
  switch (element.kind) {
    case "node":
    case "shape": {
      const outline =
        element.shape === "ellipse"
          ? node("ellipse", { cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2, fill: FILL, stroke: STROKE })
          : node("rect", { width: w, height: h, fill: FILL, stroke: STROKE });
      const label =
        element.kind === "node" && !hideText ? labelNodes(element.label ?? element.id, w, h, measurer, shapes?.(element.shape)) : [];
      return [outline, ...label];
    }
    case "text":
      return hideText ? [] : lineNodes(layoutTextBox(element.content, w, measurer).lines, 0, 0, "start");
    default:
      return null;
  }
}

/**
 * Describes the drawable elements in layout order, which is z-order. Each element is
 * a `g` carrying its ID in `data-id`. Rectangles, ellipses and text boxes are drawn; edges
 * (routing is separate), frames, images, unknown elements and elements without a layout entry are not.
 */
export function describeDiagram(doc: DiagramDocument, measurer: TextMeasurer, options: DescribeOptions = {}): SvgNode[] {
  const { only, shapes, hideText } = options;
  const elements = new Map(doc.elements.map((e) => [e.id, e]));
  const out: SvgNode[] = [];
  for (const entry of doc.layout) {
    if (only && !only.has(entry.id)) continue;
    const element = elements.get(entry.id);
    const size = element && sizeOf(element, entry, measurer);
    if (!element || !size) continue;
    const children = body(element, size.w, size.h, measurer, shapes, hideText?.has(element.id) === true);
    if (!children) continue;
    out.push(node("g", { "data-id": element.id, transform: `translate(${String(entry.x)} ${String(entry.y)})` }, children));
  }
  return out;
}

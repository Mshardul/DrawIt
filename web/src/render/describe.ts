// The renderer's output: a tree of SVG nodes describing a document (spec 6.1, decision A2). It is
// data, not DOM, so it needs no browser to test; `mount` puts it on the page. The renderer holds
// no state: the same document always gives the same tree.
import type { DiagramDocument, DiagramElement } from "../model/index.ts";
import { sizeOf, TEXT_LINE_H } from "./size.ts";

export interface SvgNode {
  tag: string;
  attrs: Record<string, string | number>;
  children: SvgNode[];
  /** Text content, for `text` and `tspan` nodes. */
  text?: string;
}

const FILL = "#dbe8f5";
const STROKE = "#1f4e79";
const INK = "#1a1a1a";
const FONT_SIZE = 14;

const node = (tag: string, attrs: SvgNode["attrs"], children: SvgNode[] = [], text?: string): SvgNode =>
  text === undefined ? { tag, attrs, children } : { tag, attrs, children, text };

/** One text node per line, centred or left-aligned on `x`, the block centred on `y` or starting at it. */
function lines(content: string, x: number, y: number, anchor: "start" | "middle", middle: boolean): SvgNode[] {
  const parts = content.split("\n");
  const first = middle ? y - ((parts.length - 1) * TEXT_LINE_H) / 2 : y + TEXT_LINE_H / 2;
  return parts.map((part, i) =>
    node(
      "text",
      {
        x,
        y: first + i * TEXT_LINE_H,
        "text-anchor": anchor,
        "dominant-baseline": "central",
        "font-size": FONT_SIZE,
        fill: INK,
      },
      [],
      part,
    ),
  );
}

function body(element: DiagramElement, w: number, h: number): SvgNode[] | null {
  switch (element.kind) {
    case "node":
    case "shape": {
      const outline =
        element.shape === "ellipse"
          ? node("ellipse", { cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2, fill: FILL, stroke: STROKE })
          : node("rect", { width: w, height: h, fill: FILL, stroke: STROKE });
      const label = element.kind === "node" ? lines(element.label ?? element.id, w / 2, h / 2, "middle", true) : [];
      return [outline, ...label];
    }
    case "text":
      return lines(element.content, 0, 0, "start", false);
    default:
      return null;
  }
}

/**
 * Describes the drawable elements in layout order, which is z-order (spec 4.5). Each element is
 * a `g` carrying its ID in `data-id`. Rectangles, ellipses and text boxes are drawn; edges
 * (routing is T-018), frames, images, unknown elements and elements without a layout entry are not.
 */
export function describeDiagram(doc: DiagramDocument, only?: ReadonlySet<string>): SvgNode[] {
  const elements = new Map(doc.elements.map((e) => [e.id, e]));
  const out: SvgNode[] = [];
  for (const entry of doc.layout) {
    if (only && !only.has(entry.id)) continue;
    const element = elements.get(entry.id);
    const size = element && sizeOf(element, entry);
    if (!element || !size) continue;
    const children = body(element, size.w, size.h);
    if (!children) continue;
    out.push(node("g", { "data-id": element.id, transform: `translate(${String(entry.x)} ${String(entry.y)})` }, children));
  }
  return out;
}

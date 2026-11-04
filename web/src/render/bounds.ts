import { routedEdges } from "../connectors/edges.ts";
import { headShape } from "../connectors/heads.ts";
import { edgeLabelLayout, LABEL_PAD } from "../connectors/label.ts";
import type { DiagramDocument, DiagramElement, Point, StyleProps } from "../model/index.ts";
import { layoutById } from "../model/lookup.ts";
import { styleOf } from "../style/of.ts";
import { textLookOf } from "../style/text-look.ts";
import { COLOUR, parseShadow } from "../style/values.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { type Box, elementBox, isDrawn } from "./boxes.ts";
import { shadowFilter } from "./defs.ts";
import { frameName } from "./frame.ts";
import type { ImageLookup } from "./images.ts";

/** A Gaussian is negligible past three standard deviations, and the filter stores half the blur there. */
const SHADOW_SIGMAS = 3;

function union(boxes: readonly (Box | null)[]): Box | null {
  const present = boxes.filter((box): box is Box => box !== null);
  const first = present[0];
  if (!first) return null;
  let x0 = first.x;
  let y0 = first.y;
  let x1 = first.x + first.w;
  let y1 = first.y + first.h;
  for (const box of present.slice(1)) {
    x0 = Math.min(x0, box.x);
    y0 = Math.min(y0, box.y);
    x1 = Math.max(x1, box.x + box.w);
    y1 = Math.max(y1, box.y + box.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function outset(box: Box, left: number, top: number, right: number, bottom: number): Box {
  return { x: box.x - left, y: box.y - top, w: box.w + left + right, h: box.h + top + bottom };
}

function pointsBox(points: readonly Point[]): Box | null {
  const first = points[0];
  if (!first) return null;
  let x0 = first.x;
  let y0 = first.y;
  let x1 = first.x;
  let y1 = first.y;
  for (const point of points.slice(1)) {
    x0 = Math.min(x0, point.x);
    y0 = Math.min(y0, point.y);
    x1 = Math.max(x1, point.x);
    y1 = Math.max(y1, point.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function strokeOutset(style: StyleProps): number {
  if (typeof style.stroke !== "string" || !COLOUR.test(style.stroke)) return 0;
  const width = typeof style.strokeWidth === "number" ? style.strokeWidth : 1;
  return width / 2;
}

function shadowOutset(doc: DiagramDocument, style: StyleProps): { left: number; top: number; right: number; bottom: number } {
  const none = { left: 0, top: 0, right: 0, bottom: 0 };
  const shadow = typeof style.shadow === "string" && shadowFilter(doc, style.shadow) ? parseShadow(style.shadow) : undefined;
  if (!shadow) return none;
  const spread = (SHADOW_SIGMAS * shadow.blur) / 2;
  return {
    left: Math.max(0, -shadow.dx) + spread,
    right: Math.max(0, shadow.dx) + spread,
    bottom: Math.max(0, shadow.dy) + spread,
    top: Math.max(0, -shadow.dy) + spread,
  };
}

function withShadow(doc: DiagramDocument, style: StyleProps, box: Box): Box {
  const shadow = shadowOutset(doc, style);
  return outset(box, shadow.left, shadow.top, shadow.right, shadow.bottom);
}

function edgeExtent(doc: DiagramDocument, element: DiagramElement, measurer: TextMeasurer, images: ImageLookup): Box | null {
  if (element.kind !== "edge") return null;
  const routed = routedEdges(doc, measurer, new Set([element.id]), images).get(element.id);
  if (!routed) return null;
  const pad = strokeOutset(routed.style);
  const path = pointsBox(routed.points);
  const heads = [headShape(routed.style.headStart ?? "none", routed.points, "start"), headShape(routed.style.headEnd ?? "none", routed.points, "end")].flatMap((head) => {
    if (!head) return [];
    if (head.kind === "dot") return [{ x: head.centre.x - head.r, y: head.centre.y - head.r, w: head.r * 2, h: head.r * 2 }];
    return pointsBox(head.points) ?? [];
  });
  const label = routed.edge.label ? edgeLabelLayout(routed.points, routed.labelAt, routed.edge.label, measurer, textLookOf(routed.style)) : null;
  const labelBox = label ? outset(label.box, LABEL_PAD, LABEL_PAD, LABEL_PAD, LABEL_PAD) : null;
  const ink = union([path ? outset(path, pad, pad, pad, pad) : null, ...heads, labelBox]);
  return ink && withShadow(doc, routed.style, ink);
}

export function elementExtent(doc: DiagramDocument, element: DiagramElement, measurer: TextMeasurer, images: ImageLookup): Box | null {
  if (element.kind === "edge") return edgeExtent(doc, element, measurer, images);
  if (!isDrawn(element)) return null;
  const box = elementBox(doc, element, layoutById(doc).get(element.id), measurer, images);
  if (!box) return null;
  const style = styleOf(doc, element);
  const pad = strokeOutset(style);
  const name = element.kind === "frame" ? frameName(doc, element, measurer)?.box ?? null : null;
  const ink = union([outset(box, pad, pad, pad, pad), name]);
  return ink && withShadow(doc, style, ink);
}

export function diagramBounds(doc: DiagramDocument, measurer: TextMeasurer, images: ImageLookup, ids?: ReadonlySet<string>): Box | null {
  return union(doc.elements.filter((element) => ids === undefined || ids.has(element.id)).map((element) => elementExtent(doc, element, measurer, images)));
}

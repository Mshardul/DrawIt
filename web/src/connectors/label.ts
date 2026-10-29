// Edge labels: where one is drawn on the routed path and the command that drags it along. Pure
// functions over the document.
import type { Command } from "../commands/command.ts";
import type { DiagramDocument, Point } from "../model/index.ts";
import type { Box } from "../render/boxes.ts";
import { layoutTextBox } from "../render/text-layout.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { routedEdges } from "./edges.ts";
import { nearestOnPath, pointAlongPath } from "./path.ts";

/** Where along the path a label sits when the layout gives no position. */
export const DEFAULT_LABEL_AT = 0.5;

export interface EdgeLabelLayout {
  /** The text as drawn, one entry per line. A label is never wrapped. */
  lines: string[];
  /** Centred on the point `labelAt` of the way along the path. */
  box: Box;
}

/** The lines and box of a label at `labelAt` along `points`, or null when the path is not drawn. */
export function edgeLabelLayout(points: Point[], labelAt: number | undefined, text: string, measurer: TextMeasurer): EdgeLabelLayout | null {
  const centre = pointAlongPath(points, labelAt ?? DEFAULT_LABEL_AT);
  if (!centre) return null;
  const { w, h, lines } = layoutTextBox(text, undefined, measurer);
  return { lines, box: { x: centre.x - w / 2, y: centre.y - h / 2, w, h } };
}

/**
 * The command that moves the label of the edge to the point of its path nearest `p`, in hundredths
 * of the length. Null for an unknown, locked or not-an-edge ID, or a label left where it is.
 */
export function labelDragCommand(doc: DiagramDocument, measurer: TextMeasurer, edgeId: string, p: Point): Command | null {
  const entry = doc.layout.find((e) => e.id === edgeId);
  const routed = routedEdges(doc, measurer, new Set([edgeId])).get(edgeId);
  const near = routed && nearestOnPath(routed.points, p);
  if (!near || entry?.locked === true) return null;
  const labelAt = Math.round(near.along * 100) / 100;
  if (labelAt === (entry?.labelAt ?? DEFAULT_LABEL_AT)) return null;
  return { type: "setLayout", changes: [{ id: edgeId, set: { labelAt } }] };
}

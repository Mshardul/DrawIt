// Placing a library shape with the shape tool: the node a click or a drag on the canvas adds.
import type { Command } from "../commands/command.ts";
import type { DiagramDocument, Point } from "../model/index.ts";
import { unusedId } from "../model/index.ts";
import { MIN_SIZE } from "../move/transform.ts";
import { snapTo } from "../move/snap.ts";
import type { Size } from "../shapes/types.ts";

export interface PlacedShape {
  /** As a node's `shape` property names it. */
  shape: string;
  /** The size a click places it at. */
  size: Size;
}

/**
 * The command that adds a node of `placed`, and its ID. A click (`to` is null) centres the node on
 * `from` at the shape's size; a drag sizes it from `from` to `to`, at least `MIN_SIZE` each way. With
 * a grid size above 0 the corners snap to the grid.
 */
export function newShapeCommand(doc: DiagramDocument, placed: PlacedShape, from: Point, to: Point | null, grid: number): { command: Command; id: string } {
  const snap = (v: number): number => Math.round(snapTo(v, grid));
  const id = unusedId(doc.elements, placed.shape.replace(/^[^.]+\./, ""));
  let box: { x: number; y: number; w: number; h: number };
  if (to === null) {
    box = { x: snap(from.x - placed.size.w / 2), y: snap(from.y - placed.size.h / 2), ...placed.size };
  } else {
    const [x1, x2] = [snap(Math.min(from.x, to.x)), snap(Math.max(from.x, to.x))];
    const [y1, y2] = [snap(Math.min(from.y, to.y)), snap(Math.max(from.y, to.y))];
    box = { x: x1, y: y1, w: Math.max(MIN_SIZE, x2 - x1), h: Math.max(MIN_SIZE, y2 - y1) };
  }
  return { command: { type: "add", items: [{ element: { kind: "node", id, shape: placed.shape }, layout: { id, ...box } }] }, id };
}

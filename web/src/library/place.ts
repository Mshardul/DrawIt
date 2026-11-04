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
 * The box a click or a drag places. A click (`to` is null) centres a box of `size` on `from`; a drag
 * sizes it from `from` to `to`, at least `MIN_SIZE` each way. With a grid size above 0 the corners snap
 * to the grid.
 */
export function placementBox(from: Point, to: Point | null, size: Size, grid: number): { x: number; y: number; w: number; h: number } {
  const snap = (v: number): number => Math.round(snapTo(v, grid));
  if (to === null) return { x: snap(from.x - size.w / 2), y: snap(from.y - size.h / 2), ...size };
  const [x1, x2] = [snap(Math.min(from.x, to.x)), snap(Math.max(from.x, to.x))];
  const [y1, y2] = [snap(Math.min(from.y, to.y)), snap(Math.max(from.y, to.y))];
  return { x: x1, y: y1, w: Math.max(MIN_SIZE, x2 - x1), h: Math.max(MIN_SIZE, y2 - y1) };
}

/** The command that adds a node of `placed` in the box a click or drag gives, and its ID. */
export function newShapeCommand(doc: DiagramDocument, placed: PlacedShape, from: Point, to: Point | null, grid: number): { command: Command; id: string } {
  const id = unusedId(doc.elements, placed.shape.replace(/^[^.]+\./, ""));
  const box = placementBox(from, to, placed.size, grid);
  return { command: { type: "add", items: [{ element: { kind: "node", id, shape: placed.shape }, layout: { id, ...box } }] }, id };
}

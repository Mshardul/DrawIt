// Drawing a frame with the frame tool: the frame a click or a drag on the canvas adds.
import type { Command } from "../commands/command.ts";
import { placementBox } from "../library/place.ts";
import type { DiagramDocument, Point } from "../model/index.ts";
import { unusedId } from "../model/index.ts";
import { FRAME_H, FRAME_W } from "../render/size.ts";

/**
 * The command that adds a frame with no name, and its ID. A click (`to` is null) centres a frame of
 * the default size on `from`; a drag sizes it from `from` to `to`.
 */
export function newFrameCommand(doc: DiagramDocument, from: Point, to: Point | null, grid: number): { command: Command; id: string } {
  const id = unusedId(doc.elements, "frame");
  const box = placementBox(from, to, { w: FRAME_W, h: FRAME_H }, grid);
  return { command: { type: "add", items: [{ element: { kind: "frame", id }, layout: { id, ...box } }] }, id };
}

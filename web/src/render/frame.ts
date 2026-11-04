// A frame's name: drawn one line above the frame's top left, so it never covers what the frame
// holds. Drawing and selection share it, so a click on the name is a click on the frame.
import type { DiagramDocument, FrameElement } from "../model/index.ts";
import { layoutById } from "../model/lookup.ts";
import { textLookFor } from "../style/of.ts";
import type { TextLook } from "../style/text-look.ts";
import type { TextMeasurer } from "../text/measure.ts";
import type { Box } from "./boxes.ts";

export interface FrameName {
  text: string;
  look: TextLook;
  /** In world coordinates. */
  box: Box;
}

/** The frame's name and where it is drawn; null when the frame has no name or no place. */
export function frameName(doc: DiagramDocument, frame: FrameElement, measurer: TextMeasurer): FrameName | null {
  const entry = layoutById(doc).get(frame.id);
  if (!entry || !frame.name) return null;
  const look = textLookFor(doc, frame);
  return {
    text: frame.name,
    look,
    box: { x: entry.x, y: entry.y - look.lineHeight, w: measurer.width(frame.name, look.style), h: look.lineHeight },
  };
}

/** Narrowest the box an empty name is typed in, so there is somewhere to click and type. */
export const MIN_NAME_W = 80;

/** Where a frame's name is drawn and edited; an empty or missing name still has a box. Null for a frame with no place. */
export function frameNameArea(doc: DiagramDocument, frame: FrameElement, measurer: TextMeasurer): { box: Box; look: TextLook } | null {
  const entry = layoutById(doc).get(frame.id);
  if (!entry) return null;
  const look = textLookFor(doc, frame);
  const width = frame.name ? measurer.width(frame.name, look.style) : 0;
  return { look, box: { x: entry.x, y: entry.y - look.lineHeight, w: Math.max(MIN_NAME_W, width), h: look.lineHeight } };
}

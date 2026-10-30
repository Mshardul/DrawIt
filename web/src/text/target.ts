// What the editing overlay edits: which field of which element, and where its text is drawn. Pure
// functions over the document, built on the layout the renderer draws with.
import type { Command } from "../commands/command.ts";
import { routedEdges } from "../connectors/edges.ts";
import { edgeLabelLayout } from "../connectors/label.ts";
import { type DiagramDocument, unusedId } from "../model/index.ts";
import { bundledLoader } from "../shapes/bundled-packs.ts";
import type { ShapeLookup } from "../shapes/pack-loader.ts";
import { sizeOf } from "../render/size.ts";
import { labelLayout, layoutTextBox } from "../render/text-layout.ts";
import { textLookFor } from "../style/of.ts";
import type { TextLook } from "../style/text-look.ts";
import type { Rect } from "../shapes/types.ts";
import type { TextMeasurer } from "./measure.ts";

export interface EditTarget {
  id: string;
  /** The element field the text is stored in. */
  field: "label" | "content" | "edgeLabel";
  text: string;
  /** The text as drawn, one entry per line. */
  lines: string[];
  /** Where the lines are drawn, in world coordinates. */
  box: Rect;
  /** How the text is drawn; the editor takes its font, colour, line height and alignment from it. */
  look: TextLook;
}

/** The text of `id` and where it is drawn, or null for an element with no text to edit or one that is not drawn. */
export function editTarget(doc: DiagramDocument, id: string, measurer: TextMeasurer, shapes: ShapeLookup = (name) => bundledLoader.shape(name)): EditTarget | null {
  const element = doc.elements.find((e) => e.id === id);
  const entry = doc.layout.find((e) => e.id === id);
  if (element?.kind === "edge") {
    const routed = routedEdges(doc, measurer, new Set([id])).get(id);
    const text = element.label ?? "";
    const look = textLookFor(doc, element);
    const layout = routed && edgeLabelLayout(routed.points, routed.labelAt, text, measurer, look);
    return layout ? { id, field: "edgeLabel", text, lines: layout.lines, box: layout.box, look } : null;
  }
  if (!element || !entry) return null;
  if (element.kind === "node") {
    const size = sizeOf(doc, element, entry, measurer);
    if (!size) return null;
    const look = textLookFor(doc, element);
    const text = element.label ?? element.id;
    const { lines, top, area } = labelLayout(text, size, measurer, look, shapes(element.shape));
    return {
      id,
      field: "label",
      text,
      lines,
      box: { x: entry.x + area.x, y: entry.y + top, w: area.w, h: lines.length * look.lineHeight },
      look,
    };
  }
  if (element.kind === "text") {
    const look = textLookFor(doc, element);
    const { w, h, lines } = layoutTextBox(element.content, entry.w, measurer, look);
    return { id, field: "content", text: element.content, lines, box: { x: entry.x, y: entry.y, w, h }, look };
  }
  return null;
}

/**
 * Sets the text of the field `editTarget` named. An edge with an empty label has no label, where a
 * node with an empty label keeps it, because a node with none shows its ID.
 */
export function setTextCommand(field: EditTarget["field"], id: string, value: string): Command {
  if (field === "content") return { type: "setElement", id, set: { content: value } };
  if (field === "edgeLabel" && value === "") return { type: "setElement", id, unset: ["label"] };
  return { type: "setElement", id, set: { label: value } };
}

/** `text`, or `text-2`, `text-3` and so on: the first ID not in use. */
export const newTextId = (doc: DiagramDocument): string => unusedId(doc.elements, "text");

/** An empty text box with its top-left corner at `at`, rounded to whole pixels. */
export function createTextCommand(doc: DiagramDocument, at: { x: number; y: number }): Command {
  const id = newTextId(doc);
  return { type: "add", items: [{ element: { kind: "text", id, content: "" }, layout: { id, x: Math.round(at.x), y: Math.round(at.y) } }] };
}

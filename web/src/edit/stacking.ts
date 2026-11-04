// Bring to front and send to back as pure functions from a document and a selection to one command.
// Nodes and edges share one order, so an edge moves past a shape like another shape does.
import type { Command } from "../commands/command.ts";
import type { DiagramDocument } from "../model/index.ts";
import { layoutById } from "../model/lookup.ts";
import { stackOrder } from "../render/boxes.ts";

export type StackTo = "front" | "back";

/**
 * The command that moves the selected elements to the top or bottom of the stack, keeping their
 * order among themselves. An edge with no layout entry draws on top of everything, so it gets an
 * entry when the order has to place it: when it is moved, and for a move to the front when it is
 * left behind, so the moved elements end up above it. Null if the order would not change.
 */
export function stackCommand(doc: DiagramDocument, ids: readonly string[], to: StackTo): Command | null {
  const order = stackOrder(doc);
  const chosen = new Set(ids);
  const selected = order.filter((id) => chosen.has(id));
  if (selected.length === 0) return null;
  const others = order.filter((id) => !chosen.has(id));
  const next = to === "front" ? [...others, ...selected] : [...selected, ...others];
  if (next.every((id, i) => id === order[i])) return null;

  const placed = layoutById(doc);
  const needEntry = order.filter((id) => !placed.has(id) && (to === "front" || chosen.has(id)));
  const reorder: Command = { type: "reorder", ids: selected, to };
  if (needEntry.length === 0) return reorder;
  return { type: "batch", commands: [{ type: "setLayout", changes: needEntry.map((id) => ({ id, set: { x: 0, y: 0 } })) }, reorder] };
}

/** Whether bring to front and send to back would each change the stack. */
export function stackAvailability(doc: DiagramDocument, ids: readonly string[]): Record<StackTo, boolean> {
  return { front: stackCommand(doc, ids, "front") !== null, back: stackCommand(doc, ids, "back") !== null };
}

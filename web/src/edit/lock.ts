// Lock and unlock as pure functions from a document and a selection to one command.
import type { Command, SetLayoutCommand } from "../commands/command.ts";
import type { DiagramDocument } from "../model/index.ts";
import { elementsById, layoutById } from "../model/lookup.ts";

export type LockState = "locked" | "unlocked" | "mixed";

/** Whether the selected elements that exist are all locked, all unlocked or both; null if none exists. */
export function lockState(doc: DiagramDocument, ids: readonly string[]): LockState | null {
  const elements = elementsById(doc);
  const entries = layoutById(doc);
  const states = new Set(ids.filter((id) => elements.has(id)).map((id) => entries.get(id)?.locked === true));
  if (states.size === 0) return null;
  return states.size === 2 ? "mixed" : states.has(true) ? "locked" : "unlocked";
}

/** One command setting or clearing `locked` on the selected elements that exist; null if none would change. */
export function lockCommand(doc: DiagramDocument, ids: readonly string[], locked: boolean): Command | null {
  const elements = elementsById(doc);
  const entries = layoutById(doc);
  const changes: SetLayoutCommand["changes"] = [];
  for (const id of new Set(ids)) {
    if (!elements.has(id) || (entries.get(id)?.locked === true) === locked) continue;
    changes.push(locked ? { id, set: { locked: true } } : { id, unset: ["locked"] });
  }
  return changes.length === 0 ? null : { type: "setLayout", changes };
}

/** Locks the whole selection, or unlocks it when it is all locked already. */
export function toggleLockCommand(doc: DiagramDocument, ids: readonly string[]): Command | null {
  return lockCommand(doc, ids, lockState(doc, ids) !== "locked");
}

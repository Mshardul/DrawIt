// Delete as a pure function from a document and a selection to one command.
import type { Command, SetElementCommand, SetLayoutCommand } from "../commands/command.ts";
import { edgesAttachedTo, routedEdges } from "../connectors/edges.ts";
import type { DiagramDocument } from "../model/index.ts";
import { elementsById, layoutById } from "../model/lookup.ts";
import type { TextMeasurer } from "../text/measure.ts";

/**
 * One command deleting the selected elements that exist and are not locked; null if there are none.
 * An edge that stays keeps each end that was on a deleted element at the point where it was drawn,
 * as a free end. An edge that is deleted along with its elements is simply removed.
 */
export function deleteCommand(doc: DiagramDocument, measurer: TextMeasurer, ids: readonly string[]): Command | null {
  const elements = elementsById(doc);
  const entries = layoutById(doc);
  const gone = new Set(ids.filter((id) => elements.has(id) && entries.get(id)?.locked !== true));
  if (gone.size === 0) return null;

  const staying = new Set(edgesAttachedTo(doc, gone).filter((id) => !gone.has(id)));
  const freed: Command[] = [];
  const points: SetLayoutCommand["changes"] = [];
  for (const { edge, points: path } of routedEdges(doc, measurer, staying).values()) {
    const set: NonNullable<SetLayoutCommand["changes"][number]["set"]> = {};
    const unset: ("from" | "to")[] = [];
    const ends: NonNullable<SetElementCommand["set"]> = {};
    for (const end of ["from", "to"] as const) {
      const target = edge[end];
      const at = end === "from" ? path[0] : path.at(-1);
      if (target === null || !gone.has(target) || !at) continue;
      ends[end] = null;
      set[end === "from" ? "fromPoint" : "toPoint"] = { x: Math.round(at.x), y: Math.round(at.y) };
      unset.push(end);
    }
    if (unset.length === 0) continue;
    freed.push({ type: "setElement", id: edge.id, set: ends });
    points.push({ id: edge.id, set, unset });
  }

  const commands: Command[] = [...freed];
  if (points.length > 0) commands.push({ type: "setLayout", changes: points });
  commands.push({ type: "delete", ids: [...gone] });
  return commands.length === 1 ? (commands[0] ?? null) : { type: "batch", commands };
}

// Align and distribute as pure functions from a document and a selection to one command.
import type { Command, SetLayoutCommand } from "../commands/command.ts";
import { edgeShifts } from "../move/transform.ts";
import type { DiagramDocument } from "../model/index.ts";
import { drawnBoxes, type DrawnBox } from "../render/boxes.ts";
import type { TextMeasurer } from "../text/measure.ts";

export type AlignMode = "left" | "centre" | "right" | "top" | "middle" | "bottom";
export type Axis = "horizontal" | "vertical";

const selectedBoxes = (doc: DiagramDocument, measurer: TextMeasurer, ids: readonly string[]): DrawnBox[] => {
  const wanted = new Set(ids);
  return drawnBoxes(doc, measurer).filter((b) => wanted.has(b.element.id));
};

/**
 * The command that moves elements by the given amounts, with the bend points of every edge whose
 * two ends move by the same amount, as a move would carry them. Null if nothing moves.
 */
function moves(doc: DiagramDocument, deltas: Map<DrawnBox, { dx: number; dy: number }>): Command | null {
  const changes: SetLayoutCommand["changes"] = [];
  const groups = new Map<string, { dx: number; dy: number; ids: Set<string> }>();
  for (const [box, { dx, dy }] of deltas) {
    if (dx === 0 && dy === 0) continue;
    changes.push({ id: box.element.id, set: { x: box.x + dx, y: box.y + dy } });
    const key = `${String(dx)},${String(dy)}`;
    const group = groups.get(key) ?? { dx, dy, ids: new Set<string>() };
    group.ids.add(box.element.id);
    groups.set(key, group);
  }
  if (changes.length === 0) return null;
  for (const { dx, dy, ids } of groups.values()) changes.push(...edgeShifts(doc, new Set(), ids, dx, dy));
  return { type: "setLayout", changes };
}

/**
 * Lines the selected elements up on the edges or centre of their combined bounding box, which
 * includes locked elements, so a locked element is a fixed line the others align to. A locked
 * element is not moved. Null if fewer than two elements are selected or none would move.
 */
export function alignCommand(doc: DiagramDocument, measurer: TextMeasurer, ids: readonly string[], mode: AlignMode): Command | null {
  const boxes = selectedBoxes(doc, measurer, ids);
  if (boxes.length < 2) return null;
  const left = Math.min(...boxes.map((b) => b.x));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const top = Math.min(...boxes.map((b) => b.y));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  const deltas = new Map<DrawnBox, { dx: number; dy: number }>();
  for (const b of boxes) {
    if (b.locked) continue;
    const dx =
      mode === "left" ? left - b.x : mode === "right" ? right - b.w - b.x : mode === "centre" ? Math.round((left + right) / 2 - b.w / 2) - b.x : 0;
    const dy =
      mode === "top" ? top - b.y : mode === "bottom" ? bottom - b.h - b.y : mode === "middle" ? Math.round((top + bottom) / 2 - b.h / 2) - b.y : 0;
    deltas.set(b, { dx, dy });
  }
  return moves(doc, deltas);
}

/**
 * Spaces three or more elements so the gaps between neighbours along the axis are equal. The
 * first and last by position stay where they are. Locked elements are left out of the spacing.
 * Null if fewer than three can move or the gaps are already equal.
 */
export function distributeCommand(doc: DiagramDocument, measurer: TextMeasurer, ids: readonly string[], axis: Axis): Command | null {
  const horizontal = axis === "horizontal";
  const start = (b: DrawnBox): number => (horizontal ? b.x : b.y);
  const size = (b: DrawnBox): number => (horizontal ? b.w : b.h);
  const boxes = selectedBoxes(doc, measurer, ids)
    .filter((b) => !b.locked)
    .sort((a, b) => start(a) - start(b));
  const first = boxes[0];
  const last = boxes.at(-1);
  if (boxes.length < 3 || !first || !last) return null;
  const gap = (start(last) + size(last) - start(first) - boxes.reduce((sum, b) => sum + size(b), 0)) / (boxes.length - 1);
  const deltas = new Map<DrawnBox, { dx: number; dy: number }>();
  let at = start(first);
  for (const b of boxes) {
    const shift = Math.round(at) - start(b);
    deltas.set(b, horizontal ? { dx: shift, dy: 0 } : { dx: 0, dy: shift });
    at += size(b) + gap;
  }
  return moves(doc, deltas);
}

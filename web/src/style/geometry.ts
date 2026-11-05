// Position is the bounding box of the selection. Size is one unlocked element that is not an edge.
import type { Command } from "../commands/command.ts";
import type { DiagramDocument } from "../model/index.ts";
import { MIN_SIZE, moveCommand } from "../move/transform.ts";
import { drawnBoxes } from "../render/boxes.ts";
import type { TextMeasurer } from "../text/measure.ts";

export type GeometryName = "x" | "y" | "width" | "height";

export interface GeometryField {
  name: GeometryName;
  value: { state: "same"; value: number } | { state: "mixed" };
  disabled: boolean;
}

function boxesOf(doc: DiagramDocument, measurer: TextMeasurer, selection: readonly string[]) {
  const picked = new Set(selection);
  return drawnBoxes(doc, measurer).filter((box) => picked.has(box.element.id));
}

/** x and y of the selection's box, and width and height when one unlocked element has a size. */
export function geometryFields(doc: DiagramDocument, measurer: TextMeasurer, selection: readonly string[]): GeometryField[] {
  const boxes = boxesOf(doc, measurer, selection);
  const first = boxes[0];
  if (!first) return [];
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const locked = boxes.every((box) => box.locked);
  const position: GeometryField[] = [
    { name: "x", value: { state: "same", value: x }, disabled: locked },
    { name: "y", value: { state: "same", value: y }, disabled: locked },
  ];
  const only = boxes.length === 1 ? first : undefined;
  if (!only || only.locked) return position;
  return [
    ...position,
    { name: "width", value: { state: "same", value: only.w }, disabled: false },
    { name: "height", value: { state: "same", value: only.h }, disabled: only.element.kind === "text" },
  ];
}

/** The command for typing a new x, y, width or height. Null when the value changes nothing. */
export function geometryCommand(
  doc: DiagramDocument,
  measurer: TextMeasurer,
  selection: readonly string[],
  name: GeometryName,
  value: number,
): Command | null {
  const boxes = boxesOf(doc, measurer, selection);
  const first = boxes[0];
  if (!first || !Number.isFinite(value)) return null;
  if (name === "x" || name === "y") {
    const origin = Math.min(...boxes.map((box) => (name === "x" ? box.x : box.y)));
    const delta = Math.round(value) - origin;
    return moveCommand(doc, measurer, [...selection], name === "x" ? delta : 0, name === "y" ? delta : 0);
  }
  const only = boxes.length === 1 ? first : undefined;
  if (!only || only.locked || (only.element.kind === "text" && name === "height")) return null;
  const next = Math.max(MIN_SIZE, Math.round(value));
  if (name === "width" ? next === only.w : next === only.h) return null;
  return { type: "setLayout", changes: [{ id: only.element.id, set: name === "width" ? { w: next } : { h: next } }] };
}

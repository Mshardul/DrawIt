// Move and resize as pure functions from a document and a pointer delta to one command.
// A drag previews by applying the command to a copy; release commits it, so one drag is one
// undo step. Only drawn, unlocked elements transform; edges, frames, images and unknown elements
// are not drawn and so never move.
import type { Command } from "../commands/command.ts";
import type { DiagramDocument } from "../model/index.ts";
import { drawnBoxes, type DrawnBox } from "../render/boxes.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { snapTo } from "./snap.ts";

/** Smallest width or height a resize leaves (one cell of the 8px design grid). */
export const MIN_SIZE = 8;

export type Handle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

const ALL_HANDLES: Handle[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
const TEXT_HANDLES: Handle[] = ["e", "w"];

const transformable = (doc: DiagramDocument, measurer: TextMeasurer, id: string): DrawnBox | undefined =>
  drawnBoxes(doc, measurer).find((b) => b.element.id === id && !b.locked);

/**
 * One command moving every transformable selected element by (dx, dy), rounded to whole px; null
 * if nothing moves. With a `grid` size the selection's top-left corner lands on the grid and the
 * elements keep their offsets from it.
 */
export function moveCommand(doc: DiagramDocument, measurer: TextMeasurer, ids: string[], dx: number, dy: number, grid = 0): Command | null {
  const selected = new Set(ids);
  const boxes = drawnBoxes(doc, measurer).filter((b) => selected.has(b.element.id) && !b.locked);
  if (boxes.length === 0) return null;
  let rx = Math.round(dx);
  let ry = Math.round(dy);
  if (grid > 0) {
    const left = Math.min(...boxes.map((b) => b.x));
    const top = Math.min(...boxes.map((b) => b.y));
    rx = snapTo(left + rx, grid) - left;
    ry = snapTo(top + ry, grid) - top;
  }
  if (rx === 0 && ry === 0) return null;
  const changes = boxes
    .map((b) => ({ id: b.element.id, set: { x: b.x + rx, y: b.y + ry } }));
  return changes.length === 0 ? null : { type: "setLayout", changes };
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** An arrow key moves the selection 1px, or 10px with shift. */
export function nudgeCommand(doc: DiagramDocument, measurer: TextMeasurer, ids: string[], key: string, shift: boolean): Command | null {
  const step = ARROWS[key];
  if (!step) return null;
  const distance = shift ? 10 : 1;
  return moveCommand(doc, measurer, ids, step[0] * distance, step[1] * distance);
}

/** The handles to draw: eight for a lone shape, east and west for a lone text box, none otherwise or when locked. */
export function handlesFor(doc: DiagramDocument, measurer: TextMeasurer, selection: string[]): { handle: Handle; x: number; y: number }[] {
  const [id] = selection;
  const box = selection.length === 1 && id !== undefined ? transformable(doc, measurer, id) : undefined;
  if (!box) return [];
  const handles = box.element.kind === "text" ? TEXT_HANDLES : ALL_HANDLES;
  return handles.map((handle) => ({
    handle,
    x: handle.includes("w") ? box.x : handle.includes("e") ? box.x + box.w : box.x + box.w / 2,
    y: handle.includes("n") ? box.y : handle.includes("s") ? box.y + box.h : box.y + box.h / 2,
  }));
}

/**
 * Resizes one element by dragging `handle` by (dx, dy). The edge opposite the handle stays put and
 * the size stops at `MIN_SIZE`. An element with no w and h starts from its default size and gets
 * both written. A text box takes width only (its height follows its content). With a `grid` size
 * the dragged edges land on the grid.
 */
export function resizeCommand(doc: DiagramDocument, measurer: TextMeasurer, id: string, handle: Handle, dx: number, dy: number, grid = 0): Command | null {
  const box = transformable(doc, measurer, id);
  if (!box) return null;
  const text = box.element.kind === "text";
  if (text && !TEXT_HANDLES.includes(handle)) return null;

  const moveW = handle.includes("w");
  const moveE = handle.includes("e");
  const moveN = !text && handle.includes("n");
  const moveS = !text && handle.includes("s");
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  const edge = (v: number, moving: boolean, delta: number): number => (moving ? snapTo(Math.round(v + delta), grid) : v);
  let x0 = edge(box.x, moveW, dx);
  let x1 = edge(right, moveE, dx);
  let y0 = edge(box.y, moveN, dy);
  let y1 = edge(bottom, moveS, dy);
  if (x1 - x0 < MIN_SIZE) {
    if (moveW) x0 = x1 - MIN_SIZE;
    else x1 = x0 + MIN_SIZE;
  }
  if (y1 - y0 < MIN_SIZE) {
    if (moveN) y0 = y1 - MIN_SIZE;
    else y1 = y0 + MIN_SIZE;
  }
  if (x0 === box.x && x1 === right && y0 === box.y && y1 === bottom) return null;
  const set = text ? { x: x0, y: y0, w: x1 - x0 } : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  return { type: "setLayout", changes: [{ id, set }] };
}

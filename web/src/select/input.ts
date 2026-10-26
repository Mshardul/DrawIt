// Pointer and key input for selection: click, shift/Cmd/Ctrl-click, drag-box, select all, clear.
// The selection lives in the open file's history (so undo restores it); this module only changes it.
import type { Box } from "../render/boxes.ts";
import { screenToWorld, type View } from "../view/view.ts";
import type { OpenFile } from "../app/workspace.ts";
import { clickSelection, hitTest, idsInRect, selectAll } from "./select.ts";

/** Pointer travel (screen px) before a press on empty canvas becomes a drag-box. */
const DRAG_THRESHOLD = 3;

export interface SelectInputHost {
  target: SVGSVGElement;
  getView(): View;
  getFile(): OpenFile | null;
  /** The drag-box in world coordinates, or null when none is shown. */
  setMarquee(box: Box | null): void;
  /** Redraw after the selection changed. */
  refresh(): void;
}

const sameIds = (a: string[], b: string[]): boolean => a.length === b.length && a.every((id, i) => id === b[i]);

/** Wires selection input to `host`. Returns a function that removes it. */
export function attachSelectInput(host: SelectInputHost): () => void {
  const { target } = host;
  let press: { pointer: number; start: { x: number; y: number }; hit: string | null; base: string[]; additive: boolean; box: boolean; dragged: boolean } | null = null;

  // Read once per press: reading it on every move would force a layout of the whole canvas.
  let box: DOMRect = target.getBoundingClientRect();
  const world = (event: { clientX: number; clientY: number }): { x: number; y: number } =>
    screenToWorld(host.getView(), { x: event.clientX - box.left, y: event.clientY - box.top });
  const select = (file: OpenFile, ids: string[]): void => {
    if (sameIds(file.history.selection, ids)) return;
    file.history.selection = ids;
    host.refresh();
  };

  const onPointerDown = (event: PointerEvent): void => {
    const file = host.getFile();
    if (event.button !== 0 || !file) return;
    // A press on a resize handle belongs to the transform input, not to selection.
    if (event.target instanceof Element && event.target.closest("[data-handle]")) return;
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    box = target.getBoundingClientRect();
    const p = world(event);
    const hit = hitTest(file.document, p);
    target.setPointerCapture(event.pointerId);
    press = { pointer: event.pointerId, start: p, hit, base: file.history.selection, additive, box: false, dragged: false };
    select(file, clickSelection(file.history.selection, hit, additive));
  };
  const onPointerMove = (event: PointerEvent): void => {
    const file = host.getFile();
    if (!press || press.pointer !== event.pointerId || !file) return;
    const p = world(event);
    const { scale } = host.getView();
    if (!press.dragged && Math.hypot(p.x - press.start.x, p.y - press.start.y) * scale < DRAG_THRESHOLD) return;
    press.dragged = true;
    // A press that began on an element is the start of a move (T-015), not of a drag-box.
    if (!press.box && hitTest(file.document, press.start) !== null) return;
    press.box = true;
    const dragBox = { x: press.start.x, y: press.start.y, w: p.x - press.start.x, h: p.y - press.start.y };
    const inside = idsInRect(file.document, dragBox);
    select(file, press.additive ? [...press.base, ...inside.filter((id) => !press?.base.includes(id))] : inside);
    host.setMarquee(dragBox);
    host.refresh();
  };
  const onPointerEnd = (event: PointerEvent): void => {
    if (press?.pointer !== event.pointerId) return;
    const file = host.getFile();
    // A click that did not drag, on one of several selected elements, narrows the selection to it.
    if (file && !press.dragged && press.hit !== null && !press.additive) select(file, [press.hit]);
    press = null;
    host.setMarquee(null);
    host.refresh();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const file = host.getFile();
    const t = event.target;
    if (!file || t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      select(file, selectAll(file.document));
    } else if (event.key === "Escape") {
      select(file, []);
    }
  };

  target.addEventListener("pointerdown", onPointerDown);
  target.addEventListener("pointermove", onPointerMove);
  target.addEventListener("pointerup", onPointerEnd);
  target.addEventListener("pointercancel", onPointerEnd);
  addEventListener("keydown", onKeyDown);
  return () => {
    target.removeEventListener("pointerdown", onPointerDown);
    target.removeEventListener("pointermove", onPointerMove);
    target.removeEventListener("pointerup", onPointerEnd);
    target.removeEventListener("pointercancel", onPointerEnd);
    removeEventListener("keydown", onKeyDown);
  };
}

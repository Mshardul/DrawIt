// Pointer and key input for move and resize: drag a selected element or a handle, arrow-key nudge.
// A drag previews on a copy of the document (the fast path: only transforms and sizes change on
// screen) and commits one command on release, so it is one undo step (spec 5.2, decision A3).
import { applyCommand, type Command } from "../commands/command.ts";
import type { OpenFile } from "../app/workspace.ts";
import type { DiagramDocument } from "../model/index.ts";
import { hitTest } from "../select/select.ts";
import { screenToWorld, type Pt, type View } from "../view/view.ts";
import { type Handle, moveCommand, nudgeCommand, resizeCommand } from "./transform.ts";

/** Pointer travel (screen px) before a press becomes a drag. */
const DRAG_THRESHOLD = 3;

export interface TransformInputHost {
  target: SVGSVGElement;
  getView(): View;
  getFile(): OpenFile | null;
  /** Grid size to snap drags to, or 0 when snap is off. */
  getGrid(): number;
  /** Draws this document instead of the file's until set back to null. */
  setPreview(doc: DiagramDocument | null): void;
  /** Redraws the canvas only; used on every pointer move. `changed` lists the IDs whose drawing differs from the last draw. */
  redraw(changed?: ReadonlySet<string>): void;
  /** Redraws everything including the unsaved indicator; used after a commit. */
  refresh(): void;
}

interface Drag {
  pointer: number;
  /** Press position in world coordinates and screen px. */
  world: Pt;
  screen: Pt;
  action: { kind: "move" } | { kind: "resize"; id: string; handle: Handle };
  active: boolean;
}

/** Every ID a command touches, so a preview redraws only those. */
function changedIds(command: Command | null): ReadonlySet<string> {
  return new Set(command?.type === "setLayout" ? command.changes.map((c) => c.id) : []);
}

const isHandle = (value: string | undefined): value is Handle =>
  value !== undefined && ["n", "ne", "e", "se", "s", "sw", "w", "nw"].includes(value);

/** Wires move, resize and nudge input to `host`. Returns a function that removes it. */
export function attachTransformInput(host: TransformInputHost): () => void {
  const { target } = host;
  let drag: Drag | null = null;
  /** IDs the last preview frame changed. */
  let drawn: ReadonlySet<string> = new Set();

  // The canvas box is read once per press: reading it on every move would force a layout of the
  // whole canvas after each redraw.
  let box: DOMRect = target.getBoundingClientRect();
  const world = (event: { clientX: number; clientY: number }): Pt =>
    screenToWorld(host.getView(), { x: event.clientX - box.left, y: event.clientY - box.top });
  // Holding Alt (Option) bypasses snap for that event.
  const commandFor = (file: OpenFile, d: Drag, now: Pt, bypass: boolean): Command | null => {
    const grid = bypass ? 0 : host.getGrid();
    const dx = now.x - d.world.x;
    const dy = now.y - d.world.y;
    return d.action.kind === "move"
      ? moveCommand(file.document, file.history.selection, dx, dy, grid)
      : resizeCommand(file.document, d.action.id, d.action.handle, dx, dy, grid);
  };
  const cancel = (): void => {
    if (!drag) return;
    const wasActive = drag.active;
    drag = null;
    drawn = new Set();
    host.setPreview(null);
    if (wasActive) host.redraw();
  };

  const onPointerDown = (event: PointerEvent): void => {
    const file = host.getFile();
    if (event.button !== 0 || !file) return;
    box = target.getBoundingClientRect();
    const p = world(event);
    const base = { pointer: event.pointerId, world: p, screen: { x: event.clientX, y: event.clientY }, active: false };
    const handle = event.target instanceof Element ? event.target.closest("[data-handle]") : null;
    const [only] = file.history.selection;
    const handleName = handle?.getAttribute("data-handle") ?? undefined;
    if (isHandle(handleName) && only !== undefined) {
      target.setPointerCapture(event.pointerId);
      drag = { ...base, action: { kind: "resize", id: only, handle: handleName } };
      return;
    }
    if (event.shiftKey || event.metaKey || event.ctrlKey) return;
    const hit = hitTest(file.document, p);
    if (hit !== null && file.history.selection.includes(hit)) drag = { ...base, action: { kind: "move" } };
  };
  const onPointerMove = (event: PointerEvent): void => {
    const file = host.getFile();
    if (!drag || drag.pointer !== event.pointerId || !file) return;
    if (!drag.active && Math.hypot(event.clientX - drag.screen.x, event.clientY - drag.screen.y) < DRAG_THRESHOLD) return;
    drag.active = true;
    const command = commandFor(file, drag, world(event), event.altKey);
    host.setPreview(command ? applyCommand(file.document, command).document : null);
    // Redraw what changed this frame and what the previous frame changed (it may have snapped back).
    const now = changedIds(command);
    host.redraw(new Set([...drawn, ...now]));
    drawn = now;
  };
  const onPointerUp = (event: PointerEvent): void => {
    const file = host.getFile();
    if (!drag || drag.pointer !== event.pointerId) return;
    const d = drag;
    drag = null;
    drawn = new Set();
    host.setPreview(null);
    const command = file && d.active ? commandFor(file, d, world(event), event.altKey) : null;
    if (file && command) file.history.execute(command);
    host.refresh();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const file = host.getFile();
    const t = event.target;
    if (!file || t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
    if (event.key === "Escape") {
      cancel();
      return;
    }
    if (drag || event.metaKey || event.ctrlKey || event.altKey) return;
    const { selection } = file.history;
    const command = nudgeCommand(file.document, selection, event.key, event.shiftKey);
    if (!command) return;
    event.preventDefault();
    // Held or repeated nudges of the same selection are one undo step.
    file.history.execute(command, { group: `nudge:${selection.join(",")}` });
    host.refresh();
  };

  target.addEventListener("pointerdown", onPointerDown);
  target.addEventListener("pointermove", onPointerMove);
  target.addEventListener("pointerup", onPointerUp);
  target.addEventListener("pointercancel", cancel);
  addEventListener("keydown", onKeyDown);
  return () => {
    target.removeEventListener("pointerdown", onPointerDown);
    target.removeEventListener("pointermove", onPointerMove);
    target.removeEventListener("pointerup", onPointerUp);
    target.removeEventListener("pointercancel", cancel);
    removeEventListener("keydown", onKeyDown);
  };
}

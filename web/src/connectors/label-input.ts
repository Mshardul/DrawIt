// Pointer and key input for dragging the label of the selected edge along its path. The drag
// previews on a copy of the document and commits one command on release.
import { applyCommand } from "../commands/command.ts";
import type { OpenFile } from "../app/workspace.ts";
import type { DiagramDocument, Point } from "../model/index.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { screenToWorld, type View } from "../view/view.ts";
import type { Tool } from "./input.ts";
import { labelDragCommand } from "./label.ts";

/** Pointer travel (screen px) before a press becomes a drag. */
const DRAG_THRESHOLD = 3;

export interface LabelInputHost {
  target: SVGSVGElement;
  getView(): View;
  getFile(): OpenFile | null;
  measurer: TextMeasurer;
  /** Dragging a label works only while the select tool is current. */
  getTool(): Tool;
  /** Draws this document instead of the file's until set back to null. */
  setPreview(doc: DiagramDocument | null): void;
  /** Redraws the canvas only; used on every pointer move. `changed` lists the IDs whose drawing differs from the last draw. */
  redraw(changed?: ReadonlySet<string>): void;
  /** Redraws everything including the unsaved indicator; used after a commit. */
  refresh(): void;
}

interface Drag {
  pointer: number;
  edge: string;
  screen: Point;
  active: boolean;
}

/** Wires label dragging to `host`. Returns a function that removes it. */
export function attachLabelInput(host: LabelInputHost): () => void {
  const { target } = host;
  let drag: Drag | null = null;

  // Read once per press: reading it on every move would force a layout of the whole canvas.
  let box: DOMRect = target.getBoundingClientRect();
  const world = (event: { clientX: number; clientY: number }): Point =>
    screenToWorld(host.getView(), { x: event.clientX - box.left, y: event.clientY - box.top });
  const commandFor = (file: OpenFile, d: Drag, event: PointerEvent) => labelDragCommand(file.document, host.measurer, d.edge, world(event));
  const cancel = (): void => {
    if (!drag) return;
    const { edge, active } = drag;
    drag = null;
    host.setPreview(null);
    if (active) host.redraw(new Set([edge]));
  };

  const onPointerDown = (event: PointerEvent): void => {
    const file = host.getFile();
    if (event.button !== 0 || !file || host.getTool() !== "select") return;
    if (!(event.target instanceof Element) || !event.target.closest("[data-label]")) return;
    const [edge] = file.history.selection;
    if (edge === undefined) return;
    box = target.getBoundingClientRect();
    target.setPointerCapture(event.pointerId);
    drag = { pointer: event.pointerId, edge, screen: { x: event.clientX, y: event.clientY }, active: false };
  };
  const onPointerMove = (event: PointerEvent): void => {
    const file = host.getFile();
    if (!drag || drag.pointer !== event.pointerId || !file) return;
    if (!drag.active && Math.hypot(event.clientX - drag.screen.x, event.clientY - drag.screen.y) < DRAG_THRESHOLD) return;
    drag.active = true;
    const command = commandFor(file, drag, event);
    host.setPreview(command ? applyCommand(file.document, command).document : null);
    host.redraw(new Set([drag.edge]));
  };
  const onPointerUp = (event: PointerEvent): void => {
    const file = host.getFile();
    if (!drag || drag.pointer !== event.pointerId) return;
    const d = drag;
    drag = null;
    host.setPreview(null);
    const command = file && d.active ? commandFor(file, d, event) : null;
    if (file && command) file.history.execute(command);
    host.refresh();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") cancel();
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

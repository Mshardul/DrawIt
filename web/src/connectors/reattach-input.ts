// Pointer and key input for re-attaching an edge end: drag an end handle of the selected edge. The
// drag previews on a copy of the document and commits one command on release.
import { applyCommand } from "../commands/command.ts";
import type { OpenFile } from "../app/workspace.ts";
import type { DiagramDocument, Point } from "../model/index.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { screenToWorld, type View } from "../view/view.ts";
import type { Tool } from "./input.ts";
import { reattachCommand } from "./reattach.ts";

/** Pointer travel (screen px) before a press becomes a drag. */
const DRAG_THRESHOLD = 3;

export interface ReattachInputHost {
  target: SVGSVGElement;
  getView(): View;
  getFile(): OpenFile | null;
  measurer: TextMeasurer;
  /** Dragging an end works only while the select tool is current. */
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
  end: "from" | "to";
  screen: Point;
  active: boolean;
}

/** Wires end-handle dragging to `host`. Returns a function that removes it. */
export function attachReattachInput(host: ReattachInputHost): () => void {
  const { target } = host;
  let drag: Drag | null = null;

  // Read once per press: reading it on every move would force a layout of the whole canvas.
  let box: DOMRect = target.getBoundingClientRect();
  const world = (event: { clientX: number; clientY: number }): Point =>
    screenToWorld(host.getView(), { x: event.clientX - box.left, y: event.clientY - box.top });
  const commandFor = (file: OpenFile, d: Drag, event: PointerEvent) =>
    reattachCommand(file.document, host.measurer, d.edge, d.end, world(event));
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
    const handle = event.target instanceof Element ? event.target.closest("[data-end]") : null;
    const end = handle?.getAttribute("data-end");
    const [edge] = file.history.selection;
    if ((end !== "from" && end !== "to") || edge === undefined) return;
    box = target.getBoundingClientRect();
    target.setPointerCapture(event.pointerId);
    drag = { pointer: event.pointerId, edge, end, screen: { x: event.clientX, y: event.clientY }, active: false };
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

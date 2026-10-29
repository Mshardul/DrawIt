// Pointer and key input for bend points of the selected edge: Alt-click its path to add one,
// drag a bend handle to move it, Alt-click a bend handle to remove it. A drag previews on a copy
// of the document and commits one command on release.
import { applyCommand, type Command } from "../commands/command.ts";
import type { OpenFile } from "../app/workspace.ts";
import type { DiagramDocument, Point } from "../model/index.ts";
import { EDGE_REACH_PX } from "../select/select.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { screenToWorld, type View } from "../view/view.ts";
import { addBendCommand, moveBendCommand, removeBendCommand } from "./bend.ts";
import { routedEdges } from "./edges.ts";
import type { Tool } from "./input.ts";
import { nearestOnPath } from "./path.ts";

/** Pointer travel (screen px) before a press becomes a drag. */
const DRAG_THRESHOLD = 3;

export interface BendInputHost {
  target: SVGSVGElement;
  getView(): View;
  getFile(): OpenFile | null;
  measurer: TextMeasurer;
  /** Editing bend points works only while the select tool is current. */
  getTool(): Tool;
  /** Draws this document instead of the file's until set back to null. */
  setPreview(doc: DiagramDocument | null): void;
  /** Redraws the canvas only; used on every pointer move. `changed` lists the IDs whose drawing differs from the last draw. */
  redraw(changed?: ReadonlySet<string>): void;
  /** Redraws everything including the unsaved indicator; used after a commit. */
  refresh(): void;
}

/** What the press in progress will do if the pointer does not travel. */
type Press =
  | { kind: "add"; at: Point }
  | { kind: "remove"; index: number }
  | { kind: "move"; index: number };

interface Drag {
  pointer: number;
  edge: string;
  press: Press;
  screen: Point;
  active: boolean;
}

/** Wires bend-point input to `host`. Returns a function that removes it. */
export function attachBendInput(host: BendInputHost): () => void {
  const { target } = host;
  let drag: Drag | null = null;

  // Read once per press: reading it on every move would force a layout of the whole canvas.
  let box: DOMRect = target.getBoundingClientRect();
  const world = (event: { clientX: number; clientY: number }): Point =>
    screenToWorld(host.getView(), { x: event.clientX - box.left, y: event.clientY - box.top });
  const commandFor = (file: OpenFile, d: Drag, event: PointerEvent): Command | null => {
    switch (d.press.kind) {
      case "move":
        return moveBendCommand(file.document, d.edge, d.press.index, world(event));
      case "remove":
        return removeBendCommand(file.document, d.edge, d.press.index);
      case "add":
        return addBendCommand(file.document, host.measurer, d.edge, d.press.at)?.command ?? null;
    }
  };
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
    const [edge, ...others] = file.history.selection;
    if (edge === undefined || others.length > 0 || file.document.elements.find((e) => e.id === edge)?.kind !== "edge") return;
    const at = event.target instanceof Element ? event.target : null;
    const base = { pointer: event.pointerId, edge, screen: { x: event.clientX, y: event.clientY }, active: false };
    const index = Number(at?.closest("[data-bend]")?.getAttribute("data-bend"));
    box = target.getBoundingClientRect();
    if (Number.isInteger(index)) {
      drag = { ...base, press: { kind: event.altKey ? "remove" : "move", index } };
    } else if (event.altKey && !at?.closest("[data-handle], [data-end]")) {
      const p = world(event);
      const points = routedEdges(file.document, host.measurer, new Set([edge])).get(edge)?.points ?? [];
      const near = nearestOnPath(points, p);
      if (!near || near.distance * host.getView().scale > EDGE_REACH_PX) return;
      drag = { ...base, press: { kind: "add", at: p } };
    } else return;
    target.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent): void => {
    const file = host.getFile();
    if (!drag || drag.pointer !== event.pointerId || !file) return;
    if (!drag.active && Math.hypot(event.clientX - drag.screen.x, event.clientY - drag.screen.y) < DRAG_THRESHOLD) return;
    // Moving after an Alt press is not a click: the press is left to the move of the edge.
    if (drag.press.kind !== "move") {
      cancel();
      return;
    }
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
    const command = file && (d.press.kind === "move" ? d.active : true) ? commandFor(file, d, event) : null;
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

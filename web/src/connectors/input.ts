// Pointer and key input for the line tool: press on a shape or on empty canvas, drag, release on a
// shape or a free point. The edge is added as one command on release. The tool lasts for one edge.
import type { OpenFile } from "../app/workspace.ts";
import type { Point } from "../model/index.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { screenToWorld, type View } from "../view/view.ts";
import { draftPath, type DrawEnd, drawEndAt, newEdgeCommand } from "./draw.ts";

/** What a press on the canvas does. */
export type Tool = "select" | "edge" | "shape";

/** Pointer travel (screen px) before a press becomes a drag. */
const DRAG_THRESHOLD = 3;

export interface EdgeInputHost {
  target: SVGSVGElement;
  getView(): View;
  getFile(): OpenFile | null;
  measurer: TextMeasurer;
  getTool(): Tool;
  setTool(tool: Tool): void;
  /** The line being dragged out, or null when there is none. */
  setDraft(path: Point[] | null): void;
  /** Redraws the overlay only; used on every pointer move. */
  redrawOverlay(): void;
  /** Redraws everything including the unsaved indicator; used after a commit. */
  refresh(): void;
}

interface Press {
  pointer: number;
  from: DrawEnd;
  screen: Point;
  active: boolean;
}

/** Wires the line tool to `host`. Returns a function that removes it. */
export function attachEdgeInput(host: EdgeInputHost): () => void {
  const { target } = host;
  let press: Press | null = null;
  // Read once per press: reading it on every move would force a layout of the whole canvas.
  let box: DOMRect = target.getBoundingClientRect();
  const world = (event: { clientX: number; clientY: number }): Point =>
    screenToWorld(host.getView(), { x: event.clientX - box.left, y: event.clientY - box.top });

  const end = (): void => {
    press = null;
    host.setDraft(null);
    host.redrawOverlay();
  };

  const onPointerDown = (event: PointerEvent): void => {
    const file = host.getFile();
    if (host.getTool() !== "edge" || event.button !== 0 || !file) return;
    box = target.getBoundingClientRect();
    target.setPointerCapture(event.pointerId);
    press = { pointer: event.pointerId, from: drawEndAt(file.document, host.measurer, world(event)), screen: { x: event.clientX, y: event.clientY }, active: false };
  };
  const onPointerMove = (event: PointerEvent): void => {
    const file = host.getFile();
    if (!press || press.pointer !== event.pointerId || !file) return;
    if (!press.active && Math.hypot(event.clientX - press.screen.x, event.clientY - press.screen.y) < DRAG_THRESHOLD) return;
    press.active = true;
    host.setDraft(draftPath(file.document, host.measurer, press.from, drawEndAt(file.document, host.measurer, world(event))));
    host.redrawOverlay();
  };
  const onPointerUp = (event: PointerEvent): void => {
    const file = host.getFile();
    if (!press || press.pointer !== event.pointerId) return;
    const { from, active } = press;
    end();
    const made = file && active ? newEdgeCommand(file.document, from, drawEndAt(file.document, host.measurer, world(event))) : null;
    if (!file || !made) return;
    file.history.execute(made.command, { selection: [made.id] });
    host.setTool("select");
    host.refresh();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const t = event.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
    if (event.key === "Escape") {
      if (press) end();
      else if (host.getTool() === "edge") host.setTool("select");
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || press) return;
    if (event.key === "l") host.setTool("edge");
    else if (event.key === "v") host.setTool("select");
  };

  target.addEventListener("pointerdown", onPointerDown);
  target.addEventListener("pointermove", onPointerMove);
  target.addEventListener("pointerup", onPointerUp);
  target.addEventListener("pointercancel", end);
  addEventListener("keydown", onKeyDown);
  return () => {
    target.removeEventListener("pointerdown", onPointerDown);
    target.removeEventListener("pointermove", onPointerMove);
    target.removeEventListener("pointerup", onPointerUp);
    target.removeEventListener("pointercancel", end);
    removeEventListener("keydown", onKeyDown);
  };
}

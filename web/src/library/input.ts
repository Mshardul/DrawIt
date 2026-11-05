// Pointer and key input for the tools that place an element: a click on the canvas places it at its
// default size, a drag sizes it. The element is added as one command on release. A tool lasts for
// one element.
import type { OpenFile } from "../app/workspace.ts";
import type { Tool } from "../app/tool.ts";
import type { Point } from "../model/index.ts";
import type { Box } from "../render/boxes.ts";
import { screenToWorld, type View } from "../view/view.ts";
import type { Command } from "../commands/command.ts";
import type { DiagramDocument } from "../model/index.ts";

/** Pointer travel (screen px) before a press becomes a drag. */
const DRAG_THRESHOLD = 3;

export interface PlaceInputHost {
  target: SVGSVGElement;
  /** The tool this input serves. */
  tool: Tool;
  /** A key that arms the tool, or undefined for a tool the sidebar arms. */
  key?: string;
  getView(): View;
  getFile(): OpenFile | null;
  getTool(): Tool;
  setTool(tool: Tool): void;
  /** Whether there is something to place; a press does nothing otherwise. */
  isArmed(): boolean;
  /** The command that places the element for a click (`to` is null) or a drag, and its ID. */
  place(doc: DiagramDocument, from: Point, to: Point | null, grid: number): { command: Command; id: string };
  /** Called after the element was added and the tool went back to select. */
  placed?(id: string): void;
  /** Grid size to snap to, or 0 when snap is off. */
  getGrid(): number;
  /** The box being dragged out, or null when there is none. */
  setDraft(box: Box | null): void;
  /** Redraws the overlay only; used on every pointer move. */
  redrawOverlay(): void;
  /** Redraws everything including the unsaved indicator; used after a commit. */
  refresh(): void;
}

interface Press {
  pointer: number;
  from: Point;
  screen: Point;
  active: boolean;
}

/** Wires a placing tool to `host`. Returns a function that removes it. */
export function attachPlaceInput(host: PlaceInputHost): () => void {
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
    if (host.getTool() !== host.tool || event.button !== 0 || !host.getFile() || !host.isArmed()) return;
    box = target.getBoundingClientRect();
    target.setPointerCapture(event.pointerId);
    press = { pointer: event.pointerId, from: world(event), screen: { x: event.clientX, y: event.clientY }, active: false };
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (!press || press.pointer !== event.pointerId) return;
    if (!press.active && Math.hypot(event.clientX - press.screen.x, event.clientY - press.screen.y) < DRAG_THRESHOLD) return;
    press.active = true;
    const to = world(event);
    host.setDraft({ x: Math.min(press.from.x, to.x), y: Math.min(press.from.y, to.y), w: Math.abs(to.x - press.from.x), h: Math.abs(to.y - press.from.y) });
    host.redrawOverlay();
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (!press || press.pointer !== event.pointerId) return;
    const { from, active } = press;
    end();
    const file = host.getFile();
    if (!file || !host.isArmed()) return;
    // Alt (Option) bypasses snap for that event.
    const made = host.place(file.document, from, active ? world(event) : null, event.altKey ? 0 : host.getGrid());
    file.history.execute(made.command, { selection: [made.id] });
    host.setTool("select");
    host.refresh();
    host.placed?.(made.id);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const t = event.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
    if (event.key === "Escape") {
      if (press) end();
      else if (host.getTool() === host.tool) host.setTool("select");
    } else if (host.key !== undefined && event.key === host.key && !event.metaKey && !event.ctrlKey && !event.altKey && !press) {
      host.setTool(host.tool);
    }
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

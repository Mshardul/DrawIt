// Maps wheel and key input to a new view. The pure functions are tested as data;
// `attachViewInput` wires them and space-drag and middle-drag pan to an element.
import type { Box } from "../render/boxes.ts";
import { panBy, type Pt, type View, zoomAt, zoomToFit } from "./view.ts";

export const ZOOM_STEP = 1.25;
const FIT_MARGIN = 48;
/** Zoom per wheel delta unit for a pinch: a trackpad pinch reports small deltas, a mouse wheel notch about 100. */
const PINCH_RATE = 0.01;

export interface WheelInput {
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  /** Cursor in svg-local screen px. */
  x: number;
  y: number;
}

/** Plain wheel pans; ctrl plus wheel (also what a trackpad pinch sends) zooms about the cursor. */
export function wheelView(view: View, wheel: WheelInput): View {
  if (wheel.ctrlKey) return zoomAt(view, { x: wheel.x, y: wheel.y }, Math.exp(-wheel.deltaY * PINCH_RATE));
  return panBy(view, -wheel.deltaX, -wheel.deltaY);
}

export interface KeyInput {
  key: string;
  /** Physical key, used for the digit under Shift. */
  code?: string;
  /** Cmd on macOS, Ctrl elsewhere. */
  mod: boolean;
  shift: boolean;
}

/** The view after a zoom key, or null when the key is not one. */
export function keyView(view: View, key: KeyInput, viewport: { w: number; h: number }, bounds: Box | null): View | null {
  const centre: Pt = { x: viewport.w / 2, y: viewport.h / 2 };
  if (key.mod && (key.key === "=" || key.key === "+")) return zoomAt(view, centre, ZOOM_STEP);
  if (key.mod && key.key === "-") return zoomAt(view, centre, 1 / ZOOM_STEP);
  if (key.mod && key.key === "0") return zoomAt(view, centre, 1 / view.scale);
  if (!key.mod && key.shift && (key.code === "Digit1" || key.key === "1")) return zoomToFit(bounds, viewport, FIT_MARGIN);
  return null;
}

export interface ViewInputHost {
  /** The element that receives input; its box is the viewport. */
  target: SVGSVGElement;
  getView(): View;
  setView(view: View): void;
  getBounds(): Box | null;
}

const isTyping = (event: Event): boolean => {
  const t = event.target;
  return t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;
};

/** Wires wheel, zoom keys, space-drag and middle-drag to `host`. Returns a function that removes them. */
export function attachViewInput(host: ViewInputHost): () => void {
  const { target } = host;
  let spaceDown = false;
  let panning: { pointer: number; x: number; y: number } | null = null;

  const local = (event: { clientX: number; clientY: number }): Pt => {
    const r = target.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  };
  const viewport = (): { w: number; h: number } => {
    const r = target.getBoundingClientRect();
    return { w: r.width, h: r.height };
  };

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    // Line-mode wheels (some mice) report lines, not px.
    const unit = event.deltaMode === 1 ? 16 : 1;
    host.setView(
      wheelView(host.getView(), {
        deltaX: event.deltaX * unit,
        deltaY: event.deltaY * unit,
        ctrlKey: event.ctrlKey,
        ...local(event),
      }),
    );
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (isTyping(event)) return;
    if (event.code === "Space") {
      spaceDown = true;
      if (event.target === document.body || event.target === target) event.preventDefault();
      return;
    }
    const next = keyView(
      host.getView(),
      { key: event.key, code: event.code, mod: event.metaKey || event.ctrlKey, shift: event.shiftKey },
      viewport(),
      host.getBounds(),
    );
    if (next) {
      event.preventDefault();
      host.setView(next);
    }
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === "Space") spaceDown = false;
  };
  const onPointerDown = (event: PointerEvent): void => {
    if (!(event.button === 1 || (event.button === 0 && spaceDown))) return;
    event.preventDefault();
    // Selection listens on the same element; a pan gesture is not a click on the canvas.
    event.stopImmediatePropagation();
    target.setPointerCapture(event.pointerId);
    panning = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
    target.classList.add("panning");
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (!panning || panning.pointer !== event.pointerId) return;
    host.setView(panBy(host.getView(), event.clientX - panning.x, event.clientY - panning.y));
    panning = { ...panning, x: event.clientX, y: event.clientY };
  };
  const onPointerEnd = (event: PointerEvent): void => {
    if (panning?.pointer !== event.pointerId) return;
    panning = null;
    target.classList.remove("panning");
  };

  // Capture phase on the target so a pan gesture runs before tools attached later.
  target.addEventListener("wheel", onWheel, { passive: false });
  target.addEventListener("pointerdown", onPointerDown, { capture: true });
  target.addEventListener("pointermove", onPointerMove);
  target.addEventListener("pointerup", onPointerEnd);
  target.addEventListener("pointercancel", onPointerEnd);
  addEventListener("keydown", onKeyDown);
  addEventListener("keyup", onKeyUp);
  return () => {
    target.removeEventListener("wheel", onWheel);
    target.removeEventListener("pointerdown", onPointerDown, { capture: true });
    target.removeEventListener("pointermove", onPointerMove);
    target.removeEventListener("pointerup", onPointerEnd);
    target.removeEventListener("pointercancel", onPointerEnd);
    removeEventListener("keydown", onKeyDown);
    removeEventListener("keyup", onKeyUp);
  };
}

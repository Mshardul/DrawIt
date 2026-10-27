import { describe, expect, it } from "vitest";
import { keyView, wheelView } from "./input.ts";
import { IDENTITY, screenToWorld } from "./view.ts";

const viewport = { w: 1000, h: 600 };

describe("view input mapping", () => {
  it("a plain wheel or trackpad scroll pans the canvas opposite the scroll", () => {
    const view = wheelView(IDENTITY, { deltaX: 10, deltaY: 30, ctrlKey: false, x: 0, y: 0 });
    expect(view).toEqual({ x: -10, y: -30, scale: 1 });
  });

  it("ctrl plus wheel (a trackpad pinch) zooms about the cursor", () => {
    const at = { x: 300, y: 200 };
    const before = screenToWorld(IDENTITY, at);
    const view = wheelView(IDENTITY, { deltaX: 0, deltaY: -10, ctrlKey: true, x: at.x, y: at.y });
    expect(view.scale).toBeGreaterThan(1);
    const after = screenToWorld(view, at);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("scrolling the pinch the other way zooms out", () => {
    expect(wheelView(IDENTITY, { deltaX: 0, deltaY: 10, ctrlKey: true, x: 0, y: 0 }).scale).toBeLessThan(1);
  });

  it("Cmd or Ctrl plus = and - zoom by 1.25x about the viewport centre", () => {
    const zoomedIn = keyView(IDENTITY, { key: "=", mod: true, shift: false }, viewport, null);
    expect(zoomedIn?.scale).toBeCloseTo(1.25);
    expect(screenToWorld(zoomedIn ?? IDENTITY, { x: 500, y: 300 })).toEqual({ x: 500, y: 300 });
    expect(keyView(IDENTITY, { key: "+", mod: true, shift: true }, viewport, null)?.scale).toBeCloseTo(1.25);
    expect(keyView(IDENTITY, { key: "-", mod: true, shift: false }, viewport, null)?.scale).toBeCloseTo(0.8);
  });

  it("Cmd or Ctrl plus 0 resets to 100% about the viewport centre", () => {
    const view = keyView({ x: 40, y: 40, scale: 3 }, { key: "0", mod: true, shift: false }, viewport, null);
    expect(view?.scale).toBe(1);
    const before = screenToWorld({ x: 40, y: 40, scale: 3 }, { x: 500, y: 300 });
    const after = screenToWorld(view ?? IDENTITY, { x: 500, y: 300 });
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("Shift plus 1 zooms to fit the bounds", () => {
    const view = keyView(IDENTITY, { key: "!", code: "Digit1", mod: false, shift: true }, viewport, { x: 0, y: 0, w: 2000, h: 1000 });
    expect(view?.scale).toBeCloseTo(0.45);
  });

  it("other keys are not view keys", () => {
    expect(keyView(IDENTITY, { key: "a", mod: false, shift: false }, viewport, null)).toBeNull();
    expect(keyView(IDENTITY, { key: "-", mod: false, shift: false }, viewport, null)).toBeNull();
  });
});

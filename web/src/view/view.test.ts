import { describe, expect, it } from "vitest";
import type { DiagramDocument } from "../model/index.ts";
import {
  documentBounds,
  IDENTITY,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  screenToWorld,
  viewTransform,
  worldToScreen,
  zoomAt,
  zoomToFit,
} from "./view.ts";
import { monoMeasurer } from "../testing/measurer.ts";

const doc = (layout: DiagramDocument["layout"], elements: DiagramDocument["elements"]): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements,
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout,
});

describe("view transform", () => {
  it("converts between screen and world and back", () => {
    const view = { x: 30, y: -10, scale: 2 };
    expect(worldToScreen(view, { x: 10, y: 10 })).toEqual({ x: 50, y: 10 });
    expect(screenToWorld(view, { x: 50, y: 10 })).toEqual({ x: 10, y: 10 });
  });

  it("writes the transform attribute of the world group", () => {
    expect(viewTransform({ x: 30, y: -10, scale: 2 })).toBe("translate(30 -10) scale(2)");
    expect(viewTransform(IDENTITY)).toBe("translate(0 0) scale(1)");
  });

  it("panning moves the view by the screen delta", () => {
    expect(panBy(IDENTITY, 5, -7)).toEqual({ x: 5, y: -7, scale: 1 });
  });

  it("zooming keeps the world point under the cursor fixed", () => {
    const view = { x: 40, y: 20, scale: 1 };
    const at = { x: 200, y: 100 };
    const before = screenToWorld(view, at);
    const zoomed = zoomAt(view, at, 2);
    expect(zoomed.scale).toBe(2);
    const after = screenToWorld(zoomed, at);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("zoom is clamped to 10% and 800%", () => {
    expect(zoomAt(IDENTITY, { x: 0, y: 0 }, 1000).scale).toBe(MAX_SCALE);
    expect(zoomAt(IDENTITY, { x: 0, y: 0 }, 0.0001).scale).toBe(MIN_SCALE);
    expect(MIN_SCALE).toBe(0.1);
    expect(MAX_SCALE).toBe(8);
  });

  it("bounds cover drawn elements only, using default sizes where layout has none", () => {
    const bounds = documentBounds(
      doc(
        [
          { id: "a", x: 10, y: 20, w: 100, h: 50 },
          { id: "b", x: 200, y: 0 },
          { id: "f", x: 5000, y: 5000 },
        ],
        [
          { kind: "node", id: "a", shape: "rect" },
          { kind: "shape", id: "b", shape: "rect" },
          { kind: "frame", id: "f" },
        ],
      ), monoMeasurer,
    );
    expect(bounds).toEqual({ x: 10, y: 0, w: 350, h: 80 });
  });

  it("an empty document has no bounds", () => {
    expect(documentBounds(doc([], []), monoMeasurer)).toBeNull();
  });

  it("zoom to fit centres the bounds in the viewport with a margin", () => {
    const view = zoomToFit({ x: 0, y: 0, w: 2000, h: 1000 }, { w: 1000, h: 600 }, 50);
    // (1000-100)/2000 = 0.45, (600-100)/1000 = 0.5: width limits.
    expect(view.scale).toBeCloseTo(0.45);
    expect(worldToScreen(view, { x: 1000, y: 500 }).x).toBeCloseTo(500);
    expect(worldToScreen(view, { x: 1000, y: 500 }).y).toBeCloseTo(300);
  });

  it("zoom to fit never zooms past 100% for small content, and resets with no bounds", () => {
    expect(zoomToFit({ x: 0, y: 0, w: 10, h: 10 }, { w: 1000, h: 600 }, 50).scale).toBe(1);
    expect(zoomToFit(null, { w: 1000, h: 600 }, 50)).toEqual(IDENTITY);
  });
});

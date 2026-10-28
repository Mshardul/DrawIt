import { describe, expect, it } from "vitest";
import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { drawnBoxes } from "./boxes.ts";
import { LINE_HEIGHT } from "./text-layout.ts";

const doc = (elements: DiagramElement[], layout: LayoutEntry[]): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements,
  layout,
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
});

describe("drawn boxes", () => {
  it("a text box with no width is as wide as its text", () => {
    const [box] = drawnBoxes(doc([{ kind: "text", id: "t", content: "hello" }], [{ id: "t", x: 5, y: 6 }]), monoMeasurer);
    expect(box).toMatchObject({ x: 5, y: 6, w: 50, h: LINE_HEIGHT });
  });

  it("a text box with a width wraps there and its height follows the lines", () => {
    const [box] = drawnBoxes(doc([{ kind: "text", id: "t", content: "aa bb cc dd" }], [{ id: "t", x: 0, y: 0, w: 50 }]), monoMeasurer);
    expect(box).toMatchObject({ w: 50, h: 2 * LINE_HEIGHT });
  });

  it("a height in the layout does not change a text box", () => {
    const [box] = drawnBoxes(doc([{ kind: "text", id: "t", content: "hi" }], [{ id: "t", x: 0, y: 0, w: 100, h: 500 }]), monoMeasurer);
    expect(box?.h).toBe(LINE_HEIGHT);
  });

  it("a shape keeps its layout size or the shape default", () => {
    const boxes = drawnBoxes(
      doc(
        [
          { kind: "node", id: "a", shape: "rect" },
          { kind: "node", id: "b", shape: "rect" },
        ],
        [
          { id: "a", x: 0, y: 0, w: 100, h: 60 },
          { id: "b", x: 0, y: 0 },
        ],
      ),
      monoMeasurer,
    );
    expect(boxes.map((b) => [b.w, b.h])).toEqual([
      [100, 60],
      [160, 80],
    ]);
  });
});

import { describe, expect, it } from "vitest";
import type { DiagramDocument } from "../model/index.ts";
import { monoMeasurer, CHAR_W } from "../testing/measurer.ts";
import { frameName } from "./frame.ts";

const doc = (name: string | undefined): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements: [{ kind: "frame", id: "f", ...(name !== undefined && { name }) }],
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout: [{ id: "f", x: 100, y: 200, w: 300, h: 150 }],
});

describe("frame name", () => {
  it("sits one line above the frame's top left, as wide as its text", () => {
    const d = doc("Overview");
    const element = d.elements[0];
    if (element?.kind !== "frame") throw new Error("no frame");
    const name = frameName(d, element, monoMeasurer);
    expect(name?.text).toBe("Overview");
    const lineHeight = name?.look.lineHeight ?? 0;
    expect(lineHeight).toBeGreaterThan(0);
    expect(name?.box).toEqual({ x: 100, y: 200 - lineHeight, w: 8 * CHAR_W, h: lineHeight });
  });

  it("is null when the frame has no name or an empty one", () => {
    for (const value of [undefined, ""]) {
      const d = doc(value);
      const element = d.elements[0];
      if (element?.kind !== "frame") throw new Error("no frame");
      expect(frameName(d, element, monoMeasurer)).toBeNull();
    }
  });

  it("is null for a frame with no layout entry", () => {
    const d = doc("A");
    d.layout = [];
    const element = d.elements[0];
    if (element?.kind !== "frame") throw new Error("no frame");
    expect(frameName(d, element, monoMeasurer)).toBeNull();
  });
});

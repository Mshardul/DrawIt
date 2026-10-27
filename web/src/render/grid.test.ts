import { describe, expect, it } from "vitest";
import { describeGrid } from "./grid.ts";

const pattern = (scale: number, size = 8) => describeGrid(size, scale).find((n) => n.tag === "pattern");
const fill = (scale: number) => describeGrid(8, scale).find((n) => n.tag === "rect");

describe("grid drawing", () => {
  it("the grid is one pattern and one rect, however far it extends", () => {
    const nodes = describeGrid(8, 1);
    expect(nodes.map((n) => n.tag)).toEqual(["pattern", "rect"]);
    expect(fill(1)?.attrs.fill).toBe(`url(#${String(pattern(1)?.attrs.id)})`);
  });

  it("a cell is the grid size at 100% zoom", () => {
    expect(pattern(1)?.attrs.width).toBe(8);
    expect(pattern(1, 16)?.attrs.width).toBe(16);
  });

  it("at low zoom cells coarsen so lines stay at least 8 screen px apart", () => {
    expect(pattern(0.25)?.attrs.width).toBe(32);
  });

  it("grid lines keep a 1 screen px width at any zoom", () => {
    const stroke = (scale: number) => Number(pattern(scale)?.children[0]?.attrs["stroke-width"]);
    expect(stroke(1)).toBe(1);
    expect(stroke(2)).toBeCloseTo(0.5);
    expect(stroke(0.5)).toBe(2);
  });

  it("the grid never takes pointer events", () => {
    expect(fill(1)?.attrs["pointer-events"]).toBe("none");
  });
});

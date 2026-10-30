import { describe, expect, it } from "vitest";
import type { Point } from "../model/layout.ts";
import { entryPoint, exitPoint, insideOutline, nearOutline } from "./outline.ts";

const diamond: Point[] = [{ x: 50, y: 0 }, { x: 100, y: 25 }, { x: 50, y: 50 }, { x: 0, y: 25 }, { x: 50, y: 0 }];
// A "C" opening to the right: the box centre (50, 25) is outside the shape.
const cShape: Point[] = [
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 10 }, { x: 20, y: 10 },
  { x: 20, y: 40 }, { x: 100, y: 40 }, { x: 100, y: 50 }, { x: 0, y: 50 }, { x: 0, y: 0 },
];

describe("outline: inside", () => {
  it("is true in the body and false in the corners of the box", () => {
    expect(insideOutline(diamond, { x: 50, y: 25 })).toBe(true);
    expect(insideOutline(diamond, { x: 90, y: 25 })).toBe(true);
    expect(insideOutline(diamond, { x: 5, y: 5 })).toBe(false);
    expect(insideOutline(diamond, { x: 95, y: 45 })).toBe(false);
  });

  it("is false in the hollow of a concave shape", () => {
    expect(insideOutline(cShape, { x: 60, y: 25 })).toBe(false);
    expect(insideOutline(cShape, { x: 10, y: 25 })).toBe(true);
  });
});

describe("outline: near", () => {
  it("is true within the margin of the outline, inside or outside", () => {
    expect(nearOutline(diamond, { x: 25, y: 14 }, 4)).toBe(true);
    expect(nearOutline(diamond, { x: 25, y: 11 }, 4)).toBe(true);
    expect(nearOutline(diamond, { x: 50, y: 25 }, 4)).toBe(false);
    expect(nearOutline(diamond, { x: 25, y: 14 }, 1)).toBe(false);
  });
});

describe("outline: exit", () => {
  it("is where the line from the centre towards a point leaves the shape", () => {
    const p = exitPoint(diamond, { x: 50, y: 25 }, { x: 300, y: 25 });
    expect(p?.x).toBeCloseTo(100);
    expect(p?.y).toBeCloseTo(25);
    const diagonal = exitPoint(diamond, { x: 50, y: 25 }, { x: 150, y: 75 });
    expect(diagonal?.x).toBeCloseTo(75);
    expect(diagonal?.y).toBeCloseTo(50 - 12.5);
  });

  it("takes the outermost crossing when the line crosses the shape more than once", () => {
    const p = exitPoint(cShape, { x: 50, y: 25 }, { x: 300, y: 25 });
    expect(p).toBeNull();
    const up = exitPoint(cShape, { x: 50, y: 25 }, { x: 50, y: -100 });
    expect(up?.y).toBeCloseTo(0);
    const left = exitPoint(cShape, { x: 50, y: 25 }, { x: -100, y: 25 });
    expect(left?.x).toBeCloseTo(0);
  });

  it("is null when the line never meets the outline", () => {
    expect(exitPoint(diamond, { x: 500, y: 500 }, { x: 600, y: 500 })).toBeNull();
  });
});

describe("outline: entry point", () => {
  it("is where a line from the box edge, running inward, first meets the outline", () => {
    expect(entryPoint(diamond, { x: 25, y: 0 }, { x: 25, y: 50 })).toEqual({ x: 25, y: 12.5 });
    expect(entryPoint(diamond, { x: 0, y: 40 }, { x: 100, y: 40 })).toEqual({ x: 30, y: 40 });
  });

  it("is the start itself when the start is on the outline", () => {
    expect(entryPoint(diamond, { x: 100, y: 25 }, { x: 0, y: 25 })).toEqual({ x: 100, y: 25 });
  });

  it("takes the first meeting, not the last, where the line crosses the shape twice", () => {
    expect(entryPoint(cShape, { x: 100, y: 25 }, { x: 0, y: 25 })).toEqual({ x: 20, y: 25 });
    expect(entryPoint(cShape, { x: 50, y: 0 }, { x: 50, y: 50 })).toEqual({ x: 50, y: 0 });
  });

  it("is null where the line meets no outline", () => {
    expect(entryPoint(diamond, { x: 0, y: -10 }, { x: 100, y: -10 })).toBeNull();
    expect(entryPoint(diamond, { x: 120, y: 25 }, { x: 200, y: 25 })).toBeNull();
  });
});

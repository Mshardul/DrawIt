import { describe, expect, it } from "vitest";
import { distanceToPath, pathTouchesRect } from "./path.ts";

const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];

describe("distance to a path", () => {
  it("is zero on the path", () => {
    expect(distanceToPath(path, { x: 50, y: 0 })).toBe(0);
    expect(distanceToPath(path, { x: 100, y: 60 })).toBe(0);
  });

  it("is the perpendicular distance beside a segment", () => {
    expect(distanceToPath(path, { x: 50, y: 7 })).toBe(7);
  });

  it("is the distance to the end point past the end of a segment", () => {
    expect(distanceToPath(path, { x: -3, y: -4 })).toBe(5);
  });

  it("is the shortest over all segments", () => {
    expect(distanceToPath(path, { x: 90, y: 40 })).toBe(10);
  });

  it("works for a path of one point or a segment of no length", () => {
    expect(distanceToPath([{ x: 5, y: 5 }], { x: 8, y: 9 })).toBe(5);
    expect(distanceToPath([{ x: 5, y: 5 }, { x: 5, y: 5 }], { x: 8, y: 9 })).toBe(5);
  });

  it("is infinite for no path", () => {
    expect(distanceToPath([], { x: 0, y: 0 })).toBe(Infinity);
  });
});

describe("a path touching a rectangle", () => {
  const rect = { x: 40, y: -10, w: 20, h: 20 };

  it("is true when a segment crosses the rectangle with both its ends outside", () => {
    expect(pathTouchesRect(path, rect)).toBe(true);
  });

  it("is true when an end is inside", () => {
    expect(pathTouchesRect([{ x: 50, y: 0 }, { x: 500, y: 500 }], rect)).toBe(true);
  });

  it("is false when the path passes by", () => {
    expect(pathTouchesRect(path, { x: 40, y: 20, w: 20, h: 20 })).toBe(false);
  });

  it("is true for a diagonal segment that cuts across a corner", () => {
    expect(pathTouchesRect([{ x: 0, y: 35 }, { x: 70, y: -35 }], rect)).toBe(true);
  });

  it("is false for a diagonal segment that misses the corner", () => {
    expect(pathTouchesRect([{ x: 0, y: 60 }, { x: 70, y: 20 }], rect)).toBe(false);
  });
});

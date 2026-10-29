import { describe, expect, it } from "vitest";
import { distanceToPath, nearestOnPath, pathTouchesRect, pointAlongPath } from "./path.ts";

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

describe("the nearest point on a path", () => {
  it("is the foot of the perpendicular, with how far along the path it lies as a fraction of the length", () => {
    expect(nearestOnPath(path, { x: 50, y: 7 })).toEqual({ point: { x: 50, y: 0 }, distance: 7, along: 0.25 });
    expect(nearestOnPath(path, { x: 93, y: 150 })).toEqual({ point: { x: 100, y: 100 }, distance: Math.hypot(7, 50), along: 1 });
  });

  it("counts the length of the segments before the one it lies on", () => {
    expect(nearestOnPath(path, { x: 100, y: 60 })).toMatchObject({ point: { x: 100, y: 60 }, along: 0.8 });
  });

  it("is the start for a point before it", () => {
    expect(nearestOnPath(path, { x: -3, y: -4 })).toMatchObject({ point: { x: 0, y: 0 }, distance: 5, along: 0 });
  });

  it("is the point itself, at 0, for a path of one point or no length", () => {
    expect(nearestOnPath([{ x: 5, y: 5 }, { x: 5, y: 5 }], { x: 8, y: 9 })).toEqual({ point: { x: 5, y: 5 }, distance: 5, along: 0 });
    expect(nearestOnPath([{ x: 5, y: 5 }], { x: 8, y: 9 })).toEqual({ point: { x: 5, y: 5 }, distance: 5, along: 0 });
  });

  it("is null for no path", () => {
    expect(nearestOnPath([], { x: 0, y: 0 })).toBeNull();
  });
});

describe("the point at a fraction along a path", () => {
  it("is measured along the length of the path, corners included", () => {
    expect(pointAlongPath(path, 0.25)).toEqual({ x: 50, y: 0 });
    expect(pointAlongPath(path, 0.5)).toEqual({ x: 100, y: 0 });
    expect(pointAlongPath(path, 0.75)).toEqual({ x: 100, y: 50 });
  });

  it("is the start at 0 and the end at 1, and stays on the path outside 0..1", () => {
    expect(pointAlongPath(path, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAlongPath(path, 1)).toEqual({ x: 100, y: 100 });
    expect(pointAlongPath(path, -2)).toEqual({ x: 0, y: 0 });
    expect(pointAlongPath(path, 7)).toEqual({ x: 100, y: 100 });
  });

  it("is the point itself for a path with no length, and null for no path", () => {
    expect(pointAlongPath([{ x: 5, y: 5 }, { x: 5, y: 5 }], 0.5)).toEqual({ x: 5, y: 5 });
    expect(pointAlongPath([], 0.5)).toBeNull();
  });

  it("undoes nearestOnPath", () => {
    const near = nearestOnPath(path, { x: 90, y: 40 });
    expect(near && pointAlongPath(path, near.along)).toEqual(near?.point);
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

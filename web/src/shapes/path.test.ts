import { describe, expect, it } from "vitest";
import { flatten, formatPath, parsePath, pointOnOutline } from "./path.ts";

describe("outline paths", () => {
  it("[T-022] parses the absolute commands M L H V C Q Z, including repeated arguments", () => {
    const cmds = parsePath("M 0 0 L 10 0 20 5 H 30 V 40 C 1 2 3 4 5 6 Q 7 8 9 10 Z");
    expect(cmds.map((c) => c.cmd)).toEqual(["M", "L", "L", "H", "V", "C", "Q", "Z"]);
    expect(cmds[2]?.args).toEqual([20, 5]);
  });

  it("[T-022] accepts numbers without spaces", () => {
    expect(parsePath("M0,0L10-5Z")[1]?.args).toEqual([10, -5]);
  });

  it("[T-022] refuses relative commands, arcs, smooth curves and wrong argument counts", () => {
    expect(() => parsePath("M 0 0 l 1 1")).toThrow(/relative|absolute/);
    expect(() => parsePath("M 0 0 A 1 1 0 0 0 5 5")).toThrow();
    expect(() => parsePath("M 0 0 S 1 1 2 2")).toThrow();
    expect(() => parsePath("M 0 0 L 1")).toThrow();
    expect(() => parsePath("L 0 0")).toThrow(/start with M/);
  });

  it("[T-022] round-trips through formatPath", () => {
    const d = "M 8 0 H 152 V 80 C 1 2 3 4 5 6 Z";
    expect(formatPath(parsePath(d))).toBe(d);
  });

  it("[T-022] flatten gives the closed polyline, with curves sampled", () => {
    const poly = flatten(parsePath("M 0 0 H 10 C 10 5 5 10 0 10 Z"));
    expect(poly.closed).toBe(true);
    expect(poly.subpaths).toBe(1);
    expect(poly.points.length).toBeGreaterThan(4);
    expect(poly.points[0]).toEqual({ x: 0, y: 0 });
  });

  it("[T-022] a path without Z, or with two subpaths, is not a single closed outline", () => {
    expect(flatten(parsePath("M 0 0 H 10 V 10")).closed).toBe(false);
    expect(flatten(parsePath("M 0 0 H 10 V 10 Z M 20 20 H 30 V 30 Z")).subpaths).toBe(2);
  });

  it("[T-022] pointOnOutline tests distance to the edges", () => {
    const poly = flatten(parsePath("M 0 0 H 10 V 10 H 0 Z"));
    expect(pointOnOutline(poly, { x: 5, y: 0 }, 0.5)).toBe(true);
    expect(pointOnOutline(poly, { x: 5, y: 5 }, 0.5)).toBe(false);
    expect(pointOnOutline(poly, { x: 10.3, y: 4 }, 0.5)).toBe(true);
  });
});

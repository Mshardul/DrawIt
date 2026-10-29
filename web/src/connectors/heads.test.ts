import { describe, expect, it } from "vitest";
import type { Point } from "../model/layout.ts";
import { DOT_RADIUS, HEAD_HALF_WIDTH, HEAD_LENGTH, type HeadShape, headShape } from "./heads.ts";

const arrowPoints = (shape: HeadShape | null): [Point, Point, Point] => {
  if (shape?.kind !== "arrow") throw new Error("not an arrow");
  return shape.points;
};

const horizontal = [{ x: 0, y: 0 }, { x: 100, y: 0 }];

describe("edge heads", () => {
  it("no head is drawn for none", () => {
    expect(headShape("none", horizontal, "end")).toBeNull();
  });

  it("an arrow at the end has its tip on the last point and its base back along the path", () => {
    expect(headShape("arrow", horizontal, "end")).toEqual({
      kind: "arrow",
      points: [{ x: 100, y: 0 }, { x: 100 - HEAD_LENGTH, y: HEAD_HALF_WIDTH }, { x: 100 - HEAD_LENGTH, y: -HEAD_HALF_WIDTH }],
    });
  });

  it("an arrow at the start points the other way", () => {
    const [tip, base] = arrowPoints(headShape("arrow", horizontal, "start"));
    expect(tip).toEqual({ x: 0, y: 0 });
    expect(base.x).toBe(HEAD_LENGTH);
  });

  it("an arrow follows the direction of the last segment, however it runs", () => {
    const [tip, base] = arrowPoints(headShape("arrow", [{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 0, y: 100 }], "end"));
    expect(tip).toEqual({ x: 0, y: 100 });
    expect(base.y).toBe(100 - HEAD_LENGTH);
  });

  it("a last segment of no length takes its direction from the one before", () => {
    const [, base] = arrowPoints(headShape("arrow", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 }], "end"));
    expect(base.x).toBe(100 - HEAD_LENGTH);
  });

  it("a dot sits just outside the end, touching it", () => {
    expect(headShape("dot", horizontal, "end")).toEqual({ kind: "dot", centre: { x: 100 + DOT_RADIUS, y: 0 }, r: DOT_RADIUS });
  });

  it("a path of one point, or points all the same, has no direction and so no head", () => {
    expect(headShape("arrow", [{ x: 5, y: 5 }], "end")).toBeNull();
    expect(headShape("arrow", [{ x: 5, y: 5 }, { x: 5, y: 5 }], "end")).toBeNull();
  });
});

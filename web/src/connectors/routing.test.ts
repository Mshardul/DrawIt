import { describe, expect, it } from "vitest";
import type { Anchor, Point, Side } from "../model/layout.ts";
import { attachTarget, type End, route, type Target } from "./routing.ts";

const rect = (x: number, y: number, w = 100, h = 50): End => ({ box: { x, y, w, h }, shape: "rect", anchor: "auto" });
const ellipse = (x: number, y: number, w = 100, h = 50): End => ({ box: { x, y, w, h }, shape: "ellipse", anchor: "auto" });
const withAnchor = (end: End, anchor: Anchor): End => ({ ...end, anchor });

const axisAligned = (path: Point[]): boolean =>
  path.every((p, i) => i === 0 || p.x === (path[i - 1] as Point).x || p.y === (path[i - 1] as Point).y);
const noZeroSegments = (path: Point[]): boolean =>
  path.every((p, i) => i === 0 || p.x !== (path[i - 1] as Point).x || p.y !== (path[i - 1] as Point).y);

const DIAMOND: Point[] = [{ x: 50, y: 0 }, { x: 100, y: 25 }, { x: 50, y: 50 }, { x: 0, y: 25 }, { x: 50, y: 0 }];
const diamondEnd = (x: number, y: number, anchor: Anchor = "auto"): End => ({
  box: { x, y, w: 100, h: 50 },
  shape: "rect",
  anchor,
  outline: DIAMOND,
});

describe("connector routing: straight to a shape with an outline", () => {
  it("an auto end leaves the outline, not the box", () => {
    const [a] = route(diamondEnd(0, 0), rect(300, 200), { route: "straight" }) as [Point, Point];
    expect(a.x).toBeCloseTo(71.43, 1);
    expect(a.y).toBeCloseTo(39.29, 1);
  });

  it("works from the shape's place in the world", () => {
    const [a] = route(diamondEnd(1000, 500), rect(1300, 700), { route: "straight" }) as [Point, Point];
    expect(a.x).toBeCloseTo(1071.43, 1);
    expect(a.y).toBeCloseTo(539.29, 1);
  });

  it("clips the other end to its outline too", () => {
    const [, b] = route(rect(0, 0), diamondEnd(300, 200), { route: "straight" }) as [Point, Point];
    expect(b.x).toBeCloseTo(328.57, 1);
    expect(b.y).toBeCloseTo(210.71, 1);
  });

  it("falls back to the box where the line does not meet the outline", () => {
    const hollow: End = { box: { x: 0, y: 0, w: 100, h: 50 }, shape: "rect", anchor: "auto", outline: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 }] };
    expect(route(hollow, rect(300, 0), { route: "straight" })[0]).toEqual({ x: 100, y: 25 });
  });

  it("a side and position sit where a line inward from the box first meets the outline", () => {
    expect(route(diamondEnd(0, 0, { side: "right", at: 0.5 }), rect(300, 200), { route: "straight" })[0]).toEqual({ x: 100, y: 25 });
    expect(route(diamondEnd(0, 0, { side: "top", at: 0.25 }), rect(300, 200), { route: "straight" })[0]).toEqual({ x: 25, y: 12.5 });
    expect(route(diamondEnd(1000, 500, { side: "left", at: 0.8 }), rect(300, 200), { route: "straight" })[0]).toEqual({ x: 1030, y: 540 });
  });

  it("a side and position fall back to the box point where the line meets no outline", () => {
    const hollow: End = { box: { x: 0, y: 0, w: 100, h: 50 }, shape: "rect", anchor: { side: "right", at: 0.5 }, outline: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 }] };
    expect(route(hollow, rect(300, 0), { route: "straight" })[0]).toEqual({ x: 100, y: 25 });
  });
});

describe("connector routing: elbow from a shape with an outline", () => {
  it("leaves a side and position along the box side's direction, beyond the box", () => {
    const path = route(diamondEnd(0, 0, { side: "top", at: 0.25 }), rect(0, 300), { route: "elbow" });
    expect(path[0]).toEqual({ x: 25, y: 12.5 });
    expect(path[1]).toEqual({ x: 25, y: -16 });
    expect(axisAligned(path)).toBe(true);
  });

  it("an auto end leaves from the shape's own anchor on the facing side", () => {
    const end: End = { ...diamondEnd(0, 0), anchors: { top: { x: 50, y: 0 }, right: { x: 75, y: 37.5 }, bottom: { x: 50, y: 50 }, left: { x: 0, y: 25 } } };
    const path = route(end, rect(300, 100), { route: "elbow" });
    expect(path[0]).toEqual({ x: 75, y: 37.5 });
    expect(path[1]?.y).toBe(37.5);
    expect(path[1]?.x).toBeGreaterThanOrEqual(116);
    expect(axisAligned(path)).toBe(true);
  });

  it("an auto end with no anchors leaves from the middle of the facing side", () => {
    const path = route(diamondEnd(0, 0), rect(300, 100), { route: "elbow" });
    expect(path[0]).toEqual({ x: 100, y: 25 });
    expect(path[1]?.y).toBe(25);
    expect(path[1]?.x).toBeGreaterThanOrEqual(116);
  });

  it("arrives at a shape with an outline along the direction of its box side", () => {
    const path = route(rect(0, 0), diamondEnd(300, 200, { side: "left", at: 0.8 }), { route: "elbow" });
    expect(path.at(-1)).toEqual({ x: 330, y: 240 });
    expect(path.at(-2)?.y).toBe(240);
    expect(path.at(-2)?.x).toBeLessThanOrEqual(284);
    expect(axisAligned(path)).toBe(true);
  });
});

describe("connector routing: straight", () => {
  it("auto ends sit on the facing sides when the shapes are level", () => {
    expect(route(rect(0, 0), rect(300, 0), { route: "straight" })).toEqual([
      { x: 100, y: 25 },
      { x: 300, y: 25 },
    ]);
  });

  it("a diagonal line is clipped to each rectangle's outline", () => {
    const [a, b] = route(rect(0, 0), rect(300, 200), { route: "straight" }) as [Point, Point];
    expect(a.x === 100 || a.y === 50).toBe(true);
    expect(b.x === 300 || b.y === 200).toBe(true);
  });

  it("ellipse ends lie on the ellipse", () => {
    const [a] = route(ellipse(0, 0, 100, 50), rect(300, 200), { route: "straight" }) as [Point, Point];
    const k = ((a.x - 50) / 50) ** 2 + ((a.y - 25) / 25) ** 2;
    expect(k).toBeCloseTo(1, 2);
  });

  it("a fixed side with a position attaches anywhere along that side", () => {
    const from = withAnchor(rect(0, 0), { side: "right", at: 0.3 });
    const to = withAnchor(rect(300, 0), { side: "top", at: 0.5 });
    expect(route(from, to, { route: "straight" })).toEqual([
      { x: 100, y: 15 },
      { x: 350, y: 0 },
    ]);
  });

  it("a position along an ellipse's side lands on the ellipse outline", () => {
    const from = withAnchor(ellipse(0, 0, 100, 50), { side: "top", at: 0.25 });
    const [a] = route(from, rect(300, 200), { route: "straight" }) as [Point, Point];
    expect(a.x).toBe(25);
    expect(((a.x - 50) / 50) ** 2 + ((a.y - 25) / 25) ** 2).toBeCloseTo(1, 2);
    expect(a.y).toBeLessThan(25);
  });

  it("a free end is a point, and bend points are kept in order", () => {
    const path = route(rect(0, 0), { point: { x: 400, y: 300 } }, { route: "straight", via: [{ x: 200, y: 25 }, { x: 200, y: 300 }] });
    expect(path.slice(1, 3)).toEqual([{ x: 200, y: 25 }, { x: 200, y: 300 }]);
    expect(path.at(-1)).toEqual({ x: 400, y: 300 });
    expect(path[0]?.x).toBe(100);
  });
});

describe("connector routing: elbow", () => {
  it("shapes level with facing sides are joined by a straight run", () => {
    expect(route(rect(0, 0), rect(300, 0), { route: "elbow" })).toEqual([
      { x: 100, y: 25 },
      { x: 300, y: 25 },
    ]);
  });

  it("shapes offset in y get a Z with the bend half way", () => {
    expect(route(rect(0, 0), rect(300, 100), { route: "elbow" })).toEqual([
      { x: 100, y: 25 },
      { x: 200, y: 25 },
      { x: 200, y: 125 },
      { x: 300, y: 125 },
    ]);
  });

  it("every segment is axis-aligned and non-empty for every pair of sides and relative position", () => {
    const sides: Side[] = ["top", "right", "bottom", "left"];
    const places: Point[] = [
      { x: 300, y: 0 },
      { x: -300, y: 0 },
      { x: 0, y: 200 },
      { x: 0, y: -200 },
      { x: 300, y: 200 },
      { x: -300, y: -200 },
      { x: 60, y: 20 },
    ];
    for (const a of sides)
      for (const b of sides)
        for (const p of places) {
          const path = route(withAnchor(rect(0, 0), { side: a }), withAnchor(rect(p.x, p.y), { side: b }), { route: "elbow" });
          expect(axisAligned(path), `${a} to ${b} at ${JSON.stringify(p)}`).toBe(true);
          expect(noZeroSegments(path), `${a} to ${b} at ${JSON.stringify(p)}`).toBe(true);
        }
  });

  it("the path leaves a fixed side outwards", () => {
    const path = route(withAnchor(rect(0, 0), { side: "top" }), rect(300, 200), { route: "elbow" });
    expect(path[0]).toEqual({ x: 50, y: 0 });
    expect(path[1]?.x).toBe(50);
    expect(path[1]?.y).toBeLessThan(0);
  });

  it("bend points are kept and the path stays axis-aligned", () => {
    const via = [{ x: 200, y: 300 }];
    const path = route(rect(0, 0), rect(300, 0), { route: "elbow", via });
    expect(path).toContainEqual(via[0]);
    expect(axisAligned(path)).toBe(true);
  });

  it("a free end is reached orthogonally", () => {
    const path = route(rect(0, 0), { point: { x: 333, y: 222 } }, { route: "elbow" });
    expect(path.at(-1)).toEqual({ x: 333, y: 222 });
    expect(axisAligned(path)).toBe(true);
  });

  it("moving a shape recomputes the endpoints, and the side that faces", () => {
    const before = route(rect(0, 0), rect(300, 0), { route: "elbow" });
    const after = route(rect(0, 0), rect(300, 400), { route: "elbow" });
    expect(before.at(-1)).toEqual({ x: 300, y: 25 });
    expect(after.at(-1)).toEqual({ x: 350, y: 400 });
  });
});

describe("connector routing: degenerate placement", () => {
  const finite = (path: Point[]): boolean => path.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  it("shapes on top of each other still give a finite path", () => {
    for (const kind of ["straight", "elbow"] as const)
      for (const make of [rect, ellipse]) {
        expect(finite(route(make(0, 0), make(0, 0), { route: kind })), `${kind} identical`).toBe(true);
        expect(finite(route(make(0, 0), make(30, 10), { route: kind })), `${kind} overlapping`).toBe(true);
      }
  });

  it("a free end on the other end's centre still gives a finite path", () => {
    for (const kind of ["straight", "elbow"] as const)
      expect(finite(route(rect(0, 0), { point: { x: 50, y: 25 } }, { route: kind }))).toBe(true);
  });
});

describe("connector routing: re-attaching an end", () => {
  const targets: Target[] = [
    { id: "back", box: { x: 0, y: 0, w: 400, h: 400 }, shape: "rect" },
    { id: "front", box: { x: 100, y: 100, w: 100, h: 50 }, shape: "rect" },
    { id: "oval", box: { x: 250, y: 100, w: 100, h: 50 }, shape: "ellipse" },
  ];

  it("the topmost element under the pointer is the target, with the nearest side and position", () => {
    expect(attachTarget(targets, { x: 195, y: 110 })).toEqual({ id: "front", anchor: { side: "right", at: 0.2 } });
  });

  it("the pointer in the corner of an ellipse's box misses the ellipse", () => {
    expect(attachTarget(targets, { x: 252, y: 102 })?.id).toBe("back");
  });

  it("the pointer over nothing detaches the end", () => {
    expect(attachTarget(targets, { x: 900, y: 900 })).toBeNull();
  });

  it("an element can be excluded, so an edge cannot attach to itself by dropping on its own start", () => {
    expect(attachTarget(targets, { x: 150, y: 120 }, new Set(["front"]))?.id).toBe("back");
  });
});

describe("connector routing: dropping an end on a shape with an outline", () => {
  const target: Target = { id: "d", box: { x: 0, y: 0, w: 100, h: 50 }, shape: "rect", outline: DIAMOND };

  it("attaches inside the outline", () => {
    expect(attachTarget([target], { x: 80, y: 25 })).toEqual({ id: "d", anchor: { side: "right", at: 0.5 } });
  });

  it("does not attach in a corner of the box that the outline leaves empty", () => {
    expect(attachTarget([target], { x: 5, y: 5 })).toBeNull();
  });

  it("attaches to the shape beneath when the corner of the one above is empty", () => {
    const below: Target = { id: "r", box: { x: 0, y: 0, w: 100, h: 50 }, shape: "rect" };
    expect(attachTarget([below, target], { x: 5, y: 5 })?.id).toBe("r");
  });

  it("works from the shape's place in the world", () => {
    const placed: Target = { ...target, box: { x: 1000, y: 500, w: 100, h: 50 } };
    expect(attachTarget([placed], { x: 1005, y: 505 })).toBeNull();
    expect(attachTarget([placed], { x: 1050, y: 525 })?.id).toBe("d");
  });

  describe("a stroke-only target", () => {
    const frame: Target = { id: "b", box: { x: 0, y: 0, w: 100, h: 50 }, shape: "rect", outline: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }, { x: 0, y: 0 }], filled: false };

    it("is not attached by a drop inside it", () => {
      expect(attachTarget([frame], { x: 50, y: 25 })).toBeNull();
    });

    it("is attached by a drop on its outline, at the side and position nearest", () => {
      expect(attachTarget([frame], { x: 99, y: 10 })).toEqual({ id: "b", anchor: { side: "right", at: 0.2 } });
    });

    it("lets a drop inside reach the shape behind it", () => {
      const behind: Target = { id: "r", box: { x: 20, y: 10, w: 40, h: 30 }, shape: "rect" };
      expect(attachTarget([behind, frame], { x: 30, y: 20 })?.id).toBe("r");
    });
  });
});

import { describe, expect, it } from "vitest";
import type { DiagramDocument, DiagramElement, EdgeElement, LayoutEntry, StyleProps } from "../model/index.ts";
import { DEFAULT_LOOK } from "../style/text-look.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { styleOf } from "../style/of.ts";
import { edgesAttachedTo, routedEdges } from "./edges.ts";

const LINE_HEIGHT = DEFAULT_LOOK.lineHeight;

const doc = (elements: DiagramElement[], layout: LayoutEntry[], style: Partial<DiagramDocument["style"]> = {}): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements,
  layout,
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [], ...style },
});

const a: DiagramElement = { kind: "node", id: "a", shape: "rect" };
const b: DiagramElement = { kind: "node", id: "b", shape: "rect" };
const edge = (extra: Partial<EdgeElement> = {}): EdgeElement => ({ kind: "edge", id: "a->b", from: "a", to: "b", ...extra });
const twoNodes: LayoutEntry[] = [
  { id: "a", x: 0, y: 0, w: 100, h: 50 },
  { id: "b", x: 300, y: 0, w: 100, h: 50 },
];

describe("edge style", () => {
  const props = (p: StyleProps): DiagramDocument["style"]["classes"] => [{ name: "fancy", props: p }];

  it("an edge with no style is straight, with no head at the start and an arrow at the end", () => {
    expect(styleOf(doc([a, b, edge()], twoNodes), edge())).toMatchObject({ route: "straight", headStart: "none", headEnd: "arrow" });
  });

  it("a class overrides the defaults property by property", () => {
    const e = edge({ class: "fancy" });
    const d = doc([a, b, e], twoNodes, { classes: props({ route: "elbow", headStart: "dot" }) });
    expect(styleOf(d, e)).toMatchObject({ route: "elbow", headStart: "dot", headEnd: "arrow" });
  });

  it("a per-element override wins over the class", () => {
    const e = edge({ class: "fancy" });
    const d = doc([a, b, e], twoNodes, {
      classes: props({ route: "elbow", headEnd: "dot" }),
      overrides: [{ id: "a->b", props: { headEnd: "none" } }],
    });
    expect(styleOf(d, e)).toMatchObject({ route: "elbow", headStart: "none", headEnd: "none" });
  });

  it("a class that is not defined changes nothing", () => {
    const e = edge({ class: "missing" });
    expect(styleOf(doc([a, b, e], twoNodes), e).route).toBe("straight");
  });
});

describe("routed edges", () => {
  it("an edge between two shapes runs between their facing sides", () => {
    const d = doc([a, b, edge()], twoNodes);
    expect(routedEdges(d, monoMeasurer).get("a->b")?.points).toEqual([
      { x: 100, y: 25 },
      { x: 300, y: 25 },
    ]);
  });

  it("moving a shape moves the end that is attached to it", () => {
    const moved = doc([a, b, edge()], [twoNodes[0] as LayoutEntry, { id: "b", x: 300, y: 400, w: 100, h: 50 }]);
    const end = routedEdges(moved, monoMeasurer).get("a->b")?.points.at(-1);
    expect(end?.y).toBe(400);
    expect(end?.x).toBeGreaterThan(300);
    expect(end?.x).toBeLessThan(400);
  });

  it("an anchor in the layout fixes the side and the position along it", () => {
    const d = doc([a, b, edge()], [...twoNodes, { id: "a->b", x: 0, y: 0, from: { side: "right", at: 0.3 }, to: { side: "left", at: 0.5 } }]);
    expect(routedEdges(d, monoMeasurer).get("a->b")?.points).toEqual([
      { x: 100, y: 15 },
      { x: 300, y: 25 },
    ]);
  });

  it("an end written as a dash takes its point from the layout", () => {
    const free = edge({ id: "e", to: null });
    const d = doc([a, free], [twoNodes[0] as LayoutEntry, { id: "e", x: 0, y: 0, toPoint: { x: 500, y: 25 } }]);
    expect(routedEdges(d, monoMeasurer).get("e")?.points).toEqual([
      { x: 100, y: 25 },
      { x: 500, y: 25 },
    ]);
  });

  it("bend points in the layout are kept, and the route comes from the style", () => {
    const e = edge();
    const d = doc([a, b, e], [...twoNodes, { id: "a->b", x: 0, y: 0, via: [{ x: 200, y: 200 }] }], {
      overrides: [{ id: "a->b", props: { route: "elbow" } }],
    });
    const routed = routedEdges(d, monoMeasurer).get("a->b");
    expect(routed?.points).toContainEqual({ x: 200, y: 200 });
    expect(routed?.style.route).toBe("elbow");
  });

  it("an edge to a text box ends on the box the text takes", () => {
    const t: DiagramElement = { kind: "text", id: "t", content: "hello" };
    const d = doc([a, t, edge({ id: "e", to: "t" })], [twoNodes[0] as LayoutEntry, { id: "t", x: 300, y: 0 }]);
    const end = routedEdges(d, monoMeasurer).get("e")?.points.at(-1);
    expect(end?.x).toBe(300);
    expect(end?.y).toBeGreaterThan(0);
    expect(end?.y).toBeLessThan(LINE_HEIGHT);
  });

  it("an edge whose end names no element, or whose free end has no point, is not routed", () => {
    const dangling = edge({ id: "d", to: "nowhere" });
    const pointless = edge({ id: "p", to: null });
    const d = doc([a, dangling, pointless], [twoNodes[0] as LayoutEntry]);
    expect([...routedEdges(d, monoMeasurer).keys()]).toEqual([]);
  });

  it("only the asked-for edges are routed", () => {
    const other = edge({ id: "other" });
    const d = doc([a, b, edge(), other], twoNodes);
    expect([...routedEdges(d, monoMeasurer, new Set(["other"])).keys()]).toEqual(["other"]);
  });
});

describe("edges attached to elements", () => {
  it("lists the edges with an end on any of the elements, once each", () => {
    const c: DiagramElement = { kind: "node", id: "c", shape: "rect" };
    const d = doc([a, b, c, edge(), edge({ id: "bc", from: "b", to: "c" }), edge({ id: "ca", from: "c", to: "a" })], twoNodes);
    expect(edgesAttachedTo(d, ["a", "b"]).sort()).toEqual(["a->b", "bc", "ca"]);
    expect(edgesAttachedTo(d, ["c"]).sort()).toEqual(["bc", "ca"]);
    expect(edgesAttachedTo(d, ["zzz"])).toEqual([]);
  });
});

describe("edges to pack shapes", () => {
  const database: DiagramElement = { kind: "node", id: "db", shape: "arch.database" };
  const far: DiagramElement = { kind: "node", id: "far", shape: "rect" };
  const layout: LayoutEntry[] = [
    { id: "db", x: 0, y: 0, w: 96, h: 112 },
    { id: "far", x: 200, y: -200, w: 100, h: 50 },
  ];
  const link: EdgeElement = { kind: "edge", id: "db->far", from: "db", to: "far" };

  it("a straight edge leaves a pack shape at its outline, not at its box", () => {
    const [start] = routedEdges(doc([database, far, link], layout), monoMeasurer).get("db->far")?.points ?? [];
    // The box clip would be on the right side, x = 96; the rounded top is further in at that height.
    expect(start?.x).toBeLessThan(95);
    expect(start?.y).toBeGreaterThanOrEqual(0);
  });

  it("an edge to a rectangle named as a pack shape still clips to the box", () => {
    const [start] = routedEdges(doc([{ kind: "node", id: "db", shape: "rect" }, far, link], layout), monoMeasurer).get("db->far")?.points ?? [];
    expect(start?.x).toBe(96);
  });

  it("a side and position on a pack shape meet its outline, not the box corner", () => {
    const rounded: DiagramElement = { kind: "node", id: "rr", shape: "core.rounded-rect" };
    const edgeFromCorner: EdgeElement = { kind: "edge", id: "rr->far", from: "rr", to: "far" };
    const d = doc([rounded, far, edgeFromCorner], [{ id: "rr", x: 0, y: 0, w: 160, h: 80 }, { id: "far", x: 400, y: 300, w: 100, h: 50 }, { id: "rr->far", x: 0, y: 0, from: { side: "top", at: 0 } }]);
    const [start] = routedEdges(d, monoMeasurer).get("rr->far")?.points ?? [];
    expect(start?.x).toBe(0);
    expect(start?.y).toBeCloseTo(8, 0);
  });

  it("an elbow leaves a pack shape along its box side from beyond the box", () => {
    const rounded: DiagramElement = { kind: "node", id: "rr", shape: "core.rounded-rect" };
    const e: EdgeElement = { kind: "edge", id: "rr->far", from: "rr", to: "far" };
    const d = doc([rounded, far, e], [{ id: "rr", x: 0, y: 0, w: 160, h: 80 }, { id: "far", x: 400, y: 300, w: 100, h: 50 }, { id: "rr->far", x: 0, y: 0, from: { side: "top", at: 0.5 } }], {
      overrides: [{ id: "rr->far", props: { route: "elbow" } }],
    });
    const points = routedEdges(d, monoMeasurer).get("rr->far")?.points ?? [];
    expect(points[0]).toEqual({ x: 80, y: 0 });
    expect(points[1]?.x).toBe(80);
    expect(points[1]?.y).toBeLessThan(0);
  });
});

import { describe, expect, it } from "vitest";
import type { DiagramDocument, DiagramElement } from "../model/index.ts";
import { countShadowed, describeDefs, fillPaint, shadowFilter } from "./defs.ts";
import type { SvgNode } from "./describe.ts";

function doc(overrides: { id: string; props: object }[], elements: DiagramElement[] = []): DiagramDocument {
  return {
    version: 1,
    plugins: [],
    elements: elements.length > 0 ? elements : [{ kind: "node", id: "a", shape: "rect" }, { kind: "node", id: "b", shape: "rect" }],
    style: { theme: { name: "default", colors: { warm: "#ff8800" }, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides },
    layout: [],
  };
}

const ids = (nodes: SvgNode[]): string[] => nodes.map((n) => String(n.attrs["id"]));
const gradient = "linear(90, #ff0000, $warm 0.8, #0000ff)";

describe("gradient and shadow definitions", () => {
  it("defines nothing for a document without gradients or shadows", () => {
    expect(describeDefs(doc([]))).toEqual([]);
  });

  it("defines a linear gradient with its direction and evenly spaced stops", () => {
    const [g] = describeDefs(doc([{ id: "a", props: { fill: gradient } }]));
    expect(g).toMatchObject({ tag: "linearGradient", attrs: { x1: 0, y1: 0.5, x2: 1, y2: 0.5 } });
    expect(g?.children.map((s) => s.attrs)).toEqual([
      { offset: 0, "stop-color": "#ff0000" },
      { offset: 0.8, "stop-color": "#ff8800" },
      { offset: 1, "stop-color": "#0000ff" },
    ]);
  });

  it("points an angle of 0 up and 180 down", () => {
    const [up] = describeDefs(doc([{ id: "a", props: { fill: "linear(0, #000, #fff)" } }]));
    expect(up?.attrs).toMatchObject({ x1: 0.5, y1: 1, x2: 0.5, y2: 0 });
    const [down] = describeDefs(doc([{ id: "a", props: { fill: "linear(180, #000, #fff)" } }]));
    expect(down?.attrs).toMatchObject({ x1: 0.5, y1: 0, x2: 0.5, y2: 1 });
  });

  it("spaces stops without a position between their neighbours", () => {
    const [g] = describeDefs(doc([{ id: "a", props: { fill: "linear(90, #000, #111, #222 0.5, #333, #fff)" } }]));
    expect(g?.children.map((s) => s.attrs["offset"])).toEqual([0, 0.25, 0.5, 0.75, 1]);
    const [wide] = describeDefs(doc([{ id: "a", props: { fill: "linear(90, #000, #111, #222, #fff 0.6, #eee)" } }]));
    expect(wide?.children.map((s) => s.attrs["offset"])).toEqual([0, 0.2, 0.4, 0.6, 1]);
  });

  it("defines a drop shadow with the colour of its token", () => {
    const [f] = describeDefs(doc([{ id: "a", props: { shadow: "2 4 6 $warm" } }]));
    expect(f).toMatchObject({ tag: "filter" });
    expect(f?.children[0]).toMatchObject({
      tag: "feDropShadow",
      attrs: { dx: 2, dy: 4, stdDeviation: 3, "flood-color": "#ff8800" },
    });
  });

  it("defines a value once however many elements use it, and keeps the definitions apart", () => {
    const shared = describeDefs(doc([{ id: "a", props: { fill: gradient } }, { id: "b", props: { fill: gradient } }]));
    expect(shared).toHaveLength(1);
    const apart = describeDefs(doc([{ id: "a", props: { fill: gradient } }, { id: "b", props: { fill: "linear(0, #000, #fff)" } }]));
    expect(new Set(ids(apart)).size).toBe(2);
  });

  it("gives definitions ids that are valid in a reference and cannot collide", () => {
    const out = describeDefs(doc([{ id: "a", props: { fill: gradient, shadow: "1 1 1 #000" } }]));
    for (const id of ids(out)) expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
    expect(out.map((n) => n.attrs["data-id"])).toEqual(ids(out));
  });

  it("skips a value that does not parse or names a colour nothing defines", () => {
    const bad = [{ id: "a", props: { fill: "linear(90, #000)", shadow: "1 1 1 $nowhere" } }, { id: "b", props: { fill: "linear(90, #000, $nowhere)" } }];
    expect(describeDefs(doc(bad))).toEqual([]);
  });

  it("is built once for a style section and elements that do not change", () => {
    const d = doc([{ id: "a", props: { fill: gradient } }]);
    expect(describeDefs({ ...d, layout: [{ id: "a", x: 1, y: 2 }] })).toBe(describeDefs(d));
  });

  it("gives a fill the url of its gradient, and a plain colour as it is", () => {
    const d = doc([{ id: "a", props: { fill: gradient } }]);
    const [def] = describeDefs(d);
    expect(fillPaint(d, gradient)).toBe(`url(#${String(def?.attrs["id"])})`);
    expect(fillPaint(d, "#123456")).toBe("#123456");
    expect(fillPaint(d, "linear(90, #000)")).toBe("none");
    expect(fillPaint(d, undefined)).toBe("none");
  });

  it("gives a shadow the url of its filter, and nothing for none or a value that does not parse", () => {
    const d = doc([{ id: "a", props: { shadow: "2 4 6 #000" } }]);
    const [def] = describeDefs(d);
    expect(shadowFilter(d, "2 4 6 #000")).toBe(`url(#${String(def?.attrs["id"])})`);
    expect(shadowFilter(d, "none")).toBeUndefined();
    expect(shadowFilter(d, "oops")).toBeUndefined();
    expect(shadowFilter(d, undefined)).toBeUndefined();
  });

  it("counts the elements among some that cast a shadow", () => {
    const d = doc([{ id: "a", props: { shadow: "2 4 6 #000" } }]);
    expect(countShadowed(d, new Set(["a", "b", "gone"]))).toBe(1);
    expect(countShadowed(d, new Set(["b"]))).toBe(0);
  });
});

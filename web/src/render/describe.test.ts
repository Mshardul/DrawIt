import { describe, expect, it } from "vitest";
import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";
import { describeDiagram, type SvgNode } from "./describe.ts";

function doc(elements: DiagramElement[], layout: LayoutEntry[]): DiagramDocument {
  return {
    version: 1,
    plugins: [],
    elements,
    style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
    layout,
  };
}

const find = (node: SvgNode, tag: string): SvgNode | undefined =>
  node.tag === tag ? node : node.children.map((c) => find(c, tag)).find((n) => n !== undefined);

const texts = (node: SvgNode): string[] => [
  ...(node.text !== undefined ? [node.text] : []),
  ...node.children.flatMap(texts),
];

describe("SVG renderer, basic elements", () => {
  it("[T-012] draws a rectangle node as a group at its layout position with a rect of its size", () => {
    const [g] = describeDiagram(
      doc([{ kind: "node", id: "a", label: "A", shape: "rect" }], [{ id: "a", x: 40, y: 30, w: 200, h: 90 }]),
    );
    expect(g).toMatchObject({ tag: "g", attrs: { "data-id": "a", transform: "translate(40 30)" } });
    expect(find(g as SvgNode, "rect")?.attrs).toMatchObject({ width: 200, height: 90 });
  });

  it("[T-012] draws an ellipse node as an ellipse filling its box", () => {
    const [g] = describeDiagram(
      doc([{ kind: "node", id: "a", shape: "ellipse" }], [{ id: "a", x: 0, y: 0, w: 100, h: 60 }]),
    );
    expect(find(g as SvgNode, "ellipse")?.attrs).toMatchObject({ cx: 50, cy: 30, rx: 50, ry: 30 });
    expect(find(g as SvgNode, "rect")).toBeUndefined();
  });

  it("[T-012] draws a shape from a pack that is not installed as a rectangle", () => {
    const [g] = describeDiagram(doc([{ kind: "node", id: "a", shape: "arch.server" }], [{ id: "a", x: 0, y: 0 }]));
    expect(find(g as SvgNode, "rect")).toBeDefined();
  });

  it("[T-012] draws a decorative shape element without a label", () => {
    const [g] = describeDiagram(doc([{ kind: "shape", id: "b", shape: "ellipse" }], [{ id: "b", x: 0, y: 0 }]));
    expect(find(g as SvgNode, "ellipse")).toBeDefined();
    expect(find(g as SvgNode, "text")).toBeUndefined();
  });

  it("[T-012] uses the default size when layout has no w and h", () => {
    const [g] = describeDiagram(doc([{ kind: "node", id: "a", shape: "rect" }], [{ id: "a", x: 0, y: 0 }]));
    expect(find(g as SvgNode, "rect")?.attrs).toMatchObject({ width: 160, height: 80 });
  });

  it("[T-012] centres the node label, and defaults it to the ID", () => {
    const [a, b] = describeDiagram(
      doc(
        [
          { kind: "node", id: "a", label: "Line one\nLine two", shape: "rect" },
          { kind: "node", id: "b", shape: "rect" },
        ],
        [
          { id: "a", x: 0, y: 0, w: 100, h: 60 },
          { id: "b", x: 0, y: 0, w: 100, h: 60 },
        ],
      ),
    );
    expect(texts(a as SvgNode)).toEqual(["Line one", "Line two"]);
    expect(find(a as SvgNode, "text")?.attrs).toMatchObject({ "text-anchor": "middle" });
    expect(texts(b as SvgNode)).toEqual(["b"]);
  });

  it("[T-012] draws a text box with one line per line break at the default width", () => {
    const [g] = describeDiagram(
      doc([{ kind: "text", id: "t", content: "one\ntwo\nthree" }], [{ id: "t", x: 5, y: 6 }]),
    );
    expect(g).toMatchObject({ attrs: { transform: "translate(5 6)" } });
    expect(texts(g as SvgNode)).toEqual(["one", "two", "three"]);
    expect(find(g as SvgNode, "rect")).toBeUndefined();
  });

  it("[T-012] draws in layout order, which is z-order", () => {
    const out = describeDiagram(
      doc(
        [
          { kind: "node", id: "a", shape: "rect" },
          { kind: "node", id: "b", shape: "rect" },
        ],
        [
          { id: "b", x: 0, y: 0 },
          { id: "a", x: 0, y: 0 },
        ],
      ),
    );
    expect(out.map((g) => g.attrs["data-id"])).toEqual(["b", "a"]);
  });

  it("[T-012] skips edges, frames, images, unknown elements, elements with no layout entry and layout entries with no element", () => {
    const out = describeDiagram(
      doc(
        [
          { kind: "node", id: "a", shape: "rect" },
          { kind: "node", id: "unplaced", shape: "rect" },
          { kind: "edge", id: "e", from: "a", to: "a" },
          { kind: "frame", id: "f" },
          { kind: "image", id: "i", src: "assets/x.png" },
          { kind: "unknown", id: "u", node: { name: "chart", args: [], props: {}, children: [] } },
        ],
        [
          { id: "a", x: 0, y: 0 },
          { id: "e", x: 0, y: 0 },
          { id: "f", x: 0, y: 0 },
          { id: "i", x: 0, y: 0 },
          { id: "u", x: 0, y: 0 },
          { id: "ghost", x: 0, y: 0 },
        ],
      ),
    );
    expect(out.map((g) => g.attrs["data-id"])).toEqual(["a"]);
  });

  it("[T-012] holds no state: the same document gives equal output and the document is not changed", () => {
    const d = doc([{ kind: "node", id: "a", label: "A", shape: "ellipse" }], [{ id: "a", x: 1, y: 2 }]);
    const before = structuredClone(d);
    expect(describeDiagram(d)).toEqual(describeDiagram(d));
    expect(d).toEqual(before);
  });
});

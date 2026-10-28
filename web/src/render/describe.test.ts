import { describe, expect, it } from "vitest";
import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";
import { readFileSync } from "node:fs";
import type { PackManifest } from "../shapes/types.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { describeDiagram, type SvgNode } from "./describe.ts";
import { LINE_HEIGHT } from "./text-layout.ts";

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
  it("draws a rectangle node as a group at its layout position with a rect of its size", () => {
    const [g] = describeDiagram(
      doc([{ kind: "node", id: "a", label: "A", shape: "rect" }], [{ id: "a", x: 40, y: 30, w: 200, h: 90 }]),
      monoMeasurer,
    );
    expect(g).toMatchObject({ tag: "g", attrs: { "data-id": "a", transform: "translate(40 30)" } });
    expect(find(g as SvgNode, "rect")?.attrs).toMatchObject({ width: 200, height: 90 });
  });

  it("draws an ellipse node as an ellipse filling its box", () => {
    const [g] = describeDiagram(
      doc([{ kind: "node", id: "a", shape: "ellipse" }], [{ id: "a", x: 0, y: 0, w: 100, h: 60 }]),
      monoMeasurer,
    );
    expect(find(g as SvgNode, "ellipse")?.attrs).toMatchObject({ cx: 50, cy: 30, rx: 50, ry: 30 });
    expect(find(g as SvgNode, "rect")).toBeUndefined();
  });

  it("draws a shape from a pack that is not installed as a rectangle", () => {
    const [g] = describeDiagram(doc([{ kind: "node", id: "a", shape: "arch.server" }], [{ id: "a", x: 0, y: 0 }]), monoMeasurer);
    expect(find(g as SvgNode, "rect")).toBeDefined();
  });

  it("draws a decorative shape element without a label", () => {
    const [g] = describeDiagram(doc([{ kind: "shape", id: "b", shape: "ellipse" }], [{ id: "b", x: 0, y: 0 }]), monoMeasurer);
    expect(find(g as SvgNode, "ellipse")).toBeDefined();
    expect(find(g as SvgNode, "text")).toBeUndefined();
  });

  it("uses the default size when layout has no w and h", () => {
    const [g] = describeDiagram(doc([{ kind: "node", id: "a", shape: "rect" }], [{ id: "a", x: 0, y: 0 }]), monoMeasurer);
    expect(find(g as SvgNode, "rect")?.attrs).toMatchObject({ width: 160, height: 80 });
  });

  it("centres the node label, and defaults it to the ID", () => {
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
      monoMeasurer,
    );
    expect(texts(a as SvgNode)).toEqual(["Line one", "Line two"]);
    expect(find(a as SvgNode, "text")?.attrs).toMatchObject({ "text-anchor": "middle" });
    expect(texts(b as SvgNode)).toEqual(["b"]);
  });

  it("draws text with the text rendering the measurer uses", () => {
    const [g] = describeDiagram(
      doc([{ kind: "node", id: "a", label: "Hi", shape: "rect" }], [{ id: "a", x: 0, y: 0, w: 100, h: 60 }]),
      monoMeasurer,
    );
    expect(find(g as SvgNode, "text")?.attrs).toMatchObject({ "text-rendering": "geometricPrecision" });
  });

  it("draws a text box with one line per line break", () => {
    const [g] = describeDiagram(
      doc([{ kind: "text", id: "t", content: "one\ntwo\nthree" }], [{ id: "t", x: 5, y: 6 }]),
      monoMeasurer,
    );
    expect(g).toMatchObject({ attrs: { transform: "translate(5 6)" } });
    expect(texts(g as SvgNode)).toEqual(["one", "two", "three"]);
    expect(find(g as SvgNode, "rect")).toBeUndefined();
  });

  it("draws in layout order, which is z-order", () => {
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
      monoMeasurer,
    );
    expect(out.map((g) => g.attrs["data-id"])).toEqual(["b", "a"]);
  });

  it("skips edges, frames, images, unknown elements, elements with no layout entry and layout entries with no element", () => {
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
      monoMeasurer,
    );
    expect(out.map((g) => g.attrs["data-id"])).toEqual(["a"]);
  });

  it("holds no state: the same document gives equal output and the document is not changed", () => {
    const d = doc([{ kind: "node", id: "a", label: "A", shape: "ellipse" }], [{ id: "a", x: 1, y: 2 }]);
    const before = structuredClone(d);
    expect(describeDiagram(d, monoMeasurer)).toEqual(describeDiagram(d, monoMeasurer));
    expect(d).toEqual(before);
  });
});

const shapeIn = (pack: string, id: string) => {
  const manifest = JSON.parse(readFileSync(new URL(`../../../packs/${pack}/pack.json`, import.meta.url), "utf8")) as PackManifest;
  return manifest.shapes.find((shape) => shape.id === id);
};

const textNodes = (node: SvgNode): SvgNode[] => [...(node.tag === "text" ? [node] : []), ...node.children.flatMap(textNodes)];

describe("SVG renderer, labels", () => {
  it("wraps a label at the width of a rectangle and centres the block", () => {
    const [g] = describeDiagram(
      doc([{ kind: "node", id: "a", label: "aaaa bbbb cccc", shape: "rect" }], [{ id: "a", x: 0, y: 0, w: 100, h: 60 }]),
      monoMeasurer,
    );
    const lines = textNodes(g as SvgNode);
    expect(lines.map((t) => t.text)).toEqual(["aaaa bbbb", "cccc"]);
    expect(lines.map((t) => t.attrs["x"])).toEqual([50, 50]);
    expect(lines.map((t) => t.attrs["y"])).toEqual([30 - LINE_HEIGHT / 2, 30 + LINE_HEIGHT / 2]);
  });

  it("wraps an ellipse label at its box width", () => {
    const [g] = describeDiagram(
      doc([{ kind: "node", id: "a", label: "aaaa bbbb", shape: "ellipse" }], [{ id: "a", x: 0, y: 0, w: 50, h: 60 }]),
      monoMeasurer,
    );
    expect(textNodes(g as SvgNode).map((t) => t.text)).toEqual(["aaaa", "bbbb"]);
  });

  it("splits a word wider than the box between characters", () => {
    const [g] = describeDiagram(
      doc([{ kind: "node", id: "a", label: "abcdefgh", shape: "rect" }], [{ id: "a", x: 0, y: 0, w: 50, h: 60 }]),
      monoMeasurer,
    );
    expect(textNodes(g as SvgNode).map((t) => t.text)).toEqual(["abcde", "fgh"]);
  });

  it("keeps blank lines in a label", () => {
    const [g] = describeDiagram(
      doc([{ kind: "node", id: "a", label: "a\n\nb", shape: "rect" }], [{ id: "a", x: 0, y: 0, w: 100, h: 80 }]),
      monoMeasurer,
    );
    expect(textNodes(g as SvgNode).map((t) => t.text)).toEqual(["a", "", "b"]);
  });

  it("centres a pack shape's label in the manifest label rectangle", () => {
    const database = shapeIn("arch", "database");
    const [g] = describeDiagram(
      doc([{ kind: "node", id: "a", label: "ab", shape: "arch.database" }], [{ id: "a", x: 0, y: 0, w: 96, h: 112 }]),
      monoMeasurer,
      { shapes: (name) => (name === "arch.database" ? database : undefined) },
    );
    // The label rectangle is x 8..88, y 40..96, so its centre is (48, 68); the box centre would be (48, 56).
    expect(textNodes(g as SvgNode).map((t) => [t.attrs["x"], t.attrs["y"]])).toEqual([[48, 68]]);
  });

  it("wraps a pack shape's label at the manifest label width", () => {
    const database = shapeIn("arch", "database");
    const [g] = describeDiagram(
      doc([{ kind: "node", id: "a", label: "aaaa bbbb", shape: "arch.database" }], [{ id: "a", x: 0, y: 0, w: 96, h: 112 }]),
      monoMeasurer,
      { shapes: () => database },
    );
    // The label is 80px wide (eight characters); the 96px box would hold the nine.
    expect(textNodes(g as SvgNode).map((t) => t.text)).toEqual(["aaaa", "bbbb"]);
  });

  it("draws text in the default font and the weight, style and size that were measured", () => {
    const [g] = describeDiagram(
      doc([{ kind: "node", id: "a", label: "Hi", shape: "rect" }], [{ id: "a", x: 0, y: 0, w: 100, h: 60 }]),
      monoMeasurer,
    );
    expect(textNodes(g as SvgNode)[0]?.attrs).toMatchObject({
      "font-family": '"Inter"',
      "font-size": 14,
      "font-weight": 400,
      "font-style": "normal",
    });
  });
});

describe("SVG renderer, text boxes", () => {
  it("a text box with no width is one line per line break, set from its left edge", () => {
    const [g] = describeDiagram(
      doc([{ kind: "text", id: "t", content: "one\ntwo" }], [{ id: "t", x: 5, y: 6 }]),
      monoMeasurer,
    );
    const lines = textNodes(g as SvgNode);
    expect(lines.map((t) => t.text)).toEqual(["one", "two"]);
    expect(lines.map((t) => [t.attrs["x"], t.attrs["text-anchor"]])).toEqual([[0, "start"], [0, "start"]]);
    expect(lines.map((t) => t.attrs["y"])).toEqual([LINE_HEIGHT / 2, LINE_HEIGHT + LINE_HEIGHT / 2]);
  });

  it("a text box with a width wraps there", () => {
    const [g] = describeDiagram(
      doc([{ kind: "text", id: "t", content: "aa bb cc dd" }], [{ id: "t", x: 0, y: 0, w: 50 }]),
      monoMeasurer,
    );
    expect(textNodes(g as SvgNode).map((t) => t.text)).toEqual(["aa bb", "cc dd"]);
  });
});

describe("SVG renderer, text being edited", () => {
  it("leaves out the text of an element whose text is hidden and keeps its outline", () => {
    const d = doc(
      [
        { kind: "node", id: "a", label: "Hi", shape: "rect" },
        { kind: "node", id: "b", label: "Yo", shape: "rect" },
      ],
      [
        { id: "a", x: 0, y: 0, w: 100, h: 60 },
        { id: "b", x: 0, y: 0, w: 100, h: 60 },
      ],
    );
    const [a, b] = describeDiagram(d, monoMeasurer, { hideText: new Set(["a"]) });
    expect(textNodes(a as SvgNode)).toEqual([]);
    expect(find(a as SvgNode, "rect")).toBeDefined();
    expect(textNodes(b as SvgNode).map((t) => t.text)).toEqual(["Yo"]);
  });

  it("leaves out the text of a text box that is hidden", () => {
    const [g] = describeDiagram(doc([{ kind: "text", id: "t", content: "hello" }], [{ id: "t", x: 0, y: 0 }]), monoMeasurer, {
      hideText: new Set(["t"]),
    });
    expect(textNodes(g as SvgNode)).toEqual([]);
  });

  it("limits the output to the elements in `only`", () => {
    const d = doc(
      [
        { kind: "node", id: "a", shape: "rect" },
        { kind: "node", id: "b", shape: "rect" },
      ],
      [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 0, y: 0 },
      ],
    );
    expect(describeDiagram(d, monoMeasurer, { only: new Set(["b"]) }).map((g) => g.attrs["data-id"])).toEqual(["b"]);
  });
});

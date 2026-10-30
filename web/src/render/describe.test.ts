import { describe, expect, it } from "vitest";
import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";
import { readFileSync } from "node:fs";
import type { PackManifest } from "../shapes/types.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { describeDefs } from "./defs.ts";
import { describeDiagram, type SvgNode } from "./describe.ts";
import { DEFAULT_LOOK } from "../style/text-look.ts";

const LINE_HEIGHT = DEFAULT_LOOK.lineHeight;

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

  it("skips frames, images, unknown elements, elements with no layout entry and layout entries with no element", () => {
    const out = describeDiagram(
      doc(
        [
          { kind: "node", id: "a", shape: "rect" },
          { kind: "node", id: "unplaced", shape: "rect" },
          { kind: "frame", id: "f" },
          { kind: "image", id: "i", src: "assets/x.png" },
          { kind: "unknown", id: "u", node: { name: "chart", args: [], props: {}, children: [] } },
        ],
        [
          { id: "a", x: 0, y: 0 },
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

describe("SVG renderer, edges", () => {
  const a: DiagramElement = { kind: "node", id: "a", shape: "rect" };
  const b: DiagramElement = { kind: "node", id: "b", shape: "rect" };
  const e: DiagramElement = { kind: "edge", id: "a->b", from: "a", to: "b" };
  const nodes: LayoutEntry[] = [
    { id: "a", x: 0, y: 0, w: 100, h: 50 },
    { id: "b", x: 300, y: 0, w: 100, h: 50 },
  ];
  const edgeGroup = (d: DiagramDocument): SvgNode => describeDiagram(d, monoMeasurer).find((g) => g.attrs["data-id"] === "a->b") as SvgNode;

  it("draws an edge as a group with its path, and an arrow at the end by default", () => {
    const g = edgeGroup(doc([a, b, e], nodes));
    expect(find(g, "path")?.attrs).toMatchObject({ d: "M100 25L300 25", fill: "none" });
    expect(find(g, "polygon")?.attrs["points"]).toBe("300,25 290,29 290,21");
    expect(g.attrs["transform"]).toBeUndefined();
  });

  it("draws the edge in layout order with the shapes, and an edge with no layout entry on top", () => {
    const layout = [nodes[0] as LayoutEntry, { id: "a->b", x: 0, y: 0 }, nodes[1] as LayoutEntry];
    expect(describeDiagram(doc([a, b, e], layout), monoMeasurer).map((g) => g.attrs["data-id"])).toEqual(["a", "a->b", "b"]);
    expect(describeDiagram(doc([a, b, e], nodes), monoMeasurer).map((g) => g.attrs["data-id"])).toEqual(["a", "b", "a->b"]);
  });

  it("draws a head at each end as the style says", () => {
    const d = doc([a, b, e], nodes);
    d.style.overrides.push({ id: "a->b", props: { headStart: "dot", headEnd: "none" } });
    const g = edgeGroup(d);
    expect(find(g, "polygon")).toBeUndefined();
    expect(find(g, "circle")?.attrs).toMatchObject({ cx: 96, cy: 25, r: 4 });
  });

  it("draws an elbow edge along the right angles", () => {
    const d = doc([a, b, e], [nodes[0] as LayoutEntry, { id: "b", x: 300, y: 100, w: 100, h: 50 }]);
    d.style.overrides.push({ id: "a->b", props: { route: "elbow" } });
    expect(find(edgeGroup(d), "path")?.attrs["d"]).toBe("M100 25L200 25L200 125L300 125");
  });

  const labelled = (label: string | undefined, entry: Partial<LayoutEntry> = {}, hide = false): SvgNode => {
    const edge: DiagramElement = { kind: "edge", id: "a->b", from: "a", to: "b", ...(label !== undefined && { label }) };
    const d = doc([a, b, edge], [...nodes, { id: "a->b", x: 0, y: 0, ...entry }]);
    return describeDiagram(d, monoMeasurer, hide ? { hideText: new Set(["a->b"]) } : {}).find((g) => g.attrs["data-id"] === "a->b") as SvgNode;
  };

  it("draws a label centred on the middle of the path, over a background that breaks the line", () => {
    const g = labelled("Hi");
    expect(texts(g)).toEqual(["Hi"]);
    expect(find(g, "text")?.attrs).toMatchObject({ x: 200, y: 25, "text-anchor": "middle" });
    expect(g.children.map((c) => c.tag).slice(-2)).toEqual(["rect", "text"]);
    expect(find(g, "rect")?.attrs).toMatchObject({ x: 186, y: 9, width: 28, height: 32, fill: "#ffffff" });
  });

  it("puts the label at its position along the path", () => {
    expect(find(labelled("Hi", { labelAt: 0.25 }), "text")?.attrs).toMatchObject({ x: 150, y: 25 });
  });

  it("draws one line of text per line break and never wraps", () => {
    expect(texts(labelled("a\nbb"))).toEqual(["a", "bb"]);
  });

  it("draws nothing for a missing or empty label", () => {
    for (const g of [labelled(undefined), labelled("")]) {
      expect(find(g, "text")).toBeUndefined();
      expect(find(g, "rect")).toBeUndefined();
    }
  });

  it("leaves out the label, and its background, while its text is being edited", () => {
    const g = labelled("Hi", {}, true);
    expect(find(g, "text")).toBeUndefined();
    expect(find(g, "rect")).toBeUndefined();
    expect(find(g, "path")).toBeDefined();
  });

  it("does not draw an edge it cannot route", () => {
    const d = doc([a, { kind: "edge", id: "a->b", from: "a", to: "b" }], [nodes[0] as LayoutEntry]);
    expect(describeDiagram(d, monoMeasurer).map((g) => g.attrs["data-id"])).toEqual(["a"]);
  });

  it("describes only the edges in `only`", () => {
    const out = describeDiagram(doc([a, b, e], nodes), monoMeasurer, { only: new Set(["a->b"]) });
    expect(out.map((g) => g.attrs["data-id"])).toEqual(["a->b"]);
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

describe("SVG renderer, fill, stroke and opacity", () => {
  const withStyle = (
    elements: DiagramElement[],
    layout: LayoutEntry[],
    style: Partial<DiagramDocument["style"]>,
  ): DiagramDocument => {
    const d = doc(elements, layout);
    return { ...d, style: { ...d.style, ...style } };
  };
  const box = (id: string): LayoutEntry => ({ id, x: 0, y: 0, w: 100, h: 50 });
  const group = (d: DiagramDocument, id: string): SvgNode =>
    describeDiagram(d, monoMeasurer).find((g) => g.attrs["data-id"] === id) as SvgNode;
  const a: DiagramElement = { kind: "node", id: "a", shape: "rect" };

  it("draws a node with the colours of the default theme", () => {
    expect(find(group(doc([a], [box("a")]), "a"), "rect")?.attrs).toMatchObject({
      fill: "#dbe8f5",
      stroke: "#1f4e79",
      "stroke-width": 1.5,
    });
  });

  it("takes fill, stroke and stroke width from an override, raw or by token", () => {
    const d = withStyle([a], [box("a")], {
      overrides: [{ id: "a", props: { fill: "#ff0000", stroke: "$accent", strokeWidth: 4 } }],
    });
    expect(find(group(d, "a"), "rect")?.attrs).toMatchObject({ fill: "#ff0000", stroke: "#e8732a", "stroke-width": 4 });
  });

  it("takes a colour from a class and from the file's own theme", () => {
    const d = withStyle([{ ...a, class: "warm" }], [box("a")], {
      theme: { name: "default", colors: { accent: "#00ff00" }, fonts: {}, sizes: {}, spaces: {} },
      classes: [{ name: "warm", props: { fill: "$accent" } }],
    });
    expect(find(group(d, "a"), "rect")?.attrs["fill"]).toBe("#00ff00");
  });

  it("draws no fill where a token is defined nowhere", () => {
    const d = withStyle([a], [box("a")], { overrides: [{ id: "a", props: { fill: "$nowhere" } }] });
    expect(find(group(d, "a"), "rect")?.attrs["fill"]).toBe("none");
  });

  it("rounds the corners of a rectangle by radius", () => {
    const d = withStyle([a], [box("a")], { overrides: [{ id: "a", props: { radius: 8 } }] });
    expect(find(group(d, "a"), "rect")?.attrs).toMatchObject({ rx: 8, ry: 8 });
  });

  it("leaves the corners square by default", () => {
    expect(find(group(doc([a], [box("a")]), "a"), "rect")?.attrs["rx"]).toBeUndefined();
  });

  it("sets opacity on the element's group only when it is not 1", () => {
    const faded = withStyle([a], [box("a")], { overrides: [{ id: "a", props: { opacity: 0.4 } }] });
    expect(group(faded, "a").attrs["opacity"]).toBe(0.4);
    expect(group(doc([a], [box("a")]), "a").attrs["opacity"]).toBeUndefined();
  });

  it("draws an ellipse with the same fill and stroke", () => {
    const e: DiagramElement = { kind: "node", id: "e", shape: "ellipse" };
    const d = withStyle([e], [box("e")], { overrides: [{ id: "e", props: { fill: "#123456" } }] });
    expect(find(group(d, "e"), "ellipse")?.attrs).toMatchObject({ fill: "#123456", stroke: "#1f4e79" });
  });

  it("draws a text box with no background by default", () => {
    const t: DiagramElement = { kind: "text", id: "t", content: "Hi" };
    expect(find(group(doc([t], [{ id: "t", x: 0, y: 0, w: 100 }]), "t"), "rect")).toBeUndefined();
  });

  it("draws a text box background, rounded, when the style gives it a fill or stroke", () => {
    const t: DiagramElement = { kind: "text", id: "t", content: "Hi" };
    const d = withStyle([t], [{ id: "t", x: 0, y: 0, w: 100 }], {
      overrides: [{ id: "t", props: { fill: "$surface", stroke: "$ink", radius: 6 } }],
    });
    const g = group(d, "t");
    expect(g.children[0]?.tag).toBe("rect");
    expect(find(g, "rect")?.attrs).toMatchObject({ fill: "#dbe8f5", stroke: "#1a1a1a", rx: 6, height: LINE_HEIGHT });
  });

  describe("edges", () => {
    const b: DiagramElement = { kind: "node", id: "b", shape: "rect" };
    const e: DiagramElement = { kind: "edge", id: "a->b", from: "a", to: "b", label: "Hi" };
    const layout: LayoutEntry[] = [box("a"), { id: "b", x: 300, y: 0, w: 100, h: 50 }];

    it("draws the path and its arrowhead in the ink colour at the default width", () => {
      const g = group(doc([a, b, e], layout), "a->b");
      expect(find(g, "path")?.attrs).toMatchObject({ stroke: "#1a1a1a", "stroke-width": 1.5 });
      expect(find(g, "polygon")?.attrs["fill"]).toBe("#1a1a1a");
    });

    it("takes stroke and width from the style, for the line and its heads", () => {
      const d = withStyle([a, b, e], layout, {
        overrides: [{ id: "a->b", props: { stroke: "$accent", strokeWidth: 3, headStart: "dot" } }],
      });
      const g = group(d, "a->b");
      expect(find(g, "path")?.attrs).toMatchObject({ stroke: "#e8732a", "stroke-width": 3 });
      expect(find(g, "polygon")?.attrs["fill"]).toBe("#e8732a");
      expect(find(g, "circle")?.attrs["fill"]).toBe("#e8732a");
    });

    it("sets opacity on the edge's group", () => {
      const d = withStyle([a, b, e], layout, { overrides: [{ id: "a->b", props: { opacity: 0.5 } }] });
      expect(group(d, "a->b").attrs["opacity"]).toBe(0.5);
    });

    it("draws the label background in the paper colour of the theme", () => {
      const d = withStyle([a, b, e], layout, {
        theme: { name: "default", colors: { paper: "#fafafa" }, fonts: {}, sizes: {}, spaces: {} },
      });
      expect(find(group(d, "a->b"), "rect")?.attrs["fill"]).toBe("#fafafa");
    });
  });
});

describe("SVG renderer, text styles", () => {
  const styled = (elements: DiagramElement[], layout: LayoutEntry[], overrides: Record<string, object>): DiagramDocument => {
    const d = doc(elements, layout);
    return { ...d, style: { ...d.style, overrides: Object.entries(overrides).map(([id, props]) => ({ id, props })) } };
  };

  it("draws a label in its font, size, weight, italic, underline and colour", () => {
    const [g] = describeDiagram(
      styled(
        [{ kind: "node", id: "a", label: "A", shape: "rect" }],
        [{ id: "a", x: 0, y: 0, w: 100, h: 60 }],
        { a: { font: "JetBrains Mono", size: 20, weight: 700, italic: true, underline: true, color: "#ff0000" } },
      ),
      monoMeasurer,
    );
    expect(textNodes(g as SvgNode)[0]?.attrs).toMatchObject({
      "font-family": '"JetBrains Mono"',
      "font-size": 20,
      "font-weight": 700,
      "font-style": "italic",
      "text-decoration": "underline",
      fill: "#ff0000",
    });
  });

  it("draws text with no underline when the style has none", () => {
    const [g] = describeDiagram(doc([{ kind: "node", id: "a", label: "A", shape: "rect" }], [{ id: "a", x: 0, y: 0, w: 100, h: 60 }]), monoMeasurer);
    expect(textNodes(g as SvgNode)[0]?.attrs).not.toHaveProperty("text-decoration");
  });

  it("anchors a label at the left, centre or right of its area by alignment", () => {
    const at = (align: string): unknown[] => {
      const [g] = describeDiagram(
        styled([{ kind: "node", id: "a", label: "A", shape: "rect" }], [{ id: "a", x: 0, y: 0, w: 100, h: 60 }], { a: { align } }),
        monoMeasurer,
      );
      const t = textNodes(g as SvgNode)[0];
      return [t?.attrs["x"], t?.attrs["text-anchor"]];
    };
    expect([at("left"), at("center"), at("right")]).toEqual([[0, "start"], [50, "middle"], [100, "end"]]);
  });

  it("anchors a text box at its right edge when right aligned, and spaces lines by the line height", () => {
    const [g] = describeDiagram(
      styled([{ kind: "text", id: "t", content: "a\nb" }], [{ id: "t", x: 0, y: 0, w: 80 }], { t: { align: "right", lineHeight: 40 } }),
      monoMeasurer,
    );
    const lines = textNodes(g as SvgNode);
    expect(lines.map((l) => [l.attrs["x"], l.attrs["text-anchor"], l.attrs["y"]])).toEqual([[80, "end", 20], [80, "end", 60]]);
  });

  it("draws an edge label in the edge's text style", () => {
    const d = styled(
      [{ kind: "node", id: "a", shape: "rect" }, { kind: "node", id: "b", shape: "rect" }, { kind: "edge", id: "e", from: "a", to: "b", label: "Hi" }],
      [{ id: "a", x: 0, y: 0, w: 100, h: 50 }, { id: "b", x: 200, y: 0, w: 100, h: 50 }],
      { e: { size: 18, color: "#00aa00", weight: 700 } },
    );
    const edge = describeDiagram(d, monoMeasurer).find((g) => g.attrs["data-id"] === "e");
    expect(textNodes(edge as SvgNode)[0]?.attrs).toMatchObject({ "font-size": 18, "font-weight": 700, fill: "#00aa00" });
  });
});

describe("SVG renderer, dash, gradient and shadow", () => {
  const withProps = (id: string, props: object, elements: DiagramElement[]): DiagramDocument => {
    const d = doc(elements, [
      { id: "a", x: 0, y: 0, w: 100, h: 50 },
      { id: "b", x: 300, y: 0, w: 100, h: 50 },
    ]);
    return { ...d, style: { ...d.style, overrides: [{ id, props }] } };
  };
  const a: DiagramElement = { kind: "node", id: "a", shape: "rect" };
  const b: DiagramElement = { kind: "node", id: "b", shape: "rect" };
  const e: DiagramElement = { kind: "edge", id: "a->b", from: "a", to: "b" };
  const group = (d: DiagramDocument, id: string, options = {}): SvgNode =>
    describeDiagram(d, monoMeasurer, options).find((g) => g.attrs["data-id"] === id) as SvgNode;

  it("draws no dash array for a solid line, and a width-relative one for dashed and dotted", () => {
    expect(find(group(withProps("a", {}, [a]), "a"), "rect")?.attrs["stroke-dasharray"]).toBeUndefined();
    const dashed = withProps("a", { dash: "dashed", strokeWidth: 2 }, [a]);
    expect(find(group(dashed, "a"), "rect")?.attrs["stroke-dasharray"]).toBe("8 6");
    const dotted = withProps("a", { dash: "dotted", strokeWidth: 2 }, [a]);
    expect(find(group(dotted, "a"), "rect")?.attrs["stroke-dasharray"]).toBe("2 4");
  });

  it("dashes an edge and an ellipse", () => {
    const edge = withProps("a->b", { dash: "dashed", strokeWidth: 1 }, [a, b, e]);
    expect(find(group(edge, "a->b"), "path")?.attrs["stroke-dasharray"]).toBe("4 3");
    const ellipse = withProps("a", { dash: "dashed", strokeWidth: 1 }, [{ kind: "node", id: "a", shape: "ellipse" }]);
    expect(find(group(ellipse, "a"), "ellipse")?.attrs["stroke-dasharray"]).toBe("4 3");
  });

  it("fills with the gradient a fill names, and draws no fill where it does not parse", () => {
    const d = withProps("a", { fill: "linear(90, #000, #fff)" }, [a]);
    const [def] = describeDefs(d);
    expect(find(group(d, "a"), "rect")?.attrs["fill"]).toBe(`url(#${String(def?.attrs["id"])})`);
    const bad = withProps("a", { fill: "linear(90, #000)" }, [a]);
    expect(find(group(bad, "a"), "rect")?.attrs["fill"]).toBe("none");
  });

  it("puts a shadow on the element's group, and none where the element has no shadow", () => {
    const d = withProps("a", { shadow: "2 4 6 #000" }, [a, b]);
    const [def] = describeDefs(d);
    expect(group(d, "a").attrs["filter"]).toBe(`url(#${String(def?.attrs["id"])})`);
    expect(group(d, "b").attrs["filter"]).toBeUndefined();
  });

  it("shadows an edge and a text box", () => {
    const edge = withProps("a->b", { shadow: "1 1 2 #000" }, [a, b, e]);
    expect(group(edge, "a->b").attrs["filter"]).toMatch(/^url\(#/);
    const t = withProps("a", { shadow: "1 1 2 #000" }, [{ kind: "text", id: "a", content: "x" }]);
    expect(group(t, "a").attrs["filter"]).toMatch(/^url\(#/);
  });

  it("leaves the filter off when asked for a plain render", () => {
    const d = withProps("a", { shadow: "2 4 6 #000" }, [a]);
    expect(group(d, "a", { plain: true }).attrs["filter"]).toBeUndefined();
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DiagramDocument } from "../model/index.ts";
import { diagramBounds } from "../render/bounds.ts";
import type { SvgNode } from "../render/describe.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { exportSvg, serialiseSvg } from "./svg.ts";

const tree: SvgNode[] = [
  {
    tag: "g",
    attrs: { "data-id": "a", transform: "translate(10 20)" },
    children: [
      { tag: "rect", attrs: { width: 30, height: 40, fill: "none" }, children: [] },
      { tag: "text", attrs: { x: 15, y: 20 }, text: "A & B", children: [] },
    ],
  },
];

const defs: SvgNode[] = [
  {
    tag: "linearGradient",
    attrs: { id: "paint", x1: 0, y1: 0, x2: 1, y2: 1 },
    children: [{ tag: "stop", attrs: { offset: 0, "stop-color": "#112233" }, children: [] }],
  },
];

describe("svg serialiser", () => {
  it("matches the golden file", () => {
    const svg = serialiseSvg({
      nodes: tree,
      defs,
      viewBox: { x: -6, y: -4, w: 62, h: 80 },
      title: "Net & work",
      description: "A diagram",
    });
    expect(svg).toBe(readFileSync(new URL("./golden/basic.svg", import.meta.url), "utf8"));
  });
});

const diagram = (): DiagramDocument => ({
  version: 1,
  title: "Boxes",
  plugins: [],
  elements: [
    { kind: "node", id: "a", label: "A", shape: "rect" },
    { kind: "node", id: "b", label: "B", shape: "rect" },
  ],
  style: {
    theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} },
    classes: [],
    overrides: [{ id: "a", props: { fill: "linear(90, #112233, #abcdef)" } }],
  },
  layout: [
    { id: "a", x: 40, y: 30, w: 80, h: 40 },
    { id: "b", x: 200, y: 30, w: 80, h: 40 },
  ],
});

describe("svg export", () => {
  it("frames the drawn bounds with 16 px of padding, for the canvas or a selection", () => {
    const doc = diagram();
    const box = (bounds: { x: number; y: number; w: number; h: number }): string =>
      `viewBox="${String(bounds.x - 16)} ${String(bounds.y - 16)} ${String(bounds.w + 32)} ${String(bounds.h + 32)}"`;
    const whole = exportSvg(doc, monoMeasurer, { title: "Boxes", description: "Everything" });
    const bounds = diagramBounds(doc, monoMeasurer, () => ({ status: "missing" }));
    if (!bounds) throw new Error("no bounds");
    expect(whole).toContain(box(bounds));
    expect(whole).toContain("<title>Boxes</title>");
    expect(whole).toContain("<desc>Everything</desc>");
    expect(whole).toContain("text { white-space: pre; }");
    expect(whole).toContain('data-id="a"');
    expect(whole).toContain('data-id="b"');
    expect(whole).toContain("<linearGradient");

    const selected = exportSvg(doc, monoMeasurer, { title: "Boxes", description: "One", ids: new Set(["a"]) });
    const one = diagramBounds(doc, monoMeasurer, () => ({ status: "missing" }), new Set(["a"]));
    if (!one) throw new Error("no bounds");
    expect(selected).toContain(box(one));
    expect(selected).toContain('data-id="a"');
    expect(selected).not.toContain('data-id="b"');
  });
});

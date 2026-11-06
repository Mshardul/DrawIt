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
    const bounds = diagramBounds(doc, monoMeasurer, () => ({ status: "failed" }));
    if (!bounds) throw new Error("no bounds");
    expect(whole).toContain(box(bounds));
    expect(whole).toContain("<title>Boxes</title>");
    expect(whole).toContain("<desc>Everything</desc>");
    expect(whole).toContain("text { white-space: pre; }");
    expect(whole).toContain('data-id="a"');
    expect(whole).toContain('data-id="b"');
    expect(whole).toContain("<linearGradient");

    const selected = exportSvg(doc, monoMeasurer, { title: "Boxes", description: "One", ids: new Set(["a"]) });
    const one = diagramBounds(doc, monoMeasurer, () => ({ status: "failed" }), new Set(["a"]));
    if (!one) throw new Error("no bounds");
    expect(selected).toContain(box(one));
    expect(selected).toContain('data-id="a"');
    expect(selected).not.toContain('data-id="b"');
  });

  it("exports everything overlapping a frame, clipped to the frame, with its name outside the clip", () => {
    const doc: DiagramDocument = {
      version: 1,
      title: "Regions",
      plugins: [],
      elements: [
        { kind: "frame", id: "region", name: "Overview" },
        { kind: "node", id: "inside", label: "In", shape: "rect" },
        { kind: "node", id: "left", label: "L", shape: "rect" },
        { kind: "node", id: "right", label: "R", shape: "rect" },
        { kind: "node", id: "away", label: "Out", shape: "rect" },
        { kind: "edge", id: "cross", from: "left", to: "right" },
      ],
      style: {
        theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} },
        classes: [],
        overrides: [{ id: "inside", props: { shadow: "0 8 8 #000000" } }],
      },
      layout: [
        { id: "region", x: 100, y: 100, w: 200, h: 120 },
        { id: "inside", x: 140, y: 130, w: 40, h: 40 },
        { id: "left", x: 0, y: 130, w: 40, h: 40 },
        { id: "right", x: 400, y: 130, w: 40, h: 40 },
        { id: "away", x: 800, y: 800, w: 40, h: 40 },
      ],
    };
    const svg = exportSvg(doc, monoMeasurer, { title: "Regions", description: "A frame", frame: "region" });
    expect(svg).toContain('viewBox="84 60 232 176"');
    expect(svg).toMatch(/<clipPath id="frame-region">\s*<rect x="100" y="100" width="200" height="120"\/>\s*<\/clipPath>/);
    const clipped = elementGroup(svg, '<g clip-path="url(#frame-region)">');
    expect(clipped).toContain('data-id="inside"');
    expect(clipped).toContain('data-id="cross"');
    expect(clipped).toContain('data-id="region"');
    expect(clipped).toContain("filter=");
    expect(clipped).not.toContain(">Overview<");
    expect(clipped).not.toContain('data-id="left"');
    expect(clipped).not.toContain('data-id="right"');
    expect(clipped).not.toContain('data-id="away"');
    const name = svg.slice(svg.indexOf(clipped) + clipped.length);
    expect(name).toContain(">Overview<");
    expect(name).not.toContain("clip-path");
  });
});

/** The element that starts at `open`, including its matching close tag. */
function elementGroup(svg: string, open: string): string {
  const start = svg.indexOf(open);
  if (start < 0) return "";
  const rest = svg.slice(start);
  const tags = /<\/?g\b[^>]*>/g;
  let depth = 0;
  for (const match of rest.matchAll(tags)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return rest.slice(0, match.index + match[0].length);
  }
  return "";
}

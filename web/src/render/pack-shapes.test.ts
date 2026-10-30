import { describe, expect, it } from "vitest";
import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";
import { createPackLoader, type PackFiles } from "../shapes/pack-loader.ts";
import type { ShapeManifest } from "../shapes/types.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { describeDefs } from "./defs.ts";
import { describeDiagram, type SvgNode } from "./describe.ts";

function doc(elements: DiagramElement[], layout: LayoutEntry[], props: object = {}): DiagramDocument {
  return {
    version: 1,
    plugins: [],
    elements,
    style: {
      theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} },
      classes: [],
      overrides: Object.keys(props).length === 0 ? [] : [{ id: "a", props }],
    },
    layout,
  };
}

const find = (node: SvgNode, tag: string): SvgNode | undefined =>
  node.tag === tag ? node : node.children.map((c) => find(c, tag)).find((n) => n !== undefined);
const all = (node: SvgNode, tag: string): SvgNode[] => [...(node.tag === tag ? [node] : []), ...node.children.flatMap((c) => all(c, tag))];

const node = (shape: string): DiagramElement => ({ kind: "node", id: "a", shape });
const draw = (d: DiagramDocument, options = {}): SvgNode => describeDiagram(d, monoMeasurer, options)[0] as SvgNode;
const at = (w?: number, h?: number): LayoutEntry => ({ id: "a", x: 10, y: 20, ...(w !== undefined && { w }), ...(h !== undefined && { h }) });

describe("SVG renderer, pack shapes", () => {
  it("draws a pack shape from its SVG stretched to the element size, by full name or core name", () => {
    for (const shape of ["core.rounded-rect", "rounded-rect"]) {
      const g = draw(doc([node(shape)], [at(200, 100)]));
      expect(g.attrs["transform"]).toBe("translate(10 20)");
      expect(find(g, "path")?.attrs["d"]).toMatch(/^M 8 0 H 192 C/);
      expect(find(g, "rect")).toBeUndefined();
    }
  });

  it("draws a fill part in the element's fill and stroke, and leaves no role in the output", () => {
    const part = find(draw(doc([node("rounded-rect")], [at(200, 100)])), "path");
    expect(part?.attrs).toMatchObject({ fill: "#dbe8f5", stroke: "#1f4e79", "stroke-width": 1.5 });
    expect(part?.attrs["data-role"]).toBeUndefined();
  });

  it("takes the colours of an override, and the paint of a gradient fill", () => {
    const red = find(draw(doc([node("rounded-rect")], [at(200, 100)], { fill: "#ff0000", stroke: "#00ff00", strokeWidth: 4 })), "path");
    expect(red?.attrs).toMatchObject({ fill: "#ff0000", stroke: "#00ff00", "stroke-width": 4 });
    const d = doc([node("rounded-rect")], [at(200, 100)], { fill: "linear(90, #000, #fff)" });
    const [def] = describeDefs(d);
    expect(find(draw(d), "path")?.attrs["fill"]).toBe(`url(#${String(def?.attrs["id"])})`);
  });

  it("draws a detail part in the stroke colour at two thirds of the stroke width, with no fill", () => {
    const parts = all(draw(doc([node("arch.database")], [at(96, 112)], { stroke: "#00ff00", strokeWidth: 3 })), "path");
    expect(parts[0]?.attrs).toMatchObject({ "stroke-width": 3 });
    expect(parts[1]?.attrs).toMatchObject({ fill: "none", stroke: "#00ff00", "stroke-width": 2 });
  });

  it("dashes the fill part and leaves the detail part solid", () => {
    const parts = all(draw(doc([node("arch.database")], [at(96, 112)], { dash: "dashed", strokeWidth: 2 })), "path");
    expect(parts[0]?.attrs["stroke-dasharray"]).toBe("8 6");
    expect(parts[1]?.attrs["stroke-dasharray"]).toBeUndefined();
  });

  it("joins and caps strokes round", () => {
    expect(draw(doc([node("rounded-rect")], [at(200, 100)])).children[0]?.attrs).toMatchObject({
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    });
  });

  it("draws a decorative shape element from its pack", () => {
    const g = draw(doc([{ kind: "shape", id: "a", shape: "rounded-rect" }], [at(200, 100)]));
    expect(find(g, "path")?.attrs["d"]).toMatch(/^M 8 0 H 192/);
    expect(find(g, "text")).toBeUndefined();
  });
});

describe("SVG renderer, pack shapes with their own packs", () => {
  const shape = (id: string, svg: string, size: number, keepAspect: boolean): ShapeManifest => ({
    id,
    name: id,
    category: "Basic",
    tags: [id],
    svg: `${id}.svg`,
    size: { w: size, h: size },
    outline: `M 0 0 H ${String(size)} V ${String(size)} H 0 Z`,
    anchors: { top: { x: size / 2, y: 0 }, right: { x: size, y: size / 2 }, bottom: { x: size / 2, y: size }, left: { x: 0, y: size / 2 } },
    label: { x: 0, y: 0, w: size, h: size },
    keepAspect,
  });
  const files = (): PackFiles => {
    const svg = (parts: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${parts}</svg>`;
    const shapes = [shape("icon", "", 64, true), shape("line", "", 64, false)];
    return {
      folder: "own",
      manifest: JSON.stringify({ pack: "own", version: 1, shapes }),
      svgs: {
        "icon.svg": svg('<rect data-role="fill" x="0" y="0" width="64" height="64"/>'),
        "line.svg": svg('<path data-role="stroke" d="M 0 32 H 64"/><g><circle data-role="detail" cx="32" cy="32" r="8"/></g>'),
      },
    };
  };
  const packs = createPackLoader([files()]);

  it("draws a stroke part in the stroke with no fill", () => {
    const part = find(draw(doc([node("own.line")], [at(100, 50)], { fill: "#ff0000", stroke: "#00ff00" }), { packs }), "path");
    expect(part?.attrs).toMatchObject({ fill: "none", stroke: "#00ff00", "stroke-width": 1.5 });
  });

  it("draws a part nested in a group", () => {
    const circle = find(draw(doc([node("own.line")], [at(100, 50)], { stroke: "#00ff00", strokeWidth: 3 }), { packs }), "ellipse");
    expect(circle?.attrs).toMatchObject({ fill: "none", stroke: "#00ff00", "stroke-width": 2 });
  });

  it("centres a keep-aspect shape in the element's box", () => {
    const g = draw(doc([node("own.icon")], [at(128, 64)]), { packs });
    const inner = g.children[0] as SvgNode;
    expect(inner.attrs["transform"]).toBe("translate(32 0)");
    expect(find(inner, "rect")?.attrs).toMatchObject({ width: "64", height: "64" });
  });

  it("does not offset a shape that fills its box", () => {
    const inner = draw(doc([node("own.line")], [at(128, 64)]), { packs }).children[0] as SvgNode;
    expect(inner.attrs["transform"]).toBeUndefined();
  });
});

describe("SVG renderer, unknown shapes", () => {
  it("draws a dashed placeholder at the layout size showing the shape name", () => {
    const g = draw(doc([node("net.router")], [at(120, 60)]));
    expect(find(g, "rect")?.attrs).toMatchObject({ width: 120, height: 60, fill: "none", "stroke-dasharray": "6 4" });
    expect(all(g, "text").map((t) => t.text)).toEqual(["net.router"]);
  });

  it("uses the standard default size when the layout has no size", () => {
    expect(find(draw(doc([node("net.router")], [at()])), "rect")?.attrs).toMatchObject({ width: 160, height: 80 });
  });

  it("is a placeholder for a pack shape written without its pack, and for a decorative shape", () => {
    expect(find(draw(doc([node("server")], [at(100, 50)])), "rect")?.attrs["stroke-dasharray"]).toBe("6 4");
    expect(find(draw(doc([{ kind: "shape", id: "a", shape: "arch.nope" }], [at(100, 50)])), "rect")?.attrs["stroke-dasharray"]).toBe("6 4");
  });

  it("shows the shape name and not the label", () => {
    const labelled: DiagramElement = { kind: "node", id: "a", label: "Router", shape: "net.router" };
    expect(all(draw(doc([labelled], [at(120, 60)])), "text").map((t) => t.text)).toEqual(["net.router"]);
  });

  it("keeps the name while the node's text is being edited", () => {
    const labelled: DiagramElement = { kind: "node", id: "a", label: "Router", shape: "net.router" };
    const g = draw(doc([labelled], [at(120, 60)]), { hideText: new Set(["a"]) });
    expect(all(g, "text").map((t) => t.text)).toEqual(["net.router"]);
  });

  it("does not make a placeholder of a rectangle or an ellipse, with or without core", () => {
    for (const shape of ["rect", "core.rect", "ellipse", "core.ellipse"]) {
      expect(find(draw(doc([node(shape)], [at(100, 50)])), shape.endsWith("rect") ? "rect" : "ellipse")?.attrs["stroke-dasharray"], shape).toBeUndefined();
    }
  });
});

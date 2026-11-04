import { describe, expect, it } from "vitest";
import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { diagramBounds } from "./bounds.ts";
import type { ImageLookup } from "./images.ts";

const images: ImageLookup = () => ({ status: "loading" });
const ready: ImageLookup = () => ({ status: "ready", url: "blob:pic", w: 30, h: 10 });

function doc(elements: DiagramElement[], layout: LayoutEntry[], overrides: DiagramDocument["style"]["overrides"] = []): DiagramDocument {
  return {
    version: 1,
    plugins: [],
    elements,
    style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides },
    layout,
  };
}

const bounds = (elements: DiagramElement[], layout: LayoutEntry[], lookup: ImageLookup = images, ids?: ReadonlySet<string>, overrides?: DiagramDocument["style"]["overrides"]) =>
  diagramBounds(doc(elements, layout, overrides), monoMeasurer, lookup, ids);

describe("diagram bounds", () => {
  it("is null when nothing is drawn", () => {
    expect(bounds([{ kind: "unknown", id: "f", node: { name: "chart", args: [], props: {}, children: [] } }], [{ id: "f", x: 0, y: 0 }])).toBeNull();
    expect(bounds([], [])).toBeNull();
  });

  it("grows a shape's box by half its stroke", () => {
    expect(bounds([{ kind: "node", id: "a", shape: "rect" }], [{ id: "a", x: 10, y: 20, w: 100, h: 50 }])).toEqual({
      x: 9.25,
      y: 19.25,
      w: 101.5,
      h: 51.5,
    });
  });

  it("leaves a text box unpadded when it has no stroke", () => {
    expect(bounds([{ kind: "text", id: "t", content: "Hi" }], [{ id: "t", x: 10, y: 10 }])).toEqual({ x: 10, y: 10, w: 20, h: 24 });
  });

  it("uses the image lookup for an image's size and ignores a stroke it does not draw", () => {
    expect(bounds([{ kind: "image", id: "p", src: "assets/pic.png" }], [{ id: "p", x: 5, y: 6 }], ready)).toEqual({ x: 5, y: 6, w: 30, h: 10 });
  });

  it("includes a frame's name above the frame", () => {
    const box = bounds([{ kind: "frame", id: "f", name: "ABCD" }], [{ id: "f", x: 0, y: 80, w: 40, h: 30 }]);
    expect(box).toEqual({ x: -0.75, y: 56, w: 41.5, h: 54.75 });
  });

  it("reaches the offset and the blur of a shadow", () => {
    const box = bounds(
      [{ kind: "shape", id: "a", shape: "rect" }],
      [{ id: "a", x: 0, y: 0, w: 100, h: 50 }],
      images,
      undefined,
      [{ id: "a", props: { shadow: "10 0 0 #000" } }],
    );
    expect(box).toEqual({ x: -0.75, y: -0.75, w: 111.5, h: 51.5 });
  });

  it("covers a routed edge, its arrowhead and its label", () => {
    const box = bounds(
      [{ kind: "edge", id: "e", from: null, to: null, label: "Hi" }],
      [{ id: "e", x: 0, y: 0, fromPoint: { x: 0, y: 0 }, toPoint: { x: 100, y: 0 } }],
    );
    expect(box).toEqual({ x: -0.75, y: -16, w: 101.5, h: 32 });
  });

  it("limits the bounds to the given ids", () => {
    const elements: DiagramElement[] = [
      { kind: "node", id: "a", shape: "rect" },
      { kind: "node", id: "b", shape: "rect" },
    ];
    const layout: LayoutEntry[] = [
      { id: "a", x: 0, y: 0, w: 10, h: 10 },
      { id: "b", x: 500, y: 0, w: 10, h: 10 },
    ];
    expect(bounds(elements, layout, images, new Set(["a"]))?.x).toBe(-0.75);
    expect(bounds(elements, layout, images, new Set(["a"]))?.w).toBe(11.5);
    expect(bounds(elements, layout, images, new Set(["missing"]))).toBeNull();
  });
});

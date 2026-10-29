import { describe, expect, it } from "vitest";
import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { drawnBoxes, elementBox, outlineKind, stackOrder } from "./boxes.ts";
import { LINE_HEIGHT } from "./text-layout.ts";

const doc = (elements: DiagramElement[], layout: LayoutEntry[]): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements,
  layout,
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
});

describe("drawn boxes", () => {
  it("a text box with no width is as wide as its text", () => {
    const [box] = drawnBoxes(doc([{ kind: "text", id: "t", content: "hello" }], [{ id: "t", x: 5, y: 6 }]), monoMeasurer);
    expect(box).toMatchObject({ x: 5, y: 6, w: 50, h: LINE_HEIGHT });
  });

  it("a text box with a width wraps there and its height follows the lines", () => {
    const [box] = drawnBoxes(doc([{ kind: "text", id: "t", content: "aa bb cc dd" }], [{ id: "t", x: 0, y: 0, w: 50 }]), monoMeasurer);
    expect(box).toMatchObject({ w: 50, h: 2 * LINE_HEIGHT });
  });

  it("a height in the layout does not change a text box", () => {
    const [box] = drawnBoxes(doc([{ kind: "text", id: "t", content: "hi" }], [{ id: "t", x: 0, y: 0, w: 100, h: 500 }]), monoMeasurer);
    expect(box?.h).toBe(LINE_HEIGHT);
  });

  it("a shape keeps its layout size or the shape default", () => {
    const boxes = drawnBoxes(
      doc(
        [
          { kind: "node", id: "a", shape: "rect" },
          { kind: "node", id: "b", shape: "rect" },
        ],
        [
          { id: "a", x: 0, y: 0, w: 100, h: 60 },
          { id: "b", x: 0, y: 0 },
        ],
      ),
      monoMeasurer,
    );
    expect(boxes.map((b) => [b.w, b.h])).toEqual([
      [100, 60],
      [160, 80],
    ]);
  });
});

describe("outline kind", () => {
  it("an ellipse shape has an ellipse outline, with or without the core prefix", () => {
    expect(outlineKind({ kind: "node", id: "a", shape: "ellipse" })).toBe("ellipse");
    expect(outlineKind({ kind: "shape", id: "a", shape: "core.ellipse" })).toBe("ellipse");
  });

  it("every other element routes and hits as its bounding box", () => {
    expect(outlineKind({ kind: "node", id: "a", shape: "rect" })).toBe("rect");
    expect(outlineKind({ kind: "node", id: "a", shape: "arch.database" })).toBe("rect");
    expect(outlineKind({ kind: "text", id: "a", content: "x" })).toBe("rect");
    expect(outlineKind({ kind: "image", id: "a", src: "assets/a.png" })).toBe("rect");
  });
});

describe("element box", () => {
  const node: DiagramElement = { kind: "node", id: "a", shape: "rect" };

  it("is the layout position with the layout size, or the default size", () => {
    expect(elementBox(node, { id: "a", x: 3, y: 4, w: 50 }, monoMeasurer)).toEqual({ x: 3, y: 4, w: 50, h: 80 });
  });

  it("is null for an element with no layout entry or no box", () => {
    expect(elementBox(node, undefined, monoMeasurer)).toBeNull();
    expect(elementBox({ kind: "edge", id: "e", from: "a", to: "a" }, { id: "e", x: 0, y: 0 }, monoMeasurer)).toBeNull();
  });
});

describe("stack order", () => {
  const a: DiagramElement = { kind: "node", id: "a", shape: "rect" };
  const b: DiagramElement = { kind: "node", id: "b", shape: "rect" };

  it("follows the layout, with nodes and edges in one order", () => {
    const e: DiagramElement = { kind: "edge", id: "e", from: "a", to: "b" };
    const layout = [{ id: "a", x: 0, y: 0 }, { id: "e", x: 0, y: 0 }, { id: "b", x: 0, y: 0 }];
    expect(stackOrder(doc([a, b, e], layout))).toEqual(["a", "e", "b"]);
  });

  it("puts edges that have no layout entry on top, in file order", () => {
    const e1: DiagramElement = { kind: "edge", id: "e1", from: "a", to: "b" };
    const e2: DiagramElement = { kind: "edge", id: "e2", from: "b", to: "a" };
    expect(stackOrder(doc([a, e1, b, e2], [{ id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 0 }]))).toEqual(["a", "b", "e1", "e2"]);
  });

  it("leaves out layout entries for elements that do not exist", () => {
    expect(stackOrder(doc([a], [{ id: "ghost", x: 0, y: 0 }, { id: "a", x: 0, y: 0 }]))).toEqual(["a"]);
  });

  it("is worked out once for documents that share both arrays, as a drag preview does", () => {
    const e: DiagramElement = { kind: "edge", id: "e", from: "a", to: "b" };
    const elements = [a, b, e];
    const layout: LayoutEntry[] = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 0 }];
    expect(stackOrder({ ...doc(elements, layout), title: "other" })).toBe(stackOrder(doc(elements, layout)));
    expect(stackOrder(doc(elements, [...layout]))).toEqual(stackOrder(doc(elements, layout)));
    expect(stackOrder(doc(elements, [...layout]))).not.toBe(stackOrder(doc(elements, layout)));
  });
});

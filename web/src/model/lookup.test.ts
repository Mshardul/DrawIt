import { describe, expect, it } from "vitest";
import type { DiagramDocument, DiagramElement, LayoutEntry } from "./index.ts";
import { elementsById, layoutById } from "./lookup.ts";

const doc = (elements: DiagramElement[], layout: LayoutEntry[]): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements,
  layout,
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
});

const a: DiagramElement = { kind: "node", id: "a", shape: "rect" };
const b: DiagramElement = { kind: "node", id: "b", shape: "rect" };

describe("elements by ID", () => {
  it("finds each element by its ID", () => {
    const found = elementsById(doc([a, b], []));
    expect(found.get("a")).toBe(a);
    expect(found.get("b")).toBe(b);
    expect(found.get("c")).toBeUndefined();
  });

  it("is built once for an elements array, however many documents share it", () => {
    const elements = [a, b];
    const first = doc(elements, [{ id: "a", x: 0, y: 0 }]);
    const second = doc(elements, [{ id: "a", x: 9, y: 9 }]);
    expect(elementsById(first)).toBe(elementsById(second));
  });

  it("is built again for a different elements array", () => {
    expect(elementsById(doc([a], []))).not.toBe(elementsById(doc([a], [])));
    expect(elementsById(doc([a, b], [])).get("b")).toBe(b);
  });
});

describe("layout entries by ID", () => {
  it("finds each entry by its ID, and the first of two entries for one ID wins", () => {
    const first: LayoutEntry = { id: "a", x: 1, y: 1 };
    const found = layoutById(doc([a], [first, { id: "a", x: 2, y: 2 }]));
    expect(found.get("a")).toBe(first);
    expect(found.get("b")).toBeUndefined();
  });

  it("is built once for a layout array, however many documents share it", () => {
    const layout = [{ id: "a", x: 0, y: 0 }];
    expect(layoutById(doc([a], layout))).toBe(layoutById(doc([a, b], layout)));
  });

  it("is built again for a different layout array", () => {
    expect(layoutById(doc([a], [{ id: "a", x: 0, y: 0 }]))).not.toBe(layoutById(doc([a], [{ id: "a", x: 0, y: 0 }])));
  });
});

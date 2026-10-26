import { describe, expect, it } from "vitest";
import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";
import { placeUnplaced } from "./place.ts";

function doc(elements: DiagramElement[], layout: LayoutEntry[] = []): DiagramDocument {
  return {
    version: 1,
    plugins: [],
    elements,
    style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
    layout,
  };
}

const node = (id: string): DiagramElement => ({ kind: "node", id, shape: "rect" });

describe("grid placement of elements without layout", () => {
  it("[T-012] places unplaced elements left to right in file order, 80px apart", () => {
    const out = placeUnplaced(doc([node("a"), node("b"), node("c")]));
    expect(out.layout).toEqual([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 240, y: 0 },
      { id: "c", x: 480, y: 0 },
    ]);
  });

  it("[T-012] wraps to a new row at 1200px, below the tallest element of the row plus 80px", () => {
    const els = ["a", "b", "c", "d", "e", "f"].map(node);
    const out = placeUnplaced(doc(els));
    expect(out.layout.map((l) => [l.id, l.x, l.y])).toEqual([
      ["a", 0, 0],
      ["b", 240, 0],
      ["c", 480, 0],
      ["d", 720, 0],
      ["e", 960, 0],
      ["f", 0, 160],
    ]);
  });

  it("[T-012] uses each element's default size, so a frame advances the row further than a node", () => {
    const out = placeUnplaced(doc([{ kind: "frame", id: "f" }, node("n")]));
    expect(out.layout).toEqual([
      { id: "f", x: 0, y: 0 },
      { id: "n", x: 560, y: 0 },
    ]);
  });

  it("[T-012] leaves placed elements and their layout order alone, and appends new entries on top", () => {
    const placed: LayoutEntry = { id: "b", x: 7, y: 9, w: 50 };
    const out = placeUnplaced(doc([node("a"), node("b")], [placed]));
    expect(out.layout).toEqual([placed, { id: "a", x: 0, y: 0 }]);
  });

  it("[T-012] does not place edges", () => {
    const out = placeUnplaced(doc([node("a"), { kind: "edge", id: "e", from: "a", to: "a" }]));
    expect(out.layout.map((l) => l.id)).toEqual(["a"]);
  });

  it("[T-012] returns the same document when everything is placed, and never changes its input", () => {
    const d = doc([node("a")], [{ id: "a", x: 1, y: 1 }]);
    expect(placeUnplaced(d)).toBe(d);
    const u = doc([node("a")]);
    const before = structuredClone(u);
    placeUnplaced(u);
    expect(u).toEqual(before);
  });
});

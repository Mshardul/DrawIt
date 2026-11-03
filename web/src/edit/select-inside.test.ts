import { describe, expect, it } from "vitest";
import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { selectInside } from "./select-inside.ts";

const doc = (elements: DiagramElement[], layout: LayoutEntry[]): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements,
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout,
});

const node = (id: string): DiagramElement => ({ kind: "node", id, shape: "rect" });

const sample = (): DiagramDocument =>
  doc(
    [
      { kind: "frame", id: "f" },
      node("a"),
      node("b"),
      node("c"),
      node("d"),
      node("lock"),
      { kind: "text", id: "t", content: "hi" },
      { kind: "frame", id: "g" },
      node("edge-box"),
      { kind: "edge", id: "a->b", from: "a", to: "b" },
      { kind: "edge", id: "a->c", from: "a", to: "c" },
      { kind: "edge", id: "a->lock", from: "a", to: "lock" },
      { kind: "edge", id: "free", from: "a", to: null },
      { kind: "edge", id: "f->a", from: "f", to: "a" },
      { kind: "edge", id: "locked-edge", from: "a", to: "b" },
    ],
    [
      { id: "f", x: 0, y: 0, w: 500, h: 400 },
      { id: "a", x: 50, y: 50, w: 100, h: 50 },
      { id: "b", x: 200, y: 100, w: 100, h: 50 },
      { id: "c", x: 450, y: 350, w: 100, h: 50 },
      { id: "d", x: 600, y: 0, w: 100, h: 50 },
      { id: "lock", x: 300, y: 300, w: 50, h: 50, locked: true },
      { id: "t", x: 10, y: 300 },
      { id: "g", x: 20, y: 200, w: 100, h: 60 },
      { id: "edge-box", x: 400, y: 0, w: 100, h: 50 },
      { id: "locked-edge", x: 0, y: 0, locked: true },
    ],
  );

describe("select inside", () => {
  it("adds every unlocked element fully inside the selected frame, and edges between them, to the selection", () => {
    expect(selectInside(sample(), monoMeasurer, ["f"])).toEqual(["f", "a", "b", "t", "g", "edge-box", "a->b", "f->a"]);
  });

  it("leaves out an element that sticks out of the container, or lies outside it", () => {
    const result = selectInside(sample(), monoMeasurer, ["f"]) ?? [];
    expect(result).not.toContain("c");
    expect(result).not.toContain("d");
  });

  it("counts an element that touches the container's boundary as inside", () => {
    expect(selectInside(sample(), monoMeasurer, ["f"])).toContain("edge-box");
  });

  it("skips locked elements and the edges that join them, and locked edges", () => {
    const result = selectInside(sample(), monoMeasurer, ["f"]) ?? [];
    expect(result).not.toContain("lock");
    expect(result).not.toContain("a->lock");
    expect(result).not.toContain("locked-edge");
  });

  it("leaves out an edge with an end outside the container or free", () => {
    const result = selectInside(sample(), monoMeasurer, ["f"]) ?? [];
    expect(result).not.toContain("a->c");
    expect(result).not.toContain("free");
  });

  it("works for a shape, not only a frame", () => {
    const d = doc(
      [node("k"), node("m"), node("n")],
      [
        { id: "k", x: 0, y: 0, w: 300, h: 300 },
        { id: "m", x: 10, y: 10, w: 50, h: 50 },
        { id: "n", x: 280, y: 280, w: 50, h: 50 },
      ],
    );
    expect(selectInside(d, monoMeasurer, ["k"])).toEqual(["k", "m"]);
  });

  it("takes the contents of several selected containers together", () => {
    const d = doc(
      [node("k"), node("l"), node("m"), node("n")],
      [
        { id: "k", x: 0, y: 0, w: 100, h: 100 },
        { id: "l", x: 200, y: 0, w: 100, h: 100 },
        { id: "m", x: 10, y: 10, w: 20, h: 20 },
        { id: "n", x: 210, y: 10, w: 20, h: 20 },
      ],
    );
    expect(selectInside(d, monoMeasurer, ["k", "l"])).toEqual(["k", "l", "m", "n"]);
  });

  it("keeps other selected elements in the selection and does not repeat one", () => {
    expect(selectInside(sample(), monoMeasurer, ["d", "f", "a"])).toEqual(["d", "f", "a", "b", "t", "g", "edge-box", "a->b", "f->a"]);
  });

  it("is null when nothing selected can hold anything, or the container holds nothing", () => {
    expect(selectInside(sample(), monoMeasurer, [])).toBeNull();
    expect(selectInside(sample(), monoMeasurer, ["t", "a->b"])).toBeNull();
    expect(selectInside(sample(), monoMeasurer, ["d"])).toBeNull();
    expect(selectInside(sample(), monoMeasurer, ["missing"])).toBeNull();
  });

  it("holds a locked container's contents too, as a locked container can be selected", () => {
    const d = sample();
    d.layout[0] = { id: "f", x: 0, y: 0, w: 500, h: 400, locked: true };
    expect(selectInside(d, monoMeasurer, ["f"])).toContain("a");
  });
});

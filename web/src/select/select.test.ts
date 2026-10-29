import { describe, expect, it } from "vitest";
import { History } from "../commands/history.ts";
import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";
import { clickSelection, hitTest, idsInRect, selectAll } from "./select.ts";
import { monoMeasurer } from "../testing/measurer.ts";

const doc = (elements: DiagramElement[], layout: LayoutEntry[]): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements,
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout,
});

const sample = doc(
  [
    { kind: "node", id: "box", shape: "rect" },
    { kind: "node", id: "oval", shape: "ellipse" },
    { kind: "text", id: "note", content: "hi" },
    { kind: "frame", id: "frame" },
    { kind: "edge", id: "e", from: "box", to: "oval" },
    { kind: "node", id: "lock", shape: "rect" },
  ],
  [
    { id: "frame", x: 0, y: 0, w: 1000, h: 1000 },
    { id: "box", x: 0, y: 0, w: 100, h: 50 },
    { id: "oval", x: 200, y: 0, w: 100, h: 100 },
    { id: "note", x: 0, y: 200 },
    { id: "e", x: 0, y: 0 },
    { id: "lock", x: 400, y: 0, w: 100, h: 50, locked: true },
  ],
);

describe("selection", () => {
  it("a click hits the rectangle under the point", () => {
    expect(hitTest(sample, monoMeasurer, { x: 50, y: 25 })).toBe("box");
    expect(hitTest(sample, monoMeasurer, { x: 150, y: 25 })).toBeNull();
  });

  it("a click on an ellipse corner misses, and on its body hits", () => {
    expect(hitTest(sample, monoMeasurer, { x: 202, y: 2 })).toBeNull();
    expect(hitTest(sample, monoMeasurer, { x: 250, y: 50 })).toBe("oval");
  });

  it("the topmost overlapping element wins", () => {
    const overlapping = doc(
      [
        { kind: "node", id: "under", shape: "rect" },
        { kind: "node", id: "over", shape: "rect" },
      ],
      [
        { id: "under", x: 0, y: 0, w: 100, h: 100 },
        { id: "over", x: 50, y: 50, w: 100, h: 100 },
      ],
    );
    expect(hitTest(overlapping, monoMeasurer, { x: 75, y: 75 })).toBe("over");
    expect(hitTest(overlapping, monoMeasurer, { x: 25, y: 25 })).toBe("under");
  });

  it("frames, images and unknown elements are not hit", () => {
    expect(hitTest(sample, monoMeasurer, { x: 800, y: 800 })).toBeNull();
  });

  it("a click on an edge's path hits the edge, and a click a little beside it does too", () => {
    expect(hitTest(sample, monoMeasurer, { x: 150, y: 37.5 })).toBe("e");
    expect(hitTest(sample, monoMeasurer, { x: 150, y: 40 })).toBe("e");
  });

  it("a click further from an edge than the pointer reach misses it", () => {
    expect(hitTest(sample, monoMeasurer, { x: 150, y: 25 })).toBeNull();
  });

  it("the reach is a fixed number of screen px, so it is smaller in the world when zoomed in", () => {
    const point = { x: 150, y: 41 };
    expect(hitTest(sample, monoMeasurer, point, 1)).toBe("e");
    expect(hitTest(sample, monoMeasurer, point, 4)).toBeNull();
  });

  it("an edge and a shape share one z-order", () => {
    const cross = (edgeOnTop: boolean): DiagramDocument =>
      doc(
        [
          { kind: "node", id: "a", shape: "rect" },
          { kind: "node", id: "b", shape: "rect" },
          { kind: "node", id: "wide", shape: "rect" },
          { kind: "edge", id: "e", from: "a", to: "b" },
        ],
        [
          { id: "a", x: 0, y: 0, w: 100, h: 50 },
          { id: "b", x: 300, y: 0, w: 100, h: 50 },
          ...(edgeOnTop
            ? [{ id: "wide", x: 150, y: 0, w: 100, h: 50 }, { id: "e", x: 0, y: 0 }]
            : [{ id: "e", x: 0, y: 0 }, { id: "wide", x: 150, y: 0, w: 100, h: 50 }]),
        ],
      );
    expect(hitTest(cross(true), monoMeasurer, { x: 200, y: 25 })).toBe("e");
    expect(hitTest(cross(false), monoMeasurer, { x: 200, y: 25 })).toBe("wide");
  });

  it("an edge with no layout entry can be hit", () => {
    const unplaced = doc(
      [
        { kind: "node", id: "a", shape: "rect" },
        { kind: "node", id: "b", shape: "rect" },
        { kind: "edge", id: "e", from: "a", to: "b" },
      ],
      [{ id: "a", x: 0, y: 0, w: 100, h: 50 }, { id: "b", x: 300, y: 0, w: 100, h: 50 }],
    );
    expect(hitTest(unplaced, monoMeasurer, { x: 200, y: 25 })).toBe("e");
  });

  it("a text box is hit by its box, and a locked element can still be clicked", () => {
    expect(hitTest(sample, monoMeasurer, { x: 10, y: 210 })).toBe("note");
    expect(hitTest(sample, monoMeasurer, { x: 450, y: 25 })).toBe("lock");
  });

  it("a plain click selects one element, and an empty click clears", () => {
    expect(clickSelection(["a"], "b", false)).toEqual(["b"]);
    expect(clickSelection(["a"], null, false)).toEqual([]);
  });

  it("a click on an already selected element keeps the selection for a drag", () => {
    expect(clickSelection(["a", "b"], "b", false)).toEqual(["a", "b"]);
  });

  it("shift or Cmd/Ctrl click toggles an element and an empty additive click keeps the selection", () => {
    expect(clickSelection(["a"], "b", true)).toEqual(["a", "b"]);
    expect(clickSelection(["a", "b"], "a", true)).toEqual(["b"]);
    expect(clickSelection(["a"], null, true)).toEqual(["a"]);
  });

  it("drag-box selects every drawn element and edge it overlaps, in z-order, skipping locked ones", () => {
    expect(idsInRect(sample, monoMeasurer, { x: 90, y: 40, w: 130, h: 20 })).toEqual(["box", "oval", "e"]);
    expect(idsInRect(sample, monoMeasurer, { x: 390, y: 0, w: 200, h: 100 })).toEqual([]);
  });

  it("drag-box selects an edge it crosses even when it holds neither end", () => {
    expect(idsInRect(sample, monoMeasurer, { x: 140, y: 30, w: 20, h: 20 })).toEqual(["e"]);
  });

  it("drag-box accepts a rectangle dragged up and to the left", () => {
    expect(idsInRect(sample, monoMeasurer, { x: 220, y: 60, w: -130, h: -20 })).toEqual(["box", "oval", "e"]);
  });

  it("select all selects the drawn, unlocked elements and the edges", () => {
    expect(selectAll(sample, monoMeasurer)).toEqual(["box", "oval", "note", "e"]);
  });

  it("a locked edge can be clicked but is skipped by drag-box and select all", () => {
    const locked = doc(sample.elements, sample.layout.map((entry) => (entry.id === "e" ? { ...entry, locked: true } : entry)));
    expect(hitTest(locked, monoMeasurer, { x: 150, y: 37.5 })).toBe("e");
    expect(idsInRect(locked, monoMeasurer, { x: 140, y: 30, w: 20, h: 20 })).toEqual([]);
    expect(selectAll(locked, monoMeasurer)).not.toContain("e");
  });

  it("undo and redo restore the selection", () => {
    const history = new History(sample);
    history.selection = ["box"];
    history.execute({ type: "setLayout", changes: [{ id: "oval", set: { x: 300 } }] }, { selection: ["oval", "note"] });
    expect(history.selection).toEqual(["oval", "note"]);
    history.undo();
    expect(history.selection).toEqual(["box"]);
    history.redo();
    expect(history.selection).toEqual(["oval", "note"]);
  });
});

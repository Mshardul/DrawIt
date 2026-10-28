import { describe, expect, it } from "vitest";
import { applyCommand } from "../commands/command.ts";
import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";
import { handlesFor, MIN_SIZE, moveCommand, nudgeCommand, resizeCommand } from "./transform.ts";
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
    { kind: "node", id: "a", shape: "rect" },
    { kind: "node", id: "b", shape: "ellipse" },
    { kind: "node", id: "lock", shape: "rect" },
    { kind: "text", id: "t", content: "one\ntwo" },
    { kind: "frame", id: "f" },
  ],
  [
    { id: "a", x: 10, y: 20, w: 100, h: 50 },
    { id: "b", x: 200, y: 20 },
    { id: "lock", x: 400, y: 20, w: 100, h: 50, locked: true },
    { id: "t", x: 0, y: 200, w: 120 },
    { id: "f", x: 0, y: 0 },
  ],
);

const after = (command: ReturnType<typeof moveCommand>) => {
  if (!command) throw new Error("no command");
  return applyCommand(sample, command).document.layout;
};

describe("move", () => {
  it("moving a selection is one setLayout command that shifts every selected element", () => {
    const command = moveCommand(sample, monoMeasurer, ["a", "b"], 30, -5);
    expect(command?.type).toBe("setLayout");
    const layout = after(command);
    expect(layout.find((e) => e.id === "a")).toMatchObject({ x: 40, y: 15, w: 100, h: 50 });
    expect(layout.find((e) => e.id === "b")).toMatchObject({ x: 230, y: 15 });
    expect(layout.find((e) => e.id === "b")?.w).toBeUndefined();
  });

  it("positions stay integers", () => {
    const layout = after(moveCommand(sample, monoMeasurer, ["a"], 10.4, 0.6));
    expect(layout.find((e) => e.id === "a")).toMatchObject({ x: 20, y: 21 });
  });

  it("locked elements and ids that are not drawn do not move", () => {
    expect(moveCommand(sample, monoMeasurer, ["lock", "f", "missing"], 5, 5)).toBeNull();
    const layout = after(moveCommand(sample, monoMeasurer, ["a", "lock"], 5, 5));
    expect(layout.find((e) => e.id === "lock")).toMatchObject({ x: 400, y: 20 });
  });

  it("a move by nothing is not a command", () => {
    expect(moveCommand(sample, monoMeasurer, ["a"], 0, 0)).toBeNull();
    expect(moveCommand(sample, monoMeasurer, ["a"], 0.2, -0.3)).toBeNull();
  });

  it("arrow keys nudge 1px, or 10px with shift", () => {
    expect(after(nudgeCommand(sample, monoMeasurer, ["a"], "ArrowRight", false)).find((e) => e.id === "a")).toMatchObject({ x: 11, y: 20 });
    expect(after(nudgeCommand(sample, monoMeasurer, ["a"], "ArrowUp", true)).find((e) => e.id === "a")).toMatchObject({ x: 10, y: 10 });
    expect(after(nudgeCommand(sample, monoMeasurer, ["a"], "ArrowLeft", false)).find((e) => e.id === "a")?.x).toBe(9);
    expect(after(nudgeCommand(sample, monoMeasurer, ["a"], "ArrowDown", true)).find((e) => e.id === "a")?.y).toBe(30);
    expect(nudgeCommand(sample, monoMeasurer, ["a"], "a", false)).toBeNull();
  });
});

describe("resize", () => {
  const resized = (id: string, handle: Parameters<typeof resizeCommand>[3], dx: number, dy: number) => {
    const command = resizeCommand(sample, monoMeasurer, id, handle, dx, dy);
    if (!command) throw new Error("no command");
    return applyCommand(sample, command).document.layout.find((e) => e.id === id);
  };

  it("the south-east handle changes the size and keeps the top-left corner", () => {
    expect(resized("a", "se", 20, 10)).toMatchObject({ x: 10, y: 20, w: 120, h: 60 });
  });

  it("the north-west handle moves the corner and keeps the opposite one", () => {
    expect(resized("a", "nw", -10, -10)).toMatchObject({ x: 0, y: 10, w: 110, h: 60 });
  });

  it("an edge handle changes one axis only", () => {
    expect(resized("a", "e", 15, 99)).toMatchObject({ x: 10, y: 20, w: 115, h: 50 });
    expect(resized("a", "n", 99, 10)).toMatchObject({ x: 10, y: 30, w: 100, h: 40 });
  });

  it("the size cannot go below the minimum and the opposite edge stays put", () => {
    expect(MIN_SIZE).toBe(8);
    expect(resized("a", "se", -500, -500)).toMatchObject({ x: 10, y: 20, w: 8, h: 8 });
    expect(resized("a", "nw", 500, 500)).toMatchObject({ x: 102, y: 62, w: 8, h: 8 });
  });

  it("an element with no w and h starts from its default size and gets both written", () => {
    expect(resized("b", "se", 40, 20)).toMatchObject({ x: 200, y: 20, w: 200, h: 100 });
  });

  it("a text box resizes its width only; its height stays unwritten", () => {
    const entry = resized("t", "e", 30, 50);
    expect(entry).toMatchObject({ x: 0, y: 200, w: 150 });
    expect(entry?.h).toBeUndefined();
    expect(resizeCommand(sample, monoMeasurer, "t", "se", 5, 5)).toBeNull();
  });

  it("locked and undrawn elements do not resize", () => {
    expect(resizeCommand(sample, monoMeasurer, "lock", "se", 5, 5)).toBeNull();
    expect(resizeCommand(sample, monoMeasurer, "f", "se", 5, 5)).toBeNull();
  });

  it("a resize by nothing is not a command", () => {
    expect(resizeCommand(sample, monoMeasurer, "a", "se", 0, 0)).toBeNull();
  });

  it("handles: eight for a shape, east and west for a text box, none for locked or several", () => {
    expect(handlesFor(sample, monoMeasurer, ["a"])).toHaveLength(8);
    expect(handlesFor(sample, monoMeasurer, ["t"]).map((h) => h.handle).sort()).toEqual(["e", "w"]);
    expect(handlesFor(sample, monoMeasurer, ["lock"])).toEqual([]);
    expect(handlesFor(sample, monoMeasurer, ["a", "b"])).toEqual([]);
    expect(handlesFor(sample, monoMeasurer, ["a"]).find((h) => h.handle === "se")).toMatchObject({ x: 110, y: 70 });
  });
});

describe("snap to grid", () => {
  it("a move lands the selection's top-left on the grid and keeps the offsets between elements", () => {
    const layout = after(moveCommand(sample, monoMeasurer, ["a", "b"], 3, 3, 8));
    expect(layout.find((e) => e.id === "a")).toMatchObject({ x: 16, y: 24 });
    expect(layout.find((e) => e.id === "b")).toMatchObject({ x: 206, y: 24 });
  });

  it("a move that is already on the grid stays a whole number of cells", () => {
    const layout = after(moveCommand(sample, monoMeasurer, ["a"], 14, 14, 8));
    expect(layout.find((e) => e.id === "a")).toMatchObject({ x: 24, y: 32 });
  });

  it("a move with no grid is exact", () => {
    const layout = after(moveCommand(sample, monoMeasurer, ["a"], 3, 3, 0));
    expect(layout.find((e) => e.id === "a")).toMatchObject({ x: 13, y: 23 });
  });

  it("a move that snaps back to where it started is not a command", () => {
    expect(moveCommand(sample, monoMeasurer, ["a"], 1, 1, 10)).toBeNull();
  });

  it("a resize snaps the dragged edges and holds the opposite edge", () => {
    const se = resizeCommand(sample, monoMeasurer, "a", "se", 3, 3, 8);
    expect(se).toEqual({ type: "setLayout", changes: [{ id: "a", set: { x: 10, y: 20, w: 102, h: 52 } }] });
    const nw = resizeCommand(sample, monoMeasurer, "a", "nw", -3, -3, 8);
    expect(nw).toEqual({ type: "setLayout", changes: [{ id: "a", set: { x: 8, y: 16, w: 102, h: 54 } }] });
  });

  it("a snapped resize still stops at the minimum size", () => {
    const set = (resizeCommand(sample, monoMeasurer, "a", "e", -95, 0, 8) as { changes: { set: { w: number } }[] }).changes[0]?.set;
    expect(set?.w).toBeGreaterThanOrEqual(MIN_SIZE);
  });
});

import { describe, expect, it } from "vitest";
import { applyCommand } from "../commands/command.ts";
import { History } from "../commands/history.ts";
import { routedEdges } from "../connectors/edges.ts";
import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { deleteCommand } from "./delete.ts";

const doc = (elements: DiagramElement[], layout: LayoutEntry[]): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements,
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [{ id: "a", props: { fill: "red" } }] },
  layout,
});

const sample = (): DiagramDocument =>
  doc(
    [
      { kind: "node", id: "a", shape: "rect" },
      { kind: "node", id: "b", shape: "rect" },
      { kind: "node", id: "c", shape: "rect" },
      { kind: "edge", id: "a->b", from: "a", to: "b" },
      { kind: "edge", id: "b->c", from: "b", to: "c" },
      { kind: "text", id: "t", content: "hi" },
    ],
    [
      { id: "a", x: 0, y: 0, w: 100, h: 50 },
      { id: "b", x: 300, y: 100, w: 100, h: 50 },
      { id: "c", x: 600, y: 0 },
      { id: "a->b", x: 0, y: 0, from: "auto", to: "auto" },
      { id: "b->c", x: 0, y: 0, from: { side: "right", at: 0.5 }, to: "auto" },
      { id: "t", x: 0, y: 300 },
    ],
  );

const whole = (p: { x: number; y: number } | undefined): { x: number; y: number } | undefined => p && { x: Math.round(p.x), y: Math.round(p.y) };

const run = (document: DiagramDocument, ids: string[]): DiagramDocument => {
  const command = deleteCommand(document, monoMeasurer, ids);
  if (!command) throw new Error("no command");
  return applyCommand(document, command).document;
};

describe("delete", () => {
  it("removes the selected elements with their layout lines and style overrides", () => {
    const after = run(sample(), ["a", "t"]);
    expect(after.elements.map((e) => e.id)).not.toContain("a");
    expect(after.elements.map((e) => e.id)).not.toContain("t");
    expect(after.layout.map((e) => e.id)).not.toContain("a");
    expect(after.style.overrides).toEqual([]);
    expect(after.elements.map((e) => e.id)).toContain("b");
  });

  it("deleting an edge removes only that edge", () => {
    const after = run(sample(), ["a->b"]);
    expect(after.elements.map((e) => e.id)).toEqual(["a", "b", "c", "b->c", "t"]);
    expect(after.layout.find((e) => e.id === "a")).toBeDefined();
  });

  it("an edge to a deleted element keeps that end where it was drawn", () => {
    const before = sample();
    const drawn = routedEdges(before, monoMeasurer).get("a->b")?.points;
    const after = run(before, ["b"]);
    const edge = after.elements.find((e) => e.id === "a->b");
    expect(edge).toMatchObject({ kind: "edge", from: "a", to: null });
    expect(after.layout.find((e) => e.id === "a->b")).toMatchObject({ toPoint: whole(drawn?.at(-1)) });
    const redrawn = routedEdges(after, monoMeasurer).get("a->b")?.points.at(-1);
    expect(redrawn?.x).toBeCloseTo(drawn?.at(-1)?.x ?? NaN, 0);
    expect(redrawn?.y).toBeCloseTo(drawn?.at(-1)?.y ?? NaN, 0);
  });

  it("the freed end of an element with no size in the layout is where it was drawn, not its corner", () => {
    const before = sample();
    const drawn = routedEdges(before, monoMeasurer).get("b->c")?.points.at(-1);
    const after = run(before, ["c"]);
    expect(after.layout.find((e) => e.id === "b->c")).toMatchObject({ toPoint: whole(drawn) });
  });

  it("a freed end drops its anchor", () => {
    const after = run(sample(), ["b"]);
    expect(after.layout.find((e) => e.id === "b->c")).not.toHaveProperty("from");
    expect(after.layout.find((e) => e.id === "a->b")).not.toHaveProperty("to");
  });

  it("an edge deleted together with its element is removed and not kept", () => {
    const after = run(sample(), ["a", "a->b"]);
    expect(after.elements.map((e) => e.id)).not.toContain("a->b");
    expect(after.layout.map((e) => e.id)).not.toContain("a->b");
  });

  it("a locked element is not deleted", () => {
    const before = sample();
    before.layout[0] = { id: "a", x: 0, y: 0, w: 100, h: 50, locked: true };
    const after = run(before, ["a", "t"]);
    expect(after.elements.map((e) => e.id)).toContain("a");
    expect(after.elements.map((e) => e.id)).not.toContain("t");
  });

  it("is null when nothing can be deleted", () => {
    const before = sample();
    before.layout[0] = { id: "a", x: 0, y: 0, w: 100, h: 50, locked: true };
    expect(deleteCommand(before, monoMeasurer, [])).toBeNull();
    expect(deleteCommand(before, monoMeasurer, ["a", "missing"])).toBeNull();
  });

  it("is one undo step that restores the elements, layout lines, overrides and selection", () => {
    const history = new History(sample());
    history.selection = ["a", "t"];
    const command = deleteCommand(history.document, monoMeasurer, history.selection);
    if (!command) throw new Error("no command");
    history.execute(command, { selection: [] });
    expect(history.selection).toEqual([]);
    expect(history.undo()).toBe(true);
    expect(history.document).toEqual(sample());
    expect(history.selection).toEqual(["a", "t"]);
    expect(history.canUndo).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { applyCommand } from "../commands/command.ts";
import { History } from "../commands/history.ts";
import { routedEdges } from "../connectors/edges.ts";
import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { DUPLICATE_OFFSET, duplicateCommand } from "./duplicate.ts";

const doc = (elements: DiagramElement[], layout: LayoutEntry[]): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements,
  style: {
    theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} },
    classes: [{ name: "hot", props: { stroke: "red" } }],
    overrides: [{ id: "a", props: { dash: "dashed" } }],
  },
  layout,
});

const sample = (): DiagramDocument =>
  doc(
    [
      { kind: "node", id: "a", label: "A", shape: "rect", class: "hot", comments: ["// first"] },
      { kind: "node", id: "b", shape: "rect" },
      { kind: "node", id: "c", shape: "rect" },
      { kind: "edge", id: "a->b", from: "a", to: "b", label: "go" },
      { kind: "edge", id: "b->c", from: "b", to: "c" },
      { kind: "edge", id: "loose", from: null, to: "c" },
      { kind: "text", id: "t", content: "hi" },
    ],
    [
      { id: "a", x: 0, y: 0, w: 100, h: 50, locked: true },
      { id: "b", x: 300, y: 100, w: 100, h: 50 },
      { id: "c", x: 600, y: 0 },
      { id: "a->b", x: 0, y: 0, from: "auto", to: "auto", via: [{ x: 150, y: 20 }], labelAt: 0.3 },
      { id: "b->c", x: 0, y: 0, from: { side: "right", at: 0.5 }, to: "auto" },
      { id: "loose", x: 0, y: 0, fromPoint: { x: 500, y: 300 }, to: { side: "bottom" } },
      { id: "t", x: 0, y: 300 },
    ],
  );

const O = DUPLICATE_OFFSET;

function run(document: DiagramDocument, ids: string[]): { after: DiagramDocument; selection: string[] } {
  const result = duplicateCommand(document, monoMeasurer, ids);
  if (!result) throw new Error("no command");
  return { after: applyCommand(document, result.command).document, selection: result.selection };
}
const element = (d: DiagramDocument, id: string): DiagramElement | undefined => d.elements.find((e) => e.id === id);
const entry = (d: DiagramDocument, id: string): LayoutEntry | undefined => d.layout.find((e) => e.id === id);

describe("duplicate", () => {
  it("copies a node under an id of its own, offset, with its content, size and class", () => {
    const { after } = run(sample(), ["a"]);
    expect(element(after, "rect")).toMatchObject({ kind: "node", label: "A", shape: "rect", class: "hot" });
    expect(entry(after, "rect")).toMatchObject({ x: O, y: O, w: 100, h: 50 });
    expect(entry(after, "a")).toEqual(entry(sample(), "a"));
  });

  it("does not copy comments or the lock", () => {
    const { after } = run(sample(), ["a"]);
    expect(element(after, "rect")).not.toHaveProperty("comments");
    expect(entry(after, "rect")).not.toHaveProperty("locked");
  });

  it("carries the style override of the original to the copy", () => {
    const { after } = run(sample(), ["a"]);
    expect(after.style.overrides).toContainEqual({ id: "rect", props: { dash: "dashed" } });
    expect(after.style.overrides).toContainEqual({ id: "a", props: { dash: "dashed" } });
  });

  it("names a copy after its shape, not after its original, and skips ids in use", () => {
    const before = sample();
    before.elements.push({ kind: "node", id: "rect", shape: "rect" }, { kind: "node", id: "server", shape: "arch.server" });
    before.layout.push({ id: "rect", x: 9, y: 9 }, { id: "server", x: 9, y: 9 });
    const { selection } = run(before, ["a", "b", "server", "t"]);
    expect(selection).toEqual(["rect-2", "rect-3", "rect-2->rect-3", "text", "server-2"]);
  });

  it("selects the copies", () => {
    expect(run(sample(), ["a", "t"]).selection).toEqual(["rect", "text"]);
  });

  it("copies an edge between two copied elements, between the copies, though the edge is not selected", () => {
    const { after, selection } = run(sample(), ["a", "b"]);
    expect(element(after, "rect->rect-2")).toMatchObject({ kind: "edge", from: "rect", to: "rect-2", label: "go" });
    expect(selection).toEqual(["rect", "rect-2", "rect->rect-2"]);
    expect(entry(after, "rect->rect-2")).toMatchObject({ from: "auto", to: "auto", via: [{ x: 150 + O, y: 20 + O }], labelAt: 0.3 });
  });

  it("does not copy an unselected edge with only one end copied", () => {
    const { after } = run(sample(), ["b"]);
    expect(after.elements.map((e) => e.id)).toEqual([...sample().elements.map((e) => e.id), "rect"]);
  });

  it("copies a selected edge with one end copied: that end on the copy, the other free where it was drawn", () => {
    const before = sample();
    const drawn = routedEdges(before, monoMeasurer).get("b->c")?.points.at(-1);
    const { after, selection } = run(before, ["b", "b->c"]);
    expect(selection).toEqual(["rect", "edge"]);
    expect(element(after, "edge")).toMatchObject({ kind: "edge", from: "rect", to: null });
    const at = entry(after, "edge");
    expect(at).toMatchObject({ from: { side: "right", at: 0.5 }, toPoint: { x: Math.round((drawn?.x ?? NaN) + O), y: Math.round((drawn?.y ?? NaN) + O) } });
    expect(at).not.toHaveProperty("to");
  });

  it("copies a selected edge alone as a loose edge with both ends free", () => {
    const before = sample();
    const points = routedEdges(before, monoMeasurer).get("a->b")?.points;
    const { after, selection } = run(before, ["a->b"]);
    expect(selection).toEqual(["edge"]);
    expect(element(after, "edge")).toMatchObject({ kind: "edge", from: null, to: null });
    expect(entry(after, "edge")).toMatchObject({
      fromPoint: { x: Math.round((points?.[0]?.x ?? NaN) + O), y: Math.round((points?.[0]?.y ?? NaN) + O) },
      toPoint: { x: Math.round((points?.at(-1)?.x ?? NaN) + O), y: Math.round((points?.at(-1)?.y ?? NaN) + O) },
    });
  });

  it("moves a free end with the copy and keeps the end that is copied", () => {
    const { after, selection } = run(sample(), ["c", "loose"]);
    expect(selection).toEqual(["rect", "edge"]);
    expect(element(after, "edge")).toMatchObject({ from: null, to: "rect" });
    expect(entry(after, "edge")).toMatchObject({ fromPoint: { x: 500 + O, y: 300 + O }, to: { side: "bottom" } });
  });

  it("gives a copy of an unsized element no size of its own", () => {
    const { after } = run(sample(), ["c"]);
    expect(entry(after, "rect")).toEqual({ id: "rect", x: 600 + O, y: O });
  });

  it("is null when nothing selected exists", () => {
    expect(duplicateCommand(sample(), monoMeasurer, [])).toBeNull();
    expect(duplicateCommand(sample(), monoMeasurer, ["missing"])).toBeNull();
  });

  it("is one undo step that removes the copies and restores the selection", () => {
    const history = new History(sample());
    history.selection = ["a", "b"];
    const result = duplicateCommand(history.document, monoMeasurer, history.selection);
    if (!result) throw new Error("no command");
    history.execute(result.command, { selection: result.selection });
    expect(history.selection).toEqual(["rect", "rect-2", "rect->rect-2"]);
    expect(history.undo()).toBe(true);
    expect(history.document).toEqual(sample());
    expect(history.selection).toEqual(["a", "b"]);
    expect(history.canUndo).toBe(false);
  });
});

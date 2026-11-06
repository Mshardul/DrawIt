import { describe, expect, it } from "vitest";
import { applyCommand } from "../commands/command.ts";
import { History } from "../commands/history.ts";
import { routedEdges } from "../connectors/edges.ts";
import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { pasteCommand, pastePoint, selectionDocument } from "./paste.ts";

const empty = (): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements: [],
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout: [],
});

const source = (): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements: [
    { kind: "node", id: "a", label: "A", shape: "rect", class: "note", comments: ["// keep"] },
    { kind: "node", id: "b", label: "B", shape: "rect", class: "note" },
    { kind: "node", id: "c", label: "C", shape: "rect" },
    { kind: "edge", id: "a->b", from: "a", to: "b", label: "go" },
    { kind: "edge", id: "b->c", from: "b", to: "c" },
  ],
  style: {
    theme: {
      name: "default",
      colors: { brand: "#112233", ink: "#000000" },
      fonts: {},
      sizes: { room: 20 },
      spaces: {},
    },
    classes: [{ name: "note", props: { fill: "$brand", size: "$room" } }],
    overrides: [{ id: "a", props: { stroke: "$brand" } }],
  },
  layout: [
    { id: "a", x: 10, y: 20, w: 100, h: 40, locked: true },
    { id: "b", x: 200, y: 20, w: 80, h: 40 },
    { id: "c", x: 400, y: 20, w: 80, h: 40 },
    { id: "a->b", x: 0, y: 0, from: "auto", to: "auto", via: [{ x: 80, y: 30 }] },
    { id: "b->c", x: 0, y: 0, from: "auto", to: { side: "left", at: 0.4 } },
  ],
});

const element = (doc: DiagramDocument, id: string): DiagramElement | undefined => doc.elements.find((item) => item.id === id);
const entry = (doc: DiagramDocument, id: string): LayoutEntry | undefined => doc.layout.find((item) => item.id === id);

describe("selection document", () => {
  it("keeps an edge between two copied nodes and detaches an end whose node was not copied", () => {
    const before = source();
    const drawn = routedEdges(before, monoMeasurer).get("b->c")?.points.at(-1);
    const clip = selectionDocument(before, ["a", "b", "b->c"], monoMeasurer);
    expect(clip.elements.map((item) => item.id)).toEqual(["a", "b", "a->b", "b->c"]);
    const loose = clip.elements.find((item) => item.id === "b->c");
    expect(loose).toMatchObject({ kind: "edge", from: "b", to: null });
    expect(clip.layout.find((item) => item.id === "b->c")).toMatchObject({
      toPoint: { x: Math.round(drawn?.x ?? NaN), y: Math.round(drawn?.y ?? NaN) },
    });
    expect(clip.layout.find((item) => item.id === "b->c")).not.toHaveProperty("to");
  });
});

describe("paste", () => {
  it("gives fresh ids and puts the top left of the group at the target point", () => {
    const clip = selectionDocument(source(), ["a", "b"], monoMeasurer);
    const result = pasteCommand(empty(), clip, monoMeasurer, { x: 100, y: 50 });
    if (!result) throw new Error("no command");
    const after = applyCommand(empty(), result.command).document;
    expect(result.selection).toEqual(["rect", "rect-2", "rect->rect-2"]);
    expect(element(after, "rect")).toMatchObject({ kind: "node", label: "A", shape: "rect", class: "note", comments: ["// keep"] });
    expect(entry(after, "rect")).toMatchObject({ x: 100, y: 50, w: 100, h: 40 });
    expect(entry(after, "rect")).not.toHaveProperty("locked");
    expect(entry(after, "rect-2")).toMatchObject({ x: 290, y: 50 });
    expect(element(after, "rect->rect-2")).toMatchObject({ kind: "edge", from: "rect", to: "rect-2", label: "go" });
    expect(entry(after, "rect->rect-2")?.via).toEqual([{ x: 170, y: 60 }]);
  });

  it("moves a detached end with the group", () => {
    const before = source();
    const drawn = routedEdges(before, monoMeasurer).get("b->c")?.points.at(-1);
    const clip = selectionDocument(before, ["b", "b->c"], monoMeasurer);
    const result = pasteCommand(empty(), clip, monoMeasurer, { x: 0, y: 0 });
    if (!result) throw new Error("no command");
    const after = applyCommand(empty(), result.command).document;
    expect(element(after, "edge")).toMatchObject({ kind: "edge", from: "rect", to: null });
    expect(entry(after, "edge")).toMatchObject({
      toPoint: { x: Math.round(drawn?.x ?? NaN) - 200, y: Math.round(drawn?.y ?? NaN) - 20 },
    });
  });

  it("adds a missing class and token and keeps the ones the target already has", () => {
    const target = empty();
    target.style.classes = [{ name: "note", props: { fill: "red" } }];
    target.style.theme.colors = { brand: "#abcdef" };
    const clip = selectionDocument(source(), ["a"], monoMeasurer);
    const result = pasteCommand(target, clip, monoMeasurer, { x: 0, y: 0 });
    if (!result) throw new Error("no command");
    const after = applyCommand(target, result.command).document;
    expect(after.style.classes).toEqual([{ name: "note", props: { fill: "red" } }]);
    expect(after.style.theme.colors).toEqual({ brand: "#abcdef" });
    expect(after.style.overrides).toEqual([{ id: "rect", props: { stroke: "$brand" } }]);
  });

  it("adds a class and the tokens it needs when the target has neither", () => {
    const clip = selectionDocument(source(), ["a"], monoMeasurer);
    const result = pasteCommand(empty(), clip, monoMeasurer, { x: 0, y: 0 });
    if (!result) throw new Error("no command");
    const after = applyCommand(empty(), result.command).document;
    expect(after.style.classes).toEqual([{ name: "note", props: { fill: "$brand", size: "$room" } }]);
    expect(after.style.theme.colors).toEqual({ brand: "#112233" });
    expect(after.style.theme.sizes).toEqual({ room: 20 });
    expect(after.style.theme.colors["ink"]).toBeUndefined();
  });

  it("places a file that has no layout, starting at the target point", () => {
    const clip: DiagramDocument = {
      ...empty(),
      elements: [
        { kind: "node", id: "a", shape: "rect" },
        { kind: "node", id: "b", shape: "rect" },
      ],
    };
    const result = pasteCommand(empty(), clip, monoMeasurer, { x: 30, y: 40 });
    if (!result) throw new Error("no command");
    const after = applyCommand(empty(), result.command).document;
    expect(entry(after, "rect")).toMatchObject({ x: 30, y: 40 });
    expect(entry(after, "rect-2")?.x).toBeGreaterThan(30);
    expect(entry(after, "rect-2")?.y).toBe(40);
  });

  it("is null when the document has no elements", () => {
    expect(pasteCommand(empty(), empty(), monoMeasurer, { x: 0, y: 0 })).toBeNull();
  });

  it("is one undo step", () => {
    const target = empty();
    const history = new History(target);
    const clip = selectionDocument(source(), ["a"], monoMeasurer);
    const result = pasteCommand(history.document, clip, monoMeasurer, { x: 5, y: 6 });
    if (!result) throw new Error("no command");
    history.execute(result.command, { selection: result.selection });
    expect(history.document.elements).toHaveLength(1);
    expect(history.undo()).toBe(true);
    expect(history.document).toEqual(target);
  });

  it("does not reuse an id the target already has", () => {
    const target = empty();
    target.elements = [{ kind: "node", id: "rect", shape: "rect" }];
    const clip = selectionDocument(source(), ["a"], monoMeasurer);
    const result = pasteCommand(target, clip, monoMeasurer, { x: 0, y: 0 });
    expect(result?.selection).toEqual(["rect-2"]);
  });

  it("lands at the pointer, or one duplicate offset from the originals when the pointer is off the canvas", () => {
    const clip = selectionDocument(source(), ["a"], monoMeasurer);
    expect(pastePoint({ x: 8, y: 9 }, clip)).toEqual({ x: 8, y: 9 });
    expect(pastePoint(null, clip)).toEqual({ x: 26, y: 36 });
  });
});

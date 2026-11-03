import { describe, expect, it } from "vitest";
import { applyCommand } from "../commands/command.ts";
import { History } from "../commands/history.ts";
import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { alignCommand, distributeCommand } from "./arrange.ts";
import type { AlignMode } from "./arrange.ts";

const doc = (elements: DiagramElement[], layout: LayoutEntry[]): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements,
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout,
});

const node = (id: string): DiagramElement => ({ kind: "node", id, shape: "rect" });

const three = (): DiagramDocument =>
  doc(
    [node("a"), node("b"), node("c"), { kind: "frame", id: "f" }, { kind: "edge", id: "a->b", from: "a", to: "b" }],
    [
      { id: "a", x: 10, y: 20, w: 100, h: 50 },
      { id: "b", x: 200, y: 60, w: 80, h: 40 },
      { id: "c", x: 400, y: 100, w: 60, h: 30 },
      { id: "f", x: 0, y: 0, w: 900, h: 900 },
      { id: "a->b", x: 0, y: 0, from: "auto", to: "auto" },
    ],
  );

function at(document: DiagramDocument, command: ReturnType<typeof alignCommand>, id: string): LayoutEntry | undefined {
  if (!command) throw new Error("no command");
  return applyCommand(document, command).document.layout.find((e) => e.id === id);
}

describe("align", () => {
  const cases: [AlignMode, Record<string, Partial<LayoutEntry>>][] = [
    ["left", { a: { x: 10, y: 20 }, b: { x: 10, y: 60 }, c: { x: 10, y: 100 } }],
    ["right", { a: { x: 360 }, b: { x: 380 }, c: { x: 400 } }],
    ["centre", { a: { x: 185 }, b: { x: 195 }, c: { x: 205 } }],
    ["top", { a: { y: 20 }, b: { y: 20 }, c: { y: 20 } }],
    ["bottom", { a: { y: 80 }, b: { y: 90 }, c: { y: 100 } }],
    ["middle", { a: { y: 50 }, b: { y: 55 }, c: { y: 60 } }],
  ];
  it.each(cases)("%s lines the elements up on their bounding boxes", (mode, expected) => {
    const d = three();
    const command = alignCommand(d, monoMeasurer, ["a", "b", "c"], mode);
    for (const [id, props] of Object.entries(expected)) expect(at(d, command, id)).toMatchObject(props);
  });

  it("is one setLayout command that writes only the elements that move", () => {
    const command = alignCommand(three(), monoMeasurer, ["a", "b", "c"], "top");
    expect(command?.type).toBe("setLayout");
    expect(command?.type === "setLayout" && command.changes.map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("keeps positions whole when a centre falls between pixels", () => {
    const d = doc([node("a"), node("b")], [{ id: "a", x: 0, y: 0, w: 101, h: 50 }, { id: "b", x: 200, y: 0, w: 50, h: 50 }]);
    expect(at(d, alignCommand(d, monoMeasurer, ["a", "b"], "centre"), "a")).toMatchObject({ x: 75 });
  });

  it("is null for one element, for elements already aligned, and for ids that are not drawn", () => {
    expect(alignCommand(three(), monoMeasurer, ["a"], "left")).toBeNull();
    expect(alignCommand(three(), monoMeasurer, ["a", "f", "a->b", "missing"], "left")).toBeNull();
    const aligned = alignCommand(three(), monoMeasurer, ["a", "b", "c"], "left");
    const d = three();
    d.layout = d.layout.map((e) => (aligned?.type === "setLayout" ? { ...e, ...aligned.changes.find((c) => c.id === e.id)?.set } : e));
    expect(alignCommand(d, monoMeasurer, ["a", "b", "c"], "left")).toBeNull();
  });

  it("does not move a locked element, which still sets the line the others align to", () => {
    const d = three();
    d.layout[1] = { id: "b", x: -50, y: 60, w: 80, h: 40, locked: true };
    const command = alignCommand(d, monoMeasurer, ["a", "b", "c"], "left");
    expect(at(d, command, "a")).toMatchObject({ x: -50 });
    expect(at(d, command, "c")).toMatchObject({ x: -50 });
    expect(command?.type === "setLayout" && command.changes.map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("carries the bend points of an edge whose ends both move by the same amount", () => {
    const d = doc(
      [node("a"), node("b"), node("c"), { kind: "edge", id: "a->b", from: "a", to: "b" }, { kind: "edge", id: "b->c", from: "b", to: "c" }],
      [
        { id: "a", x: 100, y: 0, w: 40, h: 40 },
        { id: "b", x: 100, y: 100, w: 40, h: 40 },
        { id: "c", x: 0, y: 200, w: 40, h: 40 },
        { id: "a->b", x: 0, y: 0, via: [{ x: 120, y: 70 }] },
        { id: "b->c", x: 0, y: 0, via: [{ x: 60, y: 170 }] },
      ],
    );
    const command = alignCommand(d, monoMeasurer, ["a", "b", "c"], "left");
    expect(at(d, command, "a->b")).toMatchObject({ via: [{ x: 20, y: 70 }] });
    expect(at(d, command, "b->c")).toMatchObject({ via: [{ x: 60, y: 170 }] });
  });

  it("is one undo step", () => {
    const history = new History(three());
    const command = alignCommand(history.document, monoMeasurer, ["a", "b", "c"], "right");
    if (!command) throw new Error("no command");
    history.execute(command);
    expect(history.undo()).toBe(true);
    expect(history.document).toEqual(three());
    expect(history.canUndo).toBe(false);
  });
});

describe("distribute", () => {
  const row = (): DiagramDocument =>
    doc(
      [node("a"), node("b"), node("c"), node("d")],
      [
        { id: "c", x: 400, y: 300, w: 100, h: 50 },
        { id: "a", x: 0, y: 0, w: 100, h: 50 },
        { id: "b", x: 130, y: 70, w: 50, h: 20 },
        { id: "d", x: 700, y: 700, w: 10, h: 10 },
      ],
    );

  it("spaces three elements with equal gaps horizontally, whatever order they were chosen in", () => {
    const d = row();
    const command = distributeCommand(d, monoMeasurer, ["c", "a", "b"], "horizontal");
    expect(at(d, command, "a")).toMatchObject({ x: 0 });
    expect(at(d, command, "b")).toMatchObject({ x: 225, y: 70 });
    expect(at(d, command, "c")).toMatchObject({ x: 400 });
    expect(command?.type === "setLayout" && command.changes.map((c) => c.id)).toEqual(["b"]);
  });

  it("spaces them vertically by their heights", () => {
    const d = row();
    const command = distributeCommand(d, monoMeasurer, ["a", "b", "c"], "vertical");
    // Heights 50, 20 and 50 between y 0 and 350 leave gaps of 115.
    expect(at(d, command, "b")).toMatchObject({ y: 165, x: 130 });
    expect(at(d, command, "a")).toMatchObject({ y: 0 });
    expect(at(d, command, "c")).toMatchObject({ y: 300 });
  });

  it("spaces more than three, leaving the first and last where they are", () => {
    const d = doc(
      [node("a"), node("b"), node("c"), node("d")],
      [
        { id: "a", x: 0, y: 0, w: 10, h: 10 },
        { id: "b", x: 20, y: 0, w: 10, h: 10 },
        { id: "c", x: 40, y: 0, w: 10, h: 10 },
        { id: "d", x: 300, y: 0, w: 10, h: 10 },
      ],
    );
    const command = distributeCommand(d, monoMeasurer, ["a", "b", "c", "d"], "horizontal");
    expect([at(d, command, "b")?.x, at(d, command, "c")?.x]).toEqual([100, 200]);
  });

  it("is null for fewer than three elements and when the gaps are already equal", () => {
    expect(distributeCommand(row(), monoMeasurer, ["a", "b"], "horizontal")).toBeNull();
    const d = row();
    d.layout = d.layout.map((e) => (e.id === "b" ? { ...e, x: 225 } : e));
    expect(distributeCommand(d, monoMeasurer, ["a", "b", "c"], "horizontal")).toBeNull();
  });

  it("leaves locked elements out of the spacing", () => {
    const d = row();
    d.layout = d.layout.map((e) => (e.id === "b" ? { ...e, locked: true } : e));
    expect(distributeCommand(d, monoMeasurer, ["a", "b", "c"], "horizontal")).toBeNull();
    const four = distributeCommand(d, monoMeasurer, ["a", "b", "c", "d"], "horizontal");
    expect(at(d, four, "b")).toMatchObject({ x: 130 });
    expect(at(d, four, "c")).toMatchObject({ x: 350 });
  });

  it("is one undo step", () => {
    const history = new History(row());
    const command = distributeCommand(history.document, monoMeasurer, ["a", "b", "c"], "horizontal");
    if (!command) throw new Error("no command");
    history.execute(command);
    expect(history.undo()).toBe(true);
    expect(history.document).toEqual(row());
  });
});

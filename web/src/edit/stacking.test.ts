import { describe, expect, it } from "vitest";
import { applyCommand } from "../commands/command.ts";
import { History } from "../commands/history.ts";
import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";
import { stackOrder } from "../render/boxes.ts";
import { stackAvailability, stackCommand } from "./stacking.ts";

const doc = (elements: DiagramElement[], layout: LayoutEntry[]): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements,
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout,
});

const node = (id: string): DiagramElement => ({ kind: "node", id, shape: "rect" });
const at = (id: string, x = 0): LayoutEntry => ({ id, x, y: 0, w: 10, h: 10 });

/** a, b, c, d bottom to top, and an edge between a and b in the middle of the order. */
const five = (): DiagramDocument =>
  doc(
    [node("a"), node("b"), node("c"), node("d"), { kind: "edge", id: "a->b", from: "a", to: "b" }],
    [at("a"), at("b"), { id: "a->b", x: 0, y: 0 }, at("c"), at("d")],
  );

const after = (d: DiagramDocument, ids: string[], to: "front" | "back"): readonly string[] => {
  const command = stackCommand(d, ids, to);
  if (!command) throw new Error("no command");
  return stackOrder(applyCommand(d, command).document);
};

describe("bring to front", () => {
  it("moves the selection to the top, keeping its order among themselves", () => {
    expect(after(five(), ["b"], "front")).toEqual(["a", "a->b", "c", "d", "b"]);
    expect(after(five(), ["c", "a"], "front")).toEqual(["b", "a->b", "d", "a", "c"]);
  });

  it("shares one order between nodes and edges", () => {
    expect(after(five(), ["a->b"], "front")).toEqual(["a", "b", "c", "d", "a->b"]);
    expect(after(five(), ["a", "a->b"], "front")).toEqual(["b", "c", "d", "a", "a->b"]);
  });

  it("is null when the selection is already on top, and for an empty or unknown selection", () => {
    expect(stackCommand(five(), ["d"], "front")).toBeNull();
    expect(stackCommand(five(), ["c", "d"], "front")).toBeNull();
    expect(stackCommand(five(), [], "front")).toBeNull();
    expect(stackCommand(five(), ["missing"], "front")).toBeNull();
  });

  it("ignores ids that do not exist", () => {
    expect(after(five(), ["missing", "a"], "front")).toEqual(["b", "a->b", "c", "d", "a"]);
  });
});

describe("send to back", () => {
  it("moves the selection to the bottom, keeping its order among themselves", () => {
    expect(after(five(), ["c"], "back")).toEqual(["c", "a", "b", "a->b", "d"]);
    expect(after(five(), ["d", "b"], "back")).toEqual(["b", "d", "a", "a->b", "c"]);
  });

  it("is null when the selection is already at the bottom", () => {
    expect(stackCommand(five(), ["a"], "back")).toBeNull();
    expect(stackCommand(five(), ["a", "b"], "back")).toBeNull();
  });
});

describe("an edge with no layout entry", () => {
  const withLooseEdge = (): DiagramDocument =>
    doc([node("a"), node("b"), { kind: "edge", id: "a->b", from: "a", to: "b" }], [at("a"), at("b")]);

  it("draws on top, and a shape brought to front goes above it", () => {
    expect(stackOrder(withLooseEdge())).toEqual(["a", "b", "a->b"]);
    expect(after(withLooseEdge(), ["a"], "front")).toEqual(["b", "a->b", "a"]);
  });

  it("can be sent to the back", () => {
    expect(after(withLooseEdge(), ["a->b"], "back")).toEqual(["a->b", "a", "b"]);
  });

  it("is already in front, so bringing only it to the front does nothing", () => {
    expect(stackCommand(withLooseEdge(), ["a->b"], "front")).toBeNull();
  });

  it("is not given a layout entry when the order needs none", () => {
    const command = stackCommand(withLooseEdge(), ["b"], "back");
    expect(command?.type).toBe("reorder");
  });
});

describe("stacking is one undo step", () => {
  it("restores the document, for a plain reorder and for one that adds an entry", () => {
    for (const [d, ids, to] of [
      [five(), ["b"], "front"],
      [doc([node("a"), node("b"), { kind: "edge", id: "e", from: "a", to: "b" }], [at("a"), at("b")]), ["e"], "back"],
    ] as const) {
      const history = new History(d);
      const command = stackCommand(d, [...ids], to);
      if (!command) throw new Error("no command");
      history.execute(command);
      expect(history.undo()).toBe(true);
      expect(history.document).toEqual(d);
      expect(history.undo()).toBe(false);
    }
  });
});

describe("which stacking buttons can act", () => {
  it("enables bring to front unless the selection is on top, and send to back unless it is at the bottom", () => {
    expect(stackAvailability(five(), ["b"])).toEqual({ front: true, back: true });
    expect(stackAvailability(five(), ["d"])).toEqual({ front: false, back: true });
    expect(stackAvailability(five(), ["a"])).toEqual({ front: true, back: false });
    expect(stackAvailability(five(), ["a", "d"])).toEqual({ front: true, back: true });
    expect(stackAvailability(five(), [])).toEqual({ front: false, back: false });
  });
});

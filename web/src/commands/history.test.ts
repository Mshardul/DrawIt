import { describe, expect, it } from "vitest";
import type { DiagramDocument } from "../model/index.ts";
import { CommandError } from "./command.ts";
import type { Command } from "./command.ts";
import { History } from "./history.ts";

function sample(): DiagramDocument {
  return {
    version: 1,
    plugins: [],
    elements: [
      { kind: "node", id: "a", label: "A", shape: "rect" },
      { kind: "node", id: "b", label: "B", shape: "rect" },
    ],
    style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
    layout: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 100, y: 0 },
    ],
  };
}

const move = (id: string, x: number): Command => ({ type: "setLayout", changes: [{ id, set: { x } }] });
const label = (text: string): Command => ({ type: "setElement", id: "a", set: { label: text } });
const x = (h: History, id: string): number | undefined => h.document.layout.find((e) => e.id === id)?.x;

function clock(): { now: () => number; tick: (ms: number) => void } {
  let t = 0;
  return { now: () => t, tick: (ms) => (t += ms) };
}

describe("history", () => {
  it("undo and redo step through executed commands", () => {
    const h = new History(sample());
    h.execute(move("a", 10));
    h.execute(move("a", 20));
    expect(x(h, "a")).toBe(20);
    expect(h.undo()).toBe(true);
    expect(x(h, "a")).toBe(10);
    expect(h.undo()).toBe(true);
    expect(h.document).toEqual(sample());
    expect(h.canUndo).toBe(false);
    expect(h.redo()).toBe(true);
    expect(h.redo()).toBe(true);
    expect(x(h, "a")).toBe(20);
    expect(h.canRedo).toBe(false);
  });

  it("undo and redo with nothing to do return false", () => {
    const h = new History(sample());
    expect(h.undo()).toBe(false);
    expect(h.redo()).toBe(false);
  });

  it("a new command clears the redo steps", () => {
    const h = new History(sample());
    h.execute(move("a", 10));
    h.undo();
    h.execute(move("b", 5));
    expect(h.canRedo).toBe(false);
  });

  it("a batch, such as a drag or a paste, is one undo step", () => {
    const h = new History(sample());
    h.execute({ type: "batch", commands: [move("a", 1), move("b", 2), move("a", 3)] });
    h.undo();
    expect(h.document).toEqual(sample());
    expect(h.canUndo).toBe(false);
  });

  it("undo and redo restore the selection", () => {
    const h = new History(sample());
    h.selection = ["a"];
    h.execute(move("b", 7), { selection: ["b"] });
    expect(h.selection).toEqual(["b"]);
    h.undo();
    expect(h.selection).toEqual(["a"]);
    h.redo();
    expect(h.selection).toEqual(["b"]);
  });

  it("a command without a selection leaves the selection as it was", () => {
    const h = new History(sample());
    h.selection = ["a"];
    h.execute(move("b", 7));
    expect(h.selection).toEqual(["a"]);
  });

  it("a failing command changes neither the document nor the history", () => {
    const h = new History(sample());
    h.execute(move("a", 1));
    expect(() => {
      h.execute({ type: "delete", ids: ["nope"] });
    }).toThrow(CommandError);
    expect(x(h, "a")).toBe(1);
    h.undo();
    expect(h.document).toEqual(sample());
    expect(h.canUndo).toBe(false);
  });

  it("commands in one group within the pause are one undo step", () => {
    const c = clock();
    const h = new History(sample(), { pause: 1000, now: c.now });
    for (const text of ["H", "He", "Hel"]) {
      h.execute(label(text), { group: "typing:a" });
      c.tick(300);
    }
    expect(h.document.elements[0]).toMatchObject({ label: "Hel" });
    h.undo();
    expect(h.document).toEqual(sample());
    expect(h.canUndo).toBe(false);
    h.redo();
    expect(h.document.elements[0]).toMatchObject({ label: "Hel" });
  });

  it("a pause longer than the limit starts a new undo step", () => {
    const c = clock();
    const h = new History(sample(), { pause: 1000, now: c.now });
    h.execute(label("Hi"), { group: "typing:a" });
    c.tick(1500);
    h.execute(label("Hi there"), { group: "typing:a" });
    h.undo();
    expect(h.document.elements[0]).toMatchObject({ label: "Hi" });
    h.undo();
    expect(h.document).toEqual(sample());
  });

  it("a different group or no group starts a new undo step", () => {
    const c = clock();
    const h = new History(sample(), { pause: 1000, now: c.now });
    h.execute(label("x"), { group: "typing:a" });
    h.execute(move("b", 1), { group: "typing:b" });
    h.execute(move("b", 2));
    h.execute(move("b", 3));
    h.undo();
    h.undo();
    h.undo();
    expect(h.document.elements[0]).toMatchObject({ label: "x" });
    h.undo();
    expect(h.document).toEqual(sample());
  });

  it("a grouped step restores the selection from before the first command", () => {
    const c = clock();
    const h = new History(sample(), { now: c.now });
    h.selection = ["a"];
    h.execute(label("H"), { group: "g", selection: ["a"] });
    h.execute(label("Hi"), { group: "g", selection: ["b"] });
    h.undo();
    expect(h.selection).toEqual(["a"]);
    h.redo();
    expect(h.selection).toEqual(["b"]);
  });

  it("history keeps the starting document untouched", () => {
    const start = sample();
    const h = new History(start);
    h.execute(move("a", 9));
    expect(start).toEqual(sample());
  });
});

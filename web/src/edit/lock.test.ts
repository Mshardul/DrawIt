import { describe, expect, it } from "vitest";
import { applyCommand } from "../commands/command.ts";
import { History } from "../commands/history.ts";
import type { DiagramDocument, LayoutEntry } from "../model/index.ts";
import { moveCommand } from "../move/transform.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { deleteCommand } from "./delete.ts";
import { lockCommand, lockState, toggleLockCommand } from "./lock.ts";

const sample = (): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements: [
    { kind: "node", id: "a", shape: "rect" },
    { kind: "node", id: "b", shape: "rect" },
    { kind: "edge", id: "a->b", from: "a", to: "b" },
  ],
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout: [
    { id: "a", x: 0, y: 0, w: 100, h: 50 },
    { id: "b", x: 300, y: 0, w: 100, h: 50, locked: true },
  ],
});

const run = (document: DiagramDocument, ids: string[], locked: boolean): DiagramDocument => {
  const command = lockCommand(document, ids, locked);
  if (!command) throw new Error("no command");
  return applyCommand(document, command).document;
};
const entry = (d: DiagramDocument, id: string): LayoutEntry | undefined => d.layout.find((e) => e.id === id);

describe("lock", () => {
  it("sets locked on the selection as one setLayout command", () => {
    const command = lockCommand(sample(), ["a"], true);
    expect(command?.type).toBe("setLayout");
    expect(entry(run(sample(), ["a"], true), "a")).toEqual({ id: "a", x: 0, y: 0, w: 100, h: 50, locked: true });
  });

  it("unlocking removes the property and leaves the rest of the line", () => {
    expect(entry(run(sample(), ["b"], false), "b")).toEqual({ id: "b", x: 300, y: 0, w: 100, h: 50 });
  });

  it("writes only the elements whose state changes", () => {
    const command = lockCommand(sample(), ["a", "b"], true);
    expect(command?.type === "setLayout" && command.changes.map((c) => c.id)).toEqual(["a"]);
  });

  it("locks an edge, which may have no layout line yet", () => {
    expect(entry(run(sample(), ["a->b"], true), "a->b")).toMatchObject({ locked: true });
  });

  it("is null when nothing would change or nothing selected exists", () => {
    expect(lockCommand(sample(), ["b"], true)).toBeNull();
    expect(lockCommand(sample(), ["a"], false)).toBeNull();
    expect(lockCommand(sample(), ["a->b"], false)).toBeNull();
    expect(lockCommand(sample(), ["missing"], true)).toBeNull();
    expect(lockCommand(sample(), [], true)).toBeNull();
  });

  it("reports the state of a selection", () => {
    expect(lockState(sample(), ["a"])).toBe("unlocked");
    expect(lockState(sample(), ["b"])).toBe("locked");
    expect(lockState(sample(), ["a", "b"])).toBe("mixed");
    expect(lockState(sample(), ["missing"])).toBeNull();
    expect(lockState(sample(), [])).toBeNull();
  });

  it("toggling a mixed selection locks all of it, and toggling a locked one unlocks it", () => {
    const locked = applyCommand(sample(), toggleLockCommand(sample(), ["a", "b"]) ?? { type: "batch", commands: [] }).document;
    expect(lockState(locked, ["a", "b"])).toBe("locked");
    const open = applyCommand(locked, toggleLockCommand(locked, ["a", "b"]) ?? { type: "batch", commands: [] }).document;
    expect(lockState(open, ["a", "b"])).toBe("unlocked");
  });

  it("a locked element cannot be moved or deleted, and can again once unlocked", () => {
    const locked = run(sample(), ["a"], true);
    expect(moveCommand(locked, monoMeasurer, ["a"], 10, 10)).toBeNull();
    expect(deleteCommand(locked, monoMeasurer, ["a"])).toBeNull();
    const open = run(locked, ["a"], false);
    expect(moveCommand(open, monoMeasurer, ["a"], 10, 10)).not.toBeNull();
    expect(deleteCommand(open, monoMeasurer, ["a"])).not.toBeNull();
  });

  it("is one undo step", () => {
    const history = new History(sample());
    const command = lockCommand(history.document, ["a"], true);
    if (!command) throw new Error("no command");
    history.execute(command);
    expect(history.undo()).toBe(true);
    expect(history.document).toEqual(sample());
    expect(history.canUndo).toBe(false);
  });
});

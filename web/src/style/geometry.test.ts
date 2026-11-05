import { describe, expect, it } from "vitest";
import type { Command } from "../commands/command.ts";
import type { DiagramDocument } from "../model/index.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { geometryCommand, geometryFields } from "./geometry.ts";

function diagram(): DiagramDocument {
  return {
    version: 1,
    plugins: [{ id: "core", version: 1 }],
    elements: [
      { kind: "node", id: "a", label: "A", shape: "rect" },
      { kind: "node", id: "b", label: "B", shape: "rect" },
      { kind: "edge", id: "a->b", from: "a", to: "b" },
      { kind: "text", id: "t", content: "Hi" },
    ],
    style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
    layout: [
      { id: "a", x: 10, y: 20, w: 100, h: 50 },
      { id: "b", x: 40, y: 80, w: 80, h: 40 },
      { id: "a->b", x: 0, y: 0, via: [{ x: 30, y: 30 }] },
      { id: "t", x: 0, y: 200, w: 30 },
    ],
  };
}

const names = (ids: string[]) => geometryFields(diagram(), monoMeasurer, ids).map((field) => field.name);
const field = (ids: string[], name: string) => geometryFields(diagram(), monoMeasurer, ids).find((item) => item.name === name);
const changes = (command: Command | null) => (command?.type === "setLayout" ? command.changes : []);

describe("position and size", () => {
  it("shows x, y, width and height of one unlocked shape", () => {
    expect(names(["a"])).toEqual(["x", "y", "width", "height"]);
    expect(field(["a"], "x")).toMatchObject({ value: { state: "same", value: 10 }, disabled: false });
    expect(field(["a"], "width")).toMatchObject({ value: { state: "same", value: 100 }, disabled: false });
    expect(field(["a"], "height")?.value).toEqual({ state: "same", value: 50 });
  });

  it("shows the bounding box of several elements and no one size", () => {
    expect(names(["a", "b"])).toEqual(["x", "y"]);
    expect(field(["a", "b"], "x")?.value).toEqual({ state: "same", value: 10 });
    expect(field(["a", "b"], "y")?.value).toEqual({ state: "same", value: 20 });
  });

  it("shows a locked shape's position and no size", () => {
    const doc = diagram();
    const entry = doc.layout.find((item) => item.id === "a");
    if (entry) entry.locked = true;
    const fields = geometryFields(doc, monoMeasurer, ["a"]);
    expect(fields.map((item) => item.name)).toEqual(["x", "y"]);
    expect(fields.every((item) => item.disabled)).toBe(true);
  });

  it("shows nothing for an edge", () => {
    expect(geometryFields(diagram(), monoMeasurer, ["a->b"])).toEqual([]);
  });

  it("shows a text box's width and a height that follows its lines", () => {
    expect(field(["t"], "width")).toMatchObject({ value: { state: "same", value: 30 }, disabled: false });
    expect(field(["t"], "height")).toMatchObject({ value: { state: "same", value: 24 }, disabled: true });
  });

  it("moves the selection by the difference in x and carries an edge whose ends both move", () => {
    const command = geometryCommand(diagram(), monoMeasurer, ["a", "b"], "x", 0);
    expect(changes(command)).toEqual([
      { id: "a", set: { x: 0, y: 20 } },
      { id: "b", set: { x: 30, y: 80 } },
      { id: "a->b", set: { via: [{ x: 20, y: 30 }] } },
    ]);
  });

  it("leaves a locked element where it is", () => {
    const doc = diagram();
    const entry = doc.layout.find((item) => item.id === "b");
    if (entry) entry.locked = true;
    const command = geometryCommand(doc, monoMeasurer, ["a", "b"], "y", 0);
    expect(changes(command)).toEqual([{ id: "a", set: { x: 10, y: 0 } }]);
  });

  it("writes a new width and stops at 8", () => {
    expect(changes(geometryCommand(diagram(), monoMeasurer, ["a"], "width", 120))).toEqual([{ id: "a", set: { w: 120 } }]);
    expect(changes(geometryCommand(diagram(), monoMeasurer, ["a"], "width", 4))).toEqual([{ id: "a", set: { w: 8 } }]);
    expect(geometryCommand(diagram(), monoMeasurer, ["a"], "width", 100)).toBeNull();
  });

  it("does not give a text box a height", () => {
    expect(geometryCommand(diagram(), monoMeasurer, ["t"], "height", 80)).toBeNull();
    expect(changes(geometryCommand(diagram(), monoMeasurer, ["t"], "width", 80))).toEqual([{ id: "t", set: { w: 80 } }]);
  });
});

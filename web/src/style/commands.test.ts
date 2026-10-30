import { describe, expect, it } from "vitest";
import { applyCommand, applyPatches } from "../commands/command.ts";
import type { DiagramDocument } from "../model/index.ts";
import { clearStyle, setStyle } from "./commands.ts";

function sample(): DiagramDocument {
  return {
    version: 1,
    plugins: [{ id: "core", version: 1 }],
    elements: [
      { kind: "node", id: "a", label: "A", shape: "rect", class: "c" },
      { kind: "node", id: "b", label: "B", shape: "rect" },
      { kind: "text", id: "t", content: "hello" },
    ],
    style: {
      theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} },
      classes: [{ name: "c", props: { fill: "red" } }],
      overrides: [
        { id: "a", props: { fill: "blue", dash: "dashed" } },
        { id: "t", props: { fill: "green" } },
      ],
    },
    layout: [],
  };
}

describe("style commands", () => {
  it("setStyle writes the property on the override of every selected element, creating missing lines", () => {
    const command = setStyle(["a", "b"], { stroke: "$accent" });
    const { document } = applyCommand(sample(), command);
    expect(document.style.overrides).toEqual([
      { id: "a", props: { fill: "blue", dash: "dashed", stroke: "$accent" } },
      { id: "t", props: { fill: "green" } },
      { id: "b", props: { stroke: "$accent" } },
    ]);
  });

  it("clearStyle removes the property from the override and leaves the other properties", () => {
    const { document } = applyCommand(sample(), clearStyle(["a"], ["fill"]));
    expect(document.style.overrides[0]).toEqual({ id: "a", props: { dash: "dashed" } });
  });

  it("clearStyle drops an override line that has no property left", () => {
    const { document } = applyCommand(sample(), clearStyle(["t"], ["fill"]));
    expect(document.style.overrides.map((o) => o.id)).toEqual(["a"]);
  });

  it("clearStyle on an element with no override leaves the style section unchanged", () => {
    const { document } = applyCommand(sample(), clearStyle(["b"], ["fill"]));
    expect(document.style).toEqual(sample().style);
  });

  it("clearStyle never touches the class", () => {
    const { document } = applyCommand(sample(), clearStyle(["a"], ["fill"]));
    expect(document.style.classes).toEqual(sample().style.classes);
  });

  it("one undo restores every selected element", () => {
    const before = sample();
    const { document, inverse } = applyCommand(before, clearStyle(["a", "t"], ["fill"]));
    expect(document).not.toEqual(before);
    expect(applyPatches(document, inverse)).toEqual(before);
  });

  it("an unknown element fails the whole command", () => {
    expect(() => applyCommand(sample(), setStyle(["a", "nope"], { fill: "red" }))).toThrow(/No element "nope"/);
  });
});

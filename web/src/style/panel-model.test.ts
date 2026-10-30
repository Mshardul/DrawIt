import { describe, expect, it } from "vitest";
import type { DiagramDocument } from "../model/index.ts";
import { panelFields } from "./panel-model.ts";

function sample(): DiagramDocument {
  return {
    version: 1,
    plugins: [{ id: "core", version: 1 }],
    elements: [
      { kind: "node", id: "a", label: "A", shape: "rect" },
      { kind: "node", id: "b", label: "B", shape: "rect" },
      { kind: "node", id: "e", label: "E", shape: "ellipse" },
      { kind: "text", id: "t", content: "hello" },
      { kind: "edge", id: "a->b", from: "a", to: "b" },
    ],
    style: {
      theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} },
      classes: [],
      overrides: [
        { id: "b", props: { fill: "#ff0000", opacity: 0.5 } },
        { id: "t", props: { opacity: 0.5 } },
      ],
    },
    layout: [],
  };
}

const keys = (selection: string[]): string[] => panelFields(sample(), selection).map((f) => f.def.key);
const field = (selection: string[], key: string) => panelFields(sample(), selection).find((f) => f.def.key === key);

describe("style panel fields", () => {
  it("is empty when nothing is selected or the selection is not in the document", () => {
    expect(panelFields(sample(), [])).toEqual([]);
    expect(panelFields(sample(), ["gone"])).toEqual([]);
  });

  it("lists fill, stroke, stroke width, radius and opacity in registry order", () => {
    expect(keys(["a"])).toEqual(["fill", "opacity", "stroke", "strokeWidth", "radius"]);
  });

  it("shows the resolved value, so a default shows as the theme's colour", () => {
    expect(field(["a"], "fill")?.value).toEqual({ state: "same", value: "#dbe8f5" });
    expect(field(["b"], "fill")?.value).toEqual({ state: "same", value: "#ff0000" });
  });

  it("shows mixed when the selected elements differ", () => {
    expect(field(["a", "b"], "fill")?.value).toEqual({ state: "mixed" });
    expect(field(["a", "b"], "stroke")?.value).toEqual({ state: "same", value: "#1f4e79" });
  });

  it("shows radius for the built-in rectangle and text boxes only", () => {
    expect(keys(["a"])).toContain("radius");
    expect(keys(["t"])).toContain("radius");
    expect(keys(["e"])).not.toContain("radius");
    expect(keys(["a->b"])).not.toContain("radius");
  });

  it("has no fill for an edge", () => {
    expect(keys(["a->b"])).toEqual(["opacity", "stroke", "strokeWidth"]);
  });

  it("takes a field's value and targets from the elements it applies to", () => {
    const radius = field(["a", "e", "a->b"], "radius");
    expect(radius?.ids).toEqual(["a"]);
    expect(radius?.value).toEqual({ state: "same", value: 0 });
    expect(field(["a", "a->b"], "fill")?.ids).toEqual(["a"]);
  });

  it("marks a field as overridden when any target has an override line for it", () => {
    expect(field(["a"], "fill")?.overridden).toBe(false);
    expect(field(["a", "b"], "fill")?.overridden).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import type { DiagramDocument, DiagramElement } from "../model/index.ts";
import { styleOf } from "./of.ts";

const node: DiagramElement = { kind: "node", id: "a", shape: "rect" };

function doc(overrides: DiagramDocument["style"]["overrides"] = []): DiagramDocument {
  return {
    version: 1,
    plugins: [],
    elements: [node],
    style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides },
    layout: [],
  };
}

describe("style of an element", () => {
  it("resolves with the default look and the built-in theme", () => {
    expect(styleOf(doc(), node)).toMatchObject({ fill: "#dbe8f5", stroke: "#1f4e79", strokeWidth: 1.5 });
  });

  it("applies the document's overrides", () => {
    expect(styleOf(doc([{ id: "a", props: { fill: "$accent" } }]), node).fill).toBe("#e8732a");
  });

  it("gives the same object again while the style section is unchanged", () => {
    const d = doc();
    expect(styleOf(d, node)).toBe(styleOf({ ...d, layout: [{ id: "a", x: 1, y: 1 }] }, node));
  });

  it("resolves again when the style section changes", () => {
    const d = doc();
    const edited = { ...d, style: { ...d.style, overrides: [{ id: "a", props: { opacity: 0.5 } }] } };
    expect(styleOf(edited, node).opacity).toBe(0.5);
  });
});

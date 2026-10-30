import { describe, expect, it } from "vitest";
import { applyCommand } from "../commands/command.ts";
import { readDiagram } from "../kdl/read.ts";
import { writeDiagram } from "../kdl/write.ts";
import type { DiagramDocument, LayoutEntry } from "../model/index.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { DEFAULT_LOOK } from "../style/text-look.ts";
import { edgeLabelLayout, labelDragCommand } from "./label.ts";

const line = [{ x: 100, y: 25 }, { x: 300, y: 25 }];

describe("where an edge label is drawn", () => {
  it("is centred on the middle of the path by default", () => {
    expect(edgeLabelLayout(line, undefined, "Hi", monoMeasurer, DEFAULT_LOOK)).toEqual({ lines: ["Hi"], box: { x: 190, y: 13, w: 20, h: 24 } });
  });

  it("is centred on the point at its position along the path", () => {
    expect(edgeLabelLayout(line, 0.25, "Hi", monoMeasurer, DEFAULT_LOOK)?.box).toEqual({ x: 140, y: 13, w: 20, h: 24 });
    expect(edgeLabelLayout(line, 1, "Hi", monoMeasurer, DEFAULT_LOOK)?.box).toEqual({ x: 290, y: 13, w: 20, h: 24 });
  });

  it("follows the path round a corner", () => {
    const bent = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(edgeLabelLayout(bent, 0.75, "Hi", monoMeasurer, DEFAULT_LOOK)?.box).toEqual({ x: 90, y: 38, w: 20, h: 24 });
  });

  it("is as wide as its longest line and as tall as its lines, and never wraps", () => {
    const layout = edgeLabelLayout(line, 0.5, "a\nbbbb", monoMeasurer, DEFAULT_LOOK);
    expect(layout?.lines).toEqual(["a", "bbbb"]);
    expect(layout?.box).toEqual({ x: 180, y: 1, w: 40, h: 48 });
  });

  it("has a small box when empty, so there is still somewhere to edit", () => {
    expect(edgeLabelLayout(line, 0.5, "", monoMeasurer, DEFAULT_LOOK)?.box).toEqual({ x: 196, y: 13, w: 8, h: 24 });
  });

  it("is null for a path that is not drawn", () => {
    expect(edgeLabelLayout([], 0.5, "Hi", monoMeasurer, DEFAULT_LOOK)).toBeNull();
  });
});

const doc = (extra: Partial<LayoutEntry> = {}): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements: [
    { kind: "node", id: "a", shape: "rect" },
    { kind: "node", id: "b", shape: "rect" },
    { kind: "edge", id: "e", from: "a", to: "b", label: "Hi" },
  ],
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout: [
    { id: "a", x: 0, y: 0, w: 100, h: 50 },
    { id: "b", x: 300, y: 0, w: 100, h: 50 },
    { id: "e", x: 0, y: 0, ...extra },
  ],
});

const dragged = (d: DiagramDocument, x: number, y = 25): number | undefined => {
  const command = labelDragCommand(d, monoMeasurer, "e", { x, y });
  return command ? applyCommand(d, command).document.layout.find((e) => e.id === "e")?.labelAt : undefined;
};

describe("dragging an edge label along its path", () => {
  it("sets its position to the point of the path nearest the pointer, in hundredths", () => {
    expect(dragged(doc(), 150)).toBe(0.25);
    expect(dragged(doc(), 151)).toBe(0.26);
    expect(dragged(doc(), 150, 400)).toBe(0.25);
  });

  it("stops at the ends of the path", () => {
    expect(dragged(doc(), 0)).toBe(0);
    expect(dragged(doc(), 900)).toBe(1);
  });

  it("makes nothing when the label stays where it is, by default or by a stored position", () => {
    expect(dragged(doc(), 200)).toBeUndefined();
    expect(dragged(doc({ labelAt: 0.25 }), 150)).toBeUndefined();
  });

  it("makes nothing for a locked edge, an unknown edge or an element that is not an edge", () => {
    expect(labelDragCommand(doc({ locked: true }), monoMeasurer, "e", { x: 150, y: 25 })).toBeNull();
    expect(labelDragCommand(doc(), monoMeasurer, "nope", { x: 150, y: 25 })).toBeNull();
    expect(labelDragCommand(doc(), monoMeasurer, "a", { x: 150, y: 25 })).toBeNull();
  });

  it("is one command, so undo puts the label back", () => {
    const d = doc();
    const command = labelDragCommand(d, monoMeasurer, "e", { x: 150, y: 25 });
    expect(command && applyCommand(d, command).inverse.length).toBeGreaterThan(0);
  });

  it("is saved as label-at and read back", () => {
    const d = doc();
    const command = labelDragCommand(d, monoMeasurer, "e", { x: 150, y: 25 });
    const text = command ? writeDiagram(applyCommand(d, command).document) : "";
    expect(text).toContain("label-at=0.25");
    expect(readDiagram(text).document.layout.find((e) => e.id === "e")?.labelAt).toBe(0.25);
  });
});

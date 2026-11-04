import { describe, expect, it } from "vitest";
import { applyCommand } from "../commands/command.ts";
import { readDiagram } from "../kdl/read.ts";
import { writeDiagram } from "../kdl/write.ts";
import type { DiagramDocument, DiagramElement } from "../model/index.ts";
import { MIN_SIZE } from "../move/transform.ts";
import { newFrameCommand } from "./place.ts";

const doc = (elements: DiagramElement[] = []): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements,
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout: elements.map((e, i) => ({ id: e.id, x: i * 10, y: 0, w: 10, h: 10 })),
});

const draw = (d: DiagramDocument, from: { x: number; y: number }, to: { x: number; y: number } | null, grid = 0) => {
  const made = newFrameCommand(d, from, to, grid);
  return { ...made, document: applyCommand(d, made.command).document };
};
const layoutOf = (d: DiagramDocument, id: string) => d.layout.find((e) => e.id === id);

describe("drawing a frame", () => {
  it("adds a frame with no name, after everything so it draws on top", () => {
    const { id, document } = draw(doc([{ kind: "node", id: "a", shape: "rect" }]), { x: 0, y: 0 }, { x: 100, y: 80 });
    expect(id).toBe("frame");
    expect(document.elements.at(-1)).toEqual({ kind: "frame", id: "frame" });
    expect(document.layout.at(-1)?.id).toBe("frame");
  });

  it("sizes the frame from press to release in any direction", () => {
    for (const [from, to] of [
      [{ x: 100, y: 100 }, { x: 250, y: 190 }],
      [{ x: 250, y: 190 }, { x: 100, y: 100 }],
      [{ x: 250, y: 100 }, { x: 100, y: 190 }],
    ] as const) {
      const { id, document } = draw(doc(), from, to);
      expect(layoutOf(document, id)).toEqual({ id, x: 100, y: 100, w: 150, h: 90 });
    }
  });

  it("keeps a dragged frame at least as large as the smallest size", () => {
    const { id, document } = draw(doc(), { x: 100, y: 100 }, { x: 101, y: 102 });
    expect(layoutOf(document, id)).toMatchObject({ w: MIN_SIZE, h: MIN_SIZE });
  });

  it("a click places a frame of the default frame size centred on the point", () => {
    const { id, document } = draw(doc(), { x: 300, y: 200 }, null);
    expect(layoutOf(document, id)).toEqual({ id, x: 60, y: 40, w: 480, h: 320 });
  });

  it("rounds to whole px and snaps both corners to the grid", () => {
    const rounded = draw(doc(), { x: 10.4, y: 20.6 }, { x: 110.2, y: 90.7 });
    expect(layoutOf(rounded.document, rounded.id)).toEqual({ id: rounded.id, x: 10, y: 21, w: 100, h: 70 });
    const snapped = draw(doc(), { x: 13, y: 21 }, { x: 109, y: 83 }, 16);
    expect(layoutOf(snapped.document, snapped.id)).toEqual({ id: snapped.id, x: 16, y: 16, w: 96, h: 64 });
  });

  it("takes an unused ID built from frame", () => {
    const { id } = draw(doc([{ kind: "frame", id: "frame" }, { kind: "frame", id: "frame-2" }]), { x: 0, y: 0 }, { x: 50, y: 50 });
    expect(id).toBe("frame-3");
  });

  it("is one undoable command that survives writing and reading", () => {
    const made = draw(doc(), { x: 40, y: 40 }, { x: 240, y: 140 });
    expect(made.command.type).toBe("add");
    const again = readDiagram(writeDiagram(made.document)).document;
    expect(again.elements).toEqual([{ kind: "frame", id: "frame" }]);
    expect(layoutOf(again, "frame")).toMatchObject({ x: 40, y: 40, w: 200, h: 100 });
  });
});

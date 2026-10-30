import { describe, expect, it } from "vitest";
import { applyCommand } from "../commands/command.ts";
import { readDiagram } from "../kdl/read.ts";
import { writeDiagram } from "../kdl/write.ts";
import type { DiagramDocument, DiagramElement } from "../model/index.ts";
import { newShapeCommand } from "./place.ts";

const doc = (elements: DiagramElement[] = []): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements,
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout: elements.map((e, i) => ({ id: e.id, x: i * 10, y: 0, w: 10, h: 10 })),
});

const place = (d: DiagramDocument, shape: string, from: { x: number; y: number }, to: { x: number; y: number } | null = null, grid = 0) => {
  const made = newShapeCommand(d, { shape, size: { w: 160, h: 80 } }, from, to, grid);
  return { ...made, document: applyCommand(d, made.command).document };
};
const layoutOf = (d: DiagramDocument, id: string) => d.layout.find((e) => e.id === id);

describe("placing a shape", () => {
  it("adds a node of the shape, after everything so it draws on top", () => {
    const { id, document } = place(doc([{ kind: "node", id: "a", shape: "rect" }]), "arch.server", { x: 0, y: 0 });
    expect(document.elements.at(-1)).toEqual({ kind: "node", id, shape: "arch.server" });
    expect(document.layout.at(-1)?.id).toBe(id);
  });

  it("centres the node on a click, at the shape's size, with the size written", () => {
    const { id, document } = place(doc(), "rect", { x: 300, y: 200 });
    expect(layoutOf(document, id)).toEqual({ id, x: 220, y: 160, w: 160, h: 80 });
  });

  it("rounds a click to whole px", () => {
    const { id, document } = place(doc(), "rect", { x: 300.4, y: 200.6 });
    expect(layoutOf(document, id)).toMatchObject({ x: 220, y: 161 });
  });

  it("sizes the node from press to release in any direction", () => {
    for (const [from, to] of [
      [{ x: 100, y: 100 }, { x: 250, y: 190 }],
      [{ x: 250, y: 190 }, { x: 100, y: 100 }],
      [{ x: 250, y: 100 }, { x: 100, y: 190 }],
    ] as const) {
      const { id, document } = place(doc(), "rect", from, to);
      expect(layoutOf(document, id)).toEqual({ id, x: 100, y: 100, w: 150, h: 90 });
    }
  });

  it("keeps a dragged node at least as large as the smallest size", () => {
    const { id, document } = place(doc(), "rect", { x: 100, y: 100 }, { x: 102, y: 300 });
    expect(layoutOf(document, id)).toMatchObject({ w: 8, h: 200 });
  });

  it("snaps a click's corner and a drag's corners to the grid", () => {
    const click = place(doc(), "rect", { x: 303, y: 197 }, null, 16);
    expect(layoutOf(click.document, click.id)).toMatchObject({ x: 224, y: 160, w: 160, h: 80 });
    const drag = place(doc(), "rect", { x: 103, y: 99 }, { x: 251, y: 190 }, 16);
    expect(layoutOf(drag.document, drag.id)).toMatchObject({ x: 96, y: 96, w: 160, h: 96 });
  });

  it("builds the ID from the shape without its pack prefix", () => {
    expect(place(doc(), "arch.load-balancer", { x: 0, y: 0 }).id).toBe("load-balancer");
    expect(place(doc(), "core.rounded-rect", { x: 0, y: 0 }).id).toBe("rounded-rect");
    expect(place(doc(), "rect", { x: 0, y: 0 }).id).toBe("rect");
  });

  it("numbers the ID when it is taken", () => {
    const taken = doc([{ kind: "node", id: "server", shape: "rect" }, { kind: "node", id: "server-2", shape: "rect" }]);
    expect(place(taken, "arch.server", { x: 0, y: 0 }).id).toBe("server-3");
  });

  it("writes a file that reads back to the same document", () => {
    const { document } = place(doc(), "arch.database", { x: 300, y: 200 });
    expect(writeDiagram(readDiagram(writeDiagram(document)).document)).toBe(writeDiagram(document));
  });
});

import { describe, expect, it } from "vitest";
import { applyCommand } from "../commands/command.ts";
import { readDiagram } from "../kdl/read.ts";
import { writeDiagram } from "../kdl/write.ts";
import type { DiagramDocument, DiagramElement, EdgeElement, LayoutEntry } from "../model/index.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { draftPath, drawEndAt, newEdgeCommand } from "./draw.ts";

const doc = (elements: DiagramElement[] = [], extra: LayoutEntry[] = []): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements: [
    { kind: "node", id: "a", shape: "rect" },
    { kind: "node", id: "b", shape: "ellipse" },
    { kind: "frame", id: "f" },
    ...elements,
  ],
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout: [
    { id: "f", x: 0, y: 0, w: 2000, h: 2000 },
    { id: "a", x: 0, y: 0, w: 100, h: 50 },
    { id: "b", x: 300, y: 0, w: 100, h: 50 },
    ...extra,
  ],
});

const edgeOf = (d: DiagramDocument, id: string): EdgeElement => {
  const found = d.elements.find((e) => e.id === id);
  if (found?.kind !== "edge") throw new Error(`no edge ${id}`);
  return found;
};

const draw = (d: DiagramDocument, from: Parameters<typeof newEdgeCommand>[1], to: Parameters<typeof newEdgeCommand>[2]) => {
  const made = newEdgeCommand(d, from, to);
  if (!made) throw new Error("no edge made");
  return { ...made, document: applyCommand(d, made.command).document };
};

describe("drawing an edge", () => {
  it("between two shapes adds an edge named after its ends, placed by auto anchors", () => {
    const { id, document } = draw(doc(), { id: "a" }, { id: "b" });
    expect(id).toBe("a->b");
    expect(edgeOf(document, id)).toMatchObject({ from: "a", to: "b" });
    expect(document.layout.some((e) => e.id === id)).toBe(false);
  });

  it("adds it after everything, so it draws on top", () => {
    const { document } = draw(doc(), { id: "a" }, { id: "b" });
    expect(document.elements.at(-1)?.id).toBe("a->b");
  });

  it("gets an explicit ID when another edge already joins the same two shapes", () => {
    const first = draw(doc(), { id: "a" }, { id: "b" });
    const second = draw(first.document, { id: "a" }, { id: "b" });
    const third = draw(second.document, { id: "a" }, { id: "b" });
    expect([first.id, second.id, third.id]).toEqual(["a->b", "edge", "edge-2"]);
  });

  it("joining the same shapes the other way round needs no explicit ID", () => {
    const first = draw(doc(), { id: "a" }, { id: "b" });
    expect(draw(first.document, { id: "b" }, { id: "a" }).id).toBe("b->a");
  });

  it("never takes the ID of an element that exists", () => {
    const d = doc([{ kind: "text", id: "edge", content: "x" }], [{ id: "edge", x: 0, y: 200 }]);
    const first = draw(d, { id: "a" }, { point: { x: 500, y: 500 } });
    expect(first.id).toBe("edge-2");
  });

  it("from a shape to a free point writes the point in the layout, and the end is a dash in the file", () => {
    const { id, document } = draw(doc(), { id: "a" }, { point: { x: 500.4, y: 120.6 } });
    expect(id).toBe("edge");
    expect(edgeOf(document, id)).toMatchObject({ from: "a", to: null });
    expect(document.layout.find((e) => e.id === id)?.toPoint).toEqual({ x: 500, y: 121 });
    expect(writeDiagram(document)).toContain("edge a - id=edge");
  });

  it("from a free point to a shape, and between two free points", () => {
    const fromPoint = draw(doc(), { point: { x: 10, y: 200 } }, { id: "b" });
    expect(edgeOf(fromPoint.document, fromPoint.id)).toMatchObject({ from: null, to: "b" });
    expect(fromPoint.document.layout.find((e) => e.id === fromPoint.id)?.fromPoint).toEqual({ x: 10, y: 200 });
    const both = draw(doc(), { point: { x: 10, y: 200 } }, { point: { x: 90, y: 300 } });
    const entry = both.document.layout.find((e) => e.id === both.id);
    expect(entry).toMatchObject({ fromPoint: { x: 10, y: 200 }, toPoint: { x: 90, y: 300 } });
  });

  it("makes nothing from a shape to itself, or from a point to the same point", () => {
    expect(newEdgeCommand(doc(), { id: "a" }, { id: "a" })).toBeNull();
    expect(newEdgeCommand(doc(), { point: { x: 5, y: 5 } }, { point: { x: 5.2, y: 5.4 } })).toBeNull();
  });

  it("is one command, so undo takes the whole edge away", () => {
    const d = doc();
    const { command, document } = draw(d, { id: "a" }, { point: { x: 500, y: 120 } });
    const { inverse } = applyCommand(d, command);
    expect(document.elements).toHaveLength(d.elements.length + 1);
    expect(inverse.length).toBeGreaterThan(0);
  });

  it("is saved in canonical form and read back as the same edge", () => {
    const { document } = draw(draw(doc(), { id: "a" }, { id: "b" }).document, { id: "a" }, { id: "b" });
    const text = writeDiagram(document);
    expect(text).toContain("edge a b\n");
    expect(text).toContain("edge a b id=edge\n");
    expect(readDiagram(text).document.elements.filter((e) => e.kind === "edge").map((e) => e.id)).toEqual(["a->b", "edge"]);
  });
});

describe("the end under the pointer", () => {
  it("is the topmost shape there, and not a frame", () => {
    expect(drawEndAt(doc(), monoMeasurer, { x: 50, y: 25 })).toEqual({ id: "a" });
    expect(drawEndAt(doc(), monoMeasurer, { x: 350, y: 25 })).toEqual({ id: "b" });
  });

  it("is a free point, rounded, over empty canvas or a frame", () => {
    expect(drawEndAt(doc(), monoMeasurer, { x: 600.4, y: 700.6 })).toEqual({ point: { x: 600, y: 701 } });
  });

  it("a corner of an ellipse's box is not on the ellipse", () => {
    expect(drawEndAt(doc(), monoMeasurer, { x: 302, y: 2 })).toEqual({ point: { x: 302, y: 2 } });
  });
});

describe("the edge being drawn", () => {
  it("runs from the outline of the start shape to the pointer", () => {
    const path = draftPath(doc(), monoMeasurer, { id: "a" }, { point: { x: 200, y: 25 } });
    expect(path).toEqual([{ x: 100, y: 25 }, { x: 200, y: 25 }]);
  });

  it("ends on the outline of the shape under the pointer", () => {
    const path = draftPath(doc(), monoMeasurer, { id: "a" }, { id: "b" });
    expect(path[0]).toEqual({ x: 100, y: 25 });
    expect(path.at(-1)).toEqual({ x: 300, y: 25 });
  });

  it("starts at a free point", () => {
    expect(draftPath(doc(), monoMeasurer, { point: { x: 10, y: 10 } }, { point: { x: 50, y: 10 } })).toEqual([{ x: 10, y: 10 }, { x: 50, y: 10 }]);
  });

  it("is empty while the pointer is still on the start shape", () => {
    expect(draftPath(doc(), monoMeasurer, { id: "a" }, { id: "a" })).toEqual([]);
  });
});

describe("the line shown while drawing, from a pack shape", () => {
  it("leaves the shape at its outline, not at its box", () => {
    const d = doc([{ kind: "node", id: "db", shape: "arch.database" }], [{ id: "db", x: 0, y: 200, w: 96, h: 112 }]);
    const [start] = draftPath(d, monoMeasurer, { id: "db" }, { point: { x: 200, y: 100 } });
    expect(start?.x).toBeLessThan(95);
  });
});

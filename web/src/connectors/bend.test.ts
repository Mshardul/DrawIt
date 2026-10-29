import { describe, expect, it } from "vitest";
import { applyCommand } from "../commands/command.ts";
import { readDiagram } from "../kdl/read.ts";
import { writeDiagram } from "../kdl/write.ts";
import type { DiagramDocument, LayoutEntry, Point } from "../model/index.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { addBendCommand, moveBendCommand, removeBendCommand } from "./bend.ts";

const doc = (via?: Point[], extra: Partial<LayoutEntry> = {}, elbow = false): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements: [
    { kind: "node", id: "a", shape: "rect" },
    { kind: "node", id: "b", shape: "rect" },
    { kind: "edge", id: "e", from: "a", to: "b" },
  ],
  style: {
    theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} },
    classes: [],
    overrides: elbow ? [{ id: "e", props: { route: "elbow" } }] : [],
  },
  layout: [
    { id: "a", x: 0, y: 0, w: 100, h: 50 },
    { id: "b", x: 300, y: 0, w: 100, h: 50 },
    { id: "e", x: 0, y: 0, ...(via && { via }), ...extra },
  ],
});

const viaOf = (d: DiagramDocument): Point[] | undefined => d.layout.find((e) => e.id === "e")?.via;

const add = (d: DiagramDocument, p: Point) => {
  const made = addBendCommand(d, monoMeasurer, "e", p);
  if (!made) throw new Error("no command");
  return { index: made.index, document: applyCommand(d, made.command).document };
};

describe("adding a bend point", () => {
  it("puts the first point on the path nearest the click, as whole px", () => {
    const { index, document } = add(doc(), { x: 200.4, y: 31 });
    expect(index).toBe(0);
    expect(viaOf(document)).toEqual([{ x: 200, y: 25 }]);
  });

  it("goes before the existing points that lie later along the path", () => {
    const d = doc([{ x: 200, y: 100 }]);
    const first = add(d, { x: 150, y: 60 });
    expect(first.index).toBe(0);
    expect(viaOf(first.document)).toHaveLength(2);
    expect(viaOf(first.document)?.[1]).toEqual({ x: 200, y: 100 });
  });

  it("goes after the existing points that lie earlier along the path", () => {
    const d = doc([{ x: 200, y: 100 }]);
    const second = add(d, { x: 250, y: 62 });
    expect(second.index).toBe(1);
    expect(viaOf(second.document)?.[0]).toEqual({ x: 200, y: 100 });
  });

  it("finds its place on an elbow path, where the path has corners that are not bend points", () => {
    const d = doc([{ x: 200, y: 150 }], {}, true);
    const nearTheEnd = add(d, { x: 300, y: 120 });
    expect(nearTheEnd.index).toBe(1);
    expect(viaOf(nearTheEnd.document)?.[0]).toEqual({ x: 200, y: 150 });
  });

  it("is one command, so undo takes the point away", () => {
    const d = doc();
    const made = addBendCommand(d, monoMeasurer, "e", { x: 200, y: 25 });
    expect(made).not.toBeNull();
    if (!made) return;
    const { document, inverse } = applyCommand(d, made.command);
    expect(viaOf(document)).toHaveLength(1);
    expect(inverse.length).toBeGreaterThan(0);
  });

  it("makes nothing for a locked edge, an unknown ID or an element that is not an edge", () => {
    expect(addBendCommand(doc(undefined, { locked: true }), monoMeasurer, "e", { x: 200, y: 25 })).toBeNull();
    expect(addBendCommand(doc(), monoMeasurer, "nope", { x: 200, y: 25 })).toBeNull();
    expect(addBendCommand(doc(), monoMeasurer, "a", { x: 200, y: 25 })).toBeNull();
  });
});

describe("moving a bend point", () => {
  const d = doc([{ x: 200, y: 100 }, { x: 250, y: 100 }]);

  it("sets that point, as whole px, and leaves the others", () => {
    const command = moveBendCommand(d, "e", 1, { x: 260.4, y: 120.6 });
    expect(command && viaOf(applyCommand(d, command).document)).toEqual([{ x: 200, y: 100 }, { x: 260, y: 121 }]);
  });

  it("makes nothing for a point that does not exist, a point left where it was or a locked edge", () => {
    expect(moveBendCommand(d, "e", 2, { x: 0, y: 0 })).toBeNull();
    expect(moveBendCommand(d, "e", -1, { x: 0, y: 0 })).toBeNull();
    expect(moveBendCommand(d, "e", 0, { x: 200.2, y: 99.8 })).toBeNull();
    expect(moveBendCommand(doc([{ x: 1, y: 1 }], { locked: true }), "e", 0, { x: 5, y: 5 })).toBeNull();
  });
});

describe("removing a bend point", () => {
  it("takes that point out and keeps the others in order", () => {
    const d = doc([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]);
    const command = removeBendCommand(d, "e", 1);
    expect(command && viaOf(applyCommand(d, command).document)).toEqual([{ x: 1, y: 1 }, { x: 3, y: 3 }]);
  });

  it("removing the last point leaves no via at all, so the file has no empty list", () => {
    const d = doc([{ x: 200, y: 100 }]);
    const command = removeBendCommand(d, "e", 0);
    const after = command && applyCommand(d, command).document;
    expect(after && viaOf(after)).toBeUndefined();
    expect(after && writeDiagram(after)).not.toContain("via");
  });

  it("makes nothing for a point that does not exist or a locked edge", () => {
    expect(removeBendCommand(doc(), "e", 0)).toBeNull();
    expect(removeBendCommand(doc([{ x: 1, y: 1 }]), "e", 1)).toBeNull();
    expect(removeBendCommand(doc([{ x: 1, y: 1 }], { locked: true }), "e", 0)).toBeNull();
  });
});

describe("bend points in the file", () => {
  it("are saved in canonical form and read back", () => {
    const { document } = add(add(doc(), { x: 150, y: 25 }).document, { x: 250, y: 25 });
    const text = writeDiagram(document);
    expect(text).toContain('via="150,25 250,25"');
    expect(readDiagram(text).document.layout.find((e) => e.id === "e")?.via).toEqual([{ x: 150, y: 25 }, { x: 250, y: 25 }]);
  });
});

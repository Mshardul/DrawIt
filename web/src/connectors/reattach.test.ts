import { describe, expect, it } from "vitest";
import { applyCommand } from "../commands/command.ts";
import { readDiagram } from "../kdl/read.ts";
import { writeDiagram } from "../kdl/write.ts";
import type { DiagramDocument, EdgeElement, LayoutEntry } from "../model/index.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { reattachCommand } from "./reattach.ts";

const doc = (extra: LayoutEntry[] = []): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements: [
    { kind: "node", id: "a", shape: "rect" },
    { kind: "node", id: "b", shape: "rect" },
    { kind: "node", id: "c", shape: "ellipse" },
    { kind: "frame", id: "f" },
    { kind: "edge", id: "a->b", from: "a", to: "b" },
  ],
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout: [
    { id: "f", x: 0, y: 0, w: 2000, h: 2000 },
    { id: "a", x: 0, y: 0, w: 100, h: 50 },
    { id: "b", x: 300, y: 0, w: 100, h: 50 },
    { id: "c", x: 300, y: 200, w: 100, h: 100 },
    ...extra,
  ],
});

const reattach = (d: DiagramDocument, end: "from" | "to", at: { x: number; y: number }) => {
  const command = reattachCommand(d, monoMeasurer, "a->b", end, at);
  if (!command) throw new Error("no command");
  return applyCommand(d, command).document;
};

const edgeOf = (d: DiagramDocument): EdgeElement => {
  const found = d.elements.find((e) => e.id === "a->b");
  if (found?.kind !== "edge") throw new Error("no edge");
  return found;
};
const entryOf = (d: DiagramDocument): LayoutEntry | undefined => d.layout.find((e) => e.id === "a->b");

describe("re-attaching an edge end", () => {
  it("dropped on a shape attaches to it at the side and position nearest the drop, never auto", () => {
    const d = reattach(doc(), "to", { x: 330, y: 205 });
    expect(edgeOf(d)).toMatchObject({ from: "a", to: "c" });
    expect(entryOf(d)?.to).toEqual({ side: "top", at: 0.3 });
    expect(entryOf(d)?.from).toBeUndefined();
  });

  it("dropped on a shape's side writes that side", () => {
    const d = reattach(doc(), "from", { x: 301, y: 250 });
    expect(edgeOf(d)).toMatchObject({ from: "c", to: "b" });
    expect(entryOf(d)?.from).toEqual({ side: "left", at: 0.5 });
  });

  it("dropped on empty canvas detaches the end to the rounded point", () => {
    const d = reattach(doc(), "to", { x: 600.4, y: 700.6 });
    expect(edgeOf(d)).toMatchObject({ from: "a", to: null });
    expect(entryOf(d)?.toPoint).toEqual({ x: 600, y: 701 });
  });

  it("dropped on a frame detaches, since a frame is a region and not a thing to connect", () => {
    const d = reattach(doc(), "to", { x: 900, y: 900 });
    expect(edgeOf(d).to).toBeNull();
  });

  it("drops the anchor of an end that becomes free, and the point of an end that becomes attached", () => {
    const attached = doc([{ id: "a->b", x: 0, y: 0, to: { side: "left", at: 0.2 } }]);
    const freed = reattach(attached, "to", { x: 800, y: 800 });
    expect(entryOf(freed)?.to).toBeUndefined();
    const back = reattach(freed, "to", { x: 350, y: 25 });
    expect(entryOf(back)?.toPoint).toBeUndefined();
    expect(edgeOf(back).to).toBe("b");
  });

  it("keeps bend points and the other end's anchor", () => {
    const d = reattach(doc([{ id: "a->b", x: 0, y: 0, from: { side: "right", at: 0.4 }, via: [{ x: 200, y: 100 }] }]), "to", { x: 350, y: 250 });
    expect(entryOf(d)?.via).toEqual([{ x: 200, y: 100 }]);
    expect(entryOf(d)?.from).toEqual({ side: "right", at: 0.4 });
  });

  it("keeps the edge's ID, so style and layout lines still name it", () => {
    const d = reattach(doc(), "to", { x: 350, y: 250 });
    expect(edgeOf(d).id).toBe("a->b");
    expect(writeDiagram(d)).toContain("edge a c id=a->b");
  });

  it("is saved and read back as the same edge", () => {
    const d = reattach(reattach(doc(), "to", { x: 330, y: 205 }), "from", { x: 900, y: 900 });
    const back = readDiagram(writeDiagram(d)).document;
    expect(edgeOf(back)).toMatchObject({ id: "a->b", from: null, to: "c" });
    expect(entryOf(back)?.fromPoint).toEqual({ x: 900, y: 900 });
    expect(entryOf(back)?.to).toEqual({ side: "top", at: 0.3 });
  });

  it("is one command, so undo restores the ends and the layout together", () => {
    const d = doc();
    const command = reattachCommand(d, monoMeasurer, "a->b", "to", { x: 350, y: 250 });
    expect(command).not.toBeNull();
    if (command) expect(applyCommand(d, command).inverse.length).toBeGreaterThan(0);
  });

  it("makes nothing for a drop onto the shape at the other end, which would join a shape to itself", () => {
    expect(reattachCommand(doc(), monoMeasurer, "a->b", "to", { x: 50, y: 25 })).toBeNull();
  });

  it("makes nothing when the end lands where it already is", () => {
    const d = doc([{ id: "a->b", x: 0, y: 0, to: { side: "left", at: 0.5 } }]);
    expect(reattachCommand(d, monoMeasurer, "a->b", "to", { x: 301, y: 25 })).toBeNull();
  });

  it("makes nothing for a locked edge or an unknown edge", () => {
    expect(reattachCommand(doc([{ id: "a->b", x: 0, y: 0, locked: true }]), monoMeasurer, "a->b", "to", { x: 350, y: 250 })).toBeNull();
    expect(reattachCommand(doc(), monoMeasurer, "nope", "to", { x: 350, y: 250 })).toBeNull();
  });

  it("dropped on a corner of a pack shape's box that its outline leaves empty detaches the end", () => {
    const d = doc();
    d.elements.push({ kind: "node", id: "p", shape: "arch.database" });
    d.layout.push({ id: "p", x: 600, y: 600, w: 96, h: 112 });
    const after = reattach(d, "to", { x: 601, y: 601 });
    expect(edgeOf(after).to).toBeNull();
    expect(entryOf(after)?.toPoint).toEqual({ x: 601, y: 601 });
  });
});

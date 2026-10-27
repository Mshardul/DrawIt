import { describe, expect, it } from "vitest";
import { isValidId } from "../model/index.ts";
import type { DiagramDocument, DiagramElement } from "../model/index.ts";
import { generateDiagram } from "./generate-diagram.ts";

const countKinds = (doc: DiagramDocument): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const e of doc.elements) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  return counts;
};

describe("diagram generator", () => {
  it("makes 500 elements by default in the default mix", () => {
    const doc = generateDiagram();
    expect(doc.elements).toHaveLength(500);
    expect(countKinds(doc)).toEqual({ node: 300, edge: 175, text: 15, frame: 5, shape: 5 });
  });

  it("gives the same document for the same seed and a different one for another", () => {
    expect(generateDiagram({ seed: 7 })).toEqual(generateDiagram({ seed: 7 }));
    expect(generateDiagram({ seed: 7 })).not.toEqual(generateDiagram({ seed: 8 }));
  });

  it("honours the count and the ratios, and always hits the count exactly", () => {
    const doc = generateDiagram({ count: 1000, ratios: { node: 1, edge: 1 } });
    expect(doc.elements).toHaveLength(1000);
    expect(countKinds(doc)).toEqual({ node: 500, edge: 500 });
    const odd = generateDiagram({ count: 7, ratios: { node: 1, edge: 1, text: 1 } });
    expect(odd.elements).toHaveLength(7);
  });

  it("uses unique valid IDs, and layout matches structure one to one", () => {
    const doc = generateDiagram();
    const ids = doc.elements.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(isValidId)).toBe(true);
    expect(doc.layout.map((l) => l.id).sort()).toEqual([...ids].sort());
    for (const l of doc.layout) {
      expect(Number.isInteger(l.x) && Number.isInteger(l.y)).toBe(true);
    }
  });

  it("connects edges between distinct existing nodes", () => {
    const doc = generateDiagram();
    const nodeIds = new Set(doc.elements.filter((e) => e.kind === "node").map((e) => e.id));
    const edges = doc.elements.filter((e): e is Extract<DiagramElement, { kind: "edge" }> => e.kind === "edge");
    expect(edges.length).toBeGreaterThan(0);
    for (const e of edges) {
      expect(e.from !== null && nodeIds.has(e.from)).toBe(true);
      expect(e.to !== null && nodeIds.has(e.to)).toBe(true);
      expect(e.from).not.toBe(e.to);
    }
  });

  it("rejects ratios that cannot make a valid diagram", () => {
    expect(() => generateDiagram({ ratios: { node: -1 } })).toThrow();
    expect(() => generateDiagram({ ratios: { node: 0, edge: 0, text: 0, frame: 0, shape: 0 } })).toThrow();
    expect(() => generateDiagram({ ratios: { node: 0.1, edge: 1 }, count: 1 })).toThrow();
    expect(() => generateDiagram({ ratios: { edge: 1 } })).toThrow();
    expect(() => generateDiagram({ count: -1 })).toThrow();
  });
});

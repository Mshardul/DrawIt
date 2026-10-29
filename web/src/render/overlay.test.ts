import { describe, expect, it } from "vitest";
import type { DiagramDocument } from "../model/index.ts";
import { describeOverlay } from "./overlay.ts";
import { monoMeasurer } from "../testing/measurer.ts";

const doc: DiagramDocument = {
  version: 1,
  plugins: [],
  elements: [
    { kind: "node", id: "a", shape: "rect" },
    { kind: "node", id: "b", shape: "ellipse" },
    { kind: "frame", id: "f" },
  ],
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout: [
    { id: "a", x: 10, y: 20, w: 100, h: 50 },
    { id: "b", x: 200, y: 0 },
    { id: "f", x: 0, y: 0 },
  ],
};

describe("selection overlay", () => {
  it("outlines each selected element's box, keyed by ID", () => {
    const nodes = describeOverlay(doc, monoMeasurer, ["a", "b"], null);
    expect(nodes.map((n) => n.attrs["data-id"])).toEqual(["select-a", "select-b"]);
    expect(nodes[0]?.attrs).toMatchObject({ x: 10, y: 20, width: 100, height: 50 });
    expect(nodes[1]?.attrs).toMatchObject({ x: 200, y: 0, width: 160, height: 80 });
  });

  it("skips ids that are gone or not drawn", () => {
    expect(describeOverlay(doc, monoMeasurer, ["f", "missing"], null)).toEqual([]);
  });

  it("draws the drag-box with a positive size however it was dragged", () => {
    const [box] = describeOverlay(doc, monoMeasurer, [], { x: 50, y: 60, w: -30, h: -40 });
    expect(box?.attrs).toMatchObject({ "data-id": "marquee", x: 20, y: 20, width: 30, height: 40 });
  });

  it("a lone selected shape gets eight resize handles of constant screen size", () => {
    const nodes = describeOverlay(doc, monoMeasurer, ["a"], null, 2);
    const handles = nodes.filter((n) => n.attrs["data-handle"] !== undefined);
    expect(handles.map((n) => n.attrs["data-handle"])).toHaveLength(8);
    const se = handles.find((n) => n.attrs["data-handle"] === "se");
    // 8 screen px at scale 2 is 4 world px, centred on the corner (110, 70).
    expect(se?.attrs).toMatchObject({ x: 108, y: 68, width: 4, height: 4 });
  });

  it("several selected elements get outlines but no handles", () => {
    expect(describeOverlay(doc, monoMeasurer, ["a", "b"], null).some((n) => n.attrs["data-handle"] !== undefined)).toBe(false);
  });
});

describe("selection overlay, edges", () => {
  const withEdge: DiagramDocument = {
    ...doc,
    elements: [...doc.elements, { kind: "edge", id: "e", from: "a", to: "b" }],
  };
  const edgeOnly = (nodes: ReturnType<typeof describeOverlay>) => nodes.filter((n) => n.attrs["data-id"] === "select-e");

  it("outlines a selected edge along its path", () => {
    const [outline] = edgeOnly(describeOverlay(withEdge, monoMeasurer, ["e"], null));
    expect(outline).toMatchObject({ tag: "polyline", attrs: { class: "selection", fill: "none" } });
    const points = String(outline?.attrs["points"]).split(" ");
    expect(points.length).toBe(2);
    expect(points[0]).toMatch(/^110,/);
  });

  it("a lone selected edge gets a handle on each end, of constant screen size", () => {
    const nodes = describeOverlay(withEdge, monoMeasurer, ["e"], null, 2);
    const ends = nodes.filter((n) => n.attrs["data-end"] !== undefined);
    expect(ends.map((n) => n.attrs["data-end"])).toEqual(["from", "to"]);
    // 8 screen px at scale 2 is 4 world px, centred on the end of the path.
    expect(ends[0]?.attrs).toMatchObject({ x: 108, width: 4, height: 4 });
    expect(nodes.some((n) => n.attrs["data-handle"] !== undefined)).toBe(false);
  });

  it("an edge selected with other elements is outlined but has no end handles", () => {
    const nodes = describeOverlay(withEdge, monoMeasurer, ["a", "e"], null);
    expect(edgeOnly(nodes)).toHaveLength(1);
    expect(nodes.some((n) => n.attrs["data-end"] !== undefined)).toBe(false);
  });

  it("outlines follow z-order, with edges and shapes together", () => {
    const layout = [...doc.layout.slice(0, 1), { id: "e", x: 0, y: 0 }, ...doc.layout.slice(1)];
    const nodes = describeOverlay({ ...withEdge, layout }, monoMeasurer, ["b", "e", "a"], null);
    expect(nodes.filter((n) => String(n.attrs["data-id"]).startsWith("select-")).map((n) => n.attrs["data-id"])).toEqual(["select-a", "select-e", "select-b"]);
  });
});

describe("overlay, edge being drawn", () => {
  it("draws the line being dragged out as a polyline over everything else", () => {
    const nodes = describeOverlay(doc, monoMeasurer, ["a"], null, 1, [{ x: 110, y: 45 }, { x: 300, y: 200 }]);
    expect(nodes.at(-1)).toMatchObject({ tag: "polyline", attrs: { "data-id": "edge-draft", class: "draft", points: "110,45 300,200", fill: "none" } });
  });

  it("draws nothing for no line or an empty one", () => {
    expect(describeOverlay(doc, monoMeasurer, [], null, 1, null)).toEqual([]);
    expect(describeOverlay(doc, monoMeasurer, [], null, 1, [])).toEqual([]);
  });
});

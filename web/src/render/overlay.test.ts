import { describe, expect, it } from "vitest";
import type { DiagramDocument } from "../model/index.ts";
import { describeOverlay } from "./overlay.ts";

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
  it("[T-014] outlines each selected element's box, keyed by ID", () => {
    const nodes = describeOverlay(doc, ["a", "b"], null);
    expect(nodes.map((n) => n.attrs["data-id"])).toEqual(["select-a", "select-b"]);
    expect(nodes[0]?.attrs).toMatchObject({ x: 10, y: 20, width: 100, height: 50 });
    expect(nodes[1]?.attrs).toMatchObject({ x: 200, y: 0, width: 160, height: 80 });
  });

  it("[T-014] skips ids that are gone or not drawn", () => {
    expect(describeOverlay(doc, ["f", "missing"], null)).toEqual([]);
  });

  it("[T-014] draws the drag-box with a positive size however it was dragged", () => {
    const [box] = describeOverlay(doc, [], { x: 50, y: 60, w: -30, h: -40 });
    expect(box?.attrs).toMatchObject({ "data-id": "marquee", x: 20, y: 20, width: 30, height: 40 });
  });

  it("[T-015] a lone selected shape gets eight resize handles of constant screen size", () => {
    const nodes = describeOverlay(doc, ["a"], null, 2);
    const handles = nodes.filter((n) => n.attrs["data-handle"] !== undefined);
    expect(handles.map((n) => n.attrs["data-handle"])).toHaveLength(8);
    const se = handles.find((n) => n.attrs["data-handle"] === "se");
    // 8 screen px at scale 2 is 4 world px, centred on the corner (110, 70).
    expect(se?.attrs).toMatchObject({ x: 108, y: 68, width: 4, height: 4 });
  });

  it("[T-015] several selected elements get outlines but no handles", () => {
    expect(describeOverlay(doc, ["a", "b"], null).some((n) => n.attrs["data-handle"] !== undefined)).toBe(false);
  });
});

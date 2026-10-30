import { describe, expect, it } from "vitest";
import { applyCommand } from "../commands/command.ts";
import type { DiagramDocument, DiagramElement, LayoutEntry } from "../model/index.ts";
import { DEFAULT_LOOK } from "../style/text-look.ts";
import { monoMeasurer, sizedMeasurer } from "../testing/measurer.ts";
import { createTextCommand, editTarget, newTextId, setTextCommand } from "./target.ts";

const LINE_HEIGHT = DEFAULT_LOOK.lineHeight;

const doc = (elements: DiagramElement[], layout: LayoutEntry[]): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements,
  layout,
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
});

describe("edit target", () => {
  it("a node edits its label, wrapped in its box and centred", () => {
    const d = doc([{ kind: "node", id: "a", label: "aaaa bbbb cccc", shape: "rect" }], [{ id: "a", x: 20, y: 10, w: 100, h: 60 }]);
    expect(editTarget(d, "a", monoMeasurer)).toEqual({
      id: "a",
      field: "label",
      text: "aaaa bbbb cccc",
      lines: ["aaaa bbbb", "cccc"],
      box: { x: 20, y: 10 + 30 - LINE_HEIGHT, w: 100, h: 2 * LINE_HEIGHT },
      look: expect.objectContaining({ align: "center" }) as unknown,
    });
  });

  it("a node without a label edits its ID, which is what it shows", () => {
    const d = doc([{ kind: "node", id: "a", shape: "rect" }], [{ id: "a", x: 0, y: 0, w: 100, h: 60 }]);
    expect(editTarget(d, "a", monoMeasurer)).toMatchObject({ field: "label", text: "a" });
  });

  it("a text box with no width edits its content at its own corner, as wide as the text", () => {
    const d = doc([{ kind: "text", id: "t", content: "ab\nabcd" }], [{ id: "t", x: 5, y: 6 }]);
    expect(editTarget(d, "t", monoMeasurer)).toEqual({
      id: "t",
      field: "content",
      text: "ab\nabcd",
      lines: ["ab", "abcd"],
      box: { x: 5, y: 6, w: 40, h: 2 * LINE_HEIGHT },
      look: expect.objectContaining({ align: "left" }) as unknown,
    });
  });

  it("a text box with a width wraps there", () => {
    const d = doc([{ kind: "text", id: "t", content: "aa bb cc dd" }], [{ id: "t", x: 0, y: 0, w: 50 }]);
    expect(editTarget(d, "t", monoMeasurer)).toMatchObject({ lines: ["aa bb", "cc dd"], box: { w: 50, h: 2 * LINE_HEIGHT } });
  });

  it("uses a pack shape's label rectangle when the shape has a manifest", () => {
    const d = doc([{ kind: "node", id: "a", label: "ab", shape: "arch.database" }], [{ id: "a", x: 100, y: 200, w: 96, h: 112 }]);
    const shapes = () => ({ label: { x: 8, y: 40, w: 80, h: 56 }, size: { w: 96, h: 112 }, keepAspect: false }) as never;
    const target = editTarget(d, "a", monoMeasurer, shapes);
    expect(target?.box).toEqual({ x: 108, y: 200 + 68 - LINE_HEIGHT / 2, w: 80, h: LINE_HEIGHT });
  });

  it("has nothing to edit for elements without text, or that are not drawn", () => {
    const d = doc(
      [
        { kind: "shape", id: "s", shape: "rect" },
        { kind: "edge", id: "e", from: "a", to: "a" },
        { kind: "frame", id: "f" },
        { kind: "node", id: "unplaced", shape: "rect" },
      ],
      [
        { id: "s", x: 0, y: 0 },
        { id: "f", x: 0, y: 0 },
      ],
    );
    for (const id of ["s", "e", "f", "unplaced", "missing"]) expect(editTarget(d, id, monoMeasurer), id).toBeNull();
  });
});

describe("text commands", () => {
  it("set a node's label or a text box's content", () => {
    expect(setTextCommand("label", "a", "Hi")).toEqual({ type: "setElement", id: "a", set: { label: "Hi" } });
    expect(setTextCommand("content", "t", "Hi")).toEqual({ type: "setElement", id: "t", set: { content: "Hi" } });
  });

  it("create a text box at a point, with no text yet", () => {
    const d = doc([], []);
    const command = createTextCommand(d, { x: 30, y: 40 });
    const after = applyCommand(d, command).document;
    expect(after.elements).toEqual([{ kind: "text", id: "text", content: "" }]);
    expect(after.layout).toEqual([{ id: "text", x: 30, y: 40 }]);
  });

  it("round the point to whole pixels", () => {
    const after = applyCommand(doc([], []), createTextCommand(doc([], []), { x: 30.4, y: 40.6 })).document;
    expect(after.layout[0]).toMatchObject({ x: 30, y: 41 });
  });
});

describe("new text ID", () => {
  it("is text, then text-2, text-3 around IDs in use", () => {
    expect(newTextId(doc([], []))).toBe("text");
    expect(newTextId(doc([{ kind: "text", id: "text", content: "" }], []))).toBe("text-2");
    expect(
      newTextId(
        doc(
          [
            { kind: "text", id: "text", content: "" },
            { kind: "node", id: "text-2", shape: "rect" },
          ],
          [],
        ),
      ),
    ).toBe("text-3");
  });
});

describe("edit target of an edge label", () => {
  const nodes: LayoutEntry[] = [
    { id: "a", x: 0, y: 0, w: 100, h: 50 },
    { id: "b", x: 300, y: 0, w: 100, h: 50 },
  ];
  const edge = (label?: string): DiagramElement => ({ kind: "edge", id: "e", from: "a", to: "b", ...(label !== undefined && { label }) });
  const elements = (label?: string): DiagramElement[] => [{ kind: "node", id: "a", shape: "rect" }, { kind: "node", id: "b", shape: "rect" }, edge(label)];

  it("is the label where it is drawn on the path, centred, even when the edge has no layout entry", () => {
    expect(editTarget(doc(elements("Hi"), nodes), "e", monoMeasurer)).toEqual({
      id: "e",
      field: "edgeLabel",
      text: "Hi",
      lines: ["Hi"],
      box: { x: 190, y: 13, w: 20, h: LINE_HEIGHT },
      look: expect.objectContaining({ align: "center" }) as unknown,
    });
  });

  it("follows the label position in the layout", () => {
    const d = doc(elements("Hi"), [...nodes, { id: "e", x: 0, y: 0, labelAt: 0.25 }]);
    expect(editTarget(d, "e", monoMeasurer)?.box).toEqual({ x: 140, y: 13, w: 20, h: LINE_HEIGHT });
  });

  it("is an empty text, in a small box on the middle of the path, for an edge with no label", () => {
    expect(editTarget(doc(elements(), nodes), "e", monoMeasurer)).toMatchObject({ text: "", lines: [""], box: { x: 196, y: 13, w: 8 } });
  });

  it("is null for an edge that is not drawn", () => {
    expect(editTarget(doc(elements("Hi"), nodes.slice(0, 1)), "e", monoMeasurer)).toBeNull();
  });

  it("sets the label, and removes it when emptied so the file keeps no empty label", () => {
    expect(setTextCommand("edgeLabel", "e", "Hi")).toEqual({ type: "setElement", id: "e", set: { label: "Hi" } });
    const d = doc(elements("Hi"), nodes);
    const emptied = applyCommand(d, setTextCommand("edgeLabel", "e", "")).document;
    expect(emptied.elements.find((e) => e.id === "e")).not.toHaveProperty("label");
  });
});

describe("edit target of styled text", () => {
  const styled = (props: object): DiagramDocument => {
    const d = doc(
      [{ kind: "node", id: "a", label: "aaaa", shape: "rect" }, { kind: "text", id: "t", content: "aa bb cc" }],
      [{ id: "a", x: 0, y: 0, w: 100, h: 60 }, { id: "t", x: 0, y: 100, w: 30 }],
    );
    return { ...d, style: { ...d.style, overrides: [{ id: "a", props }, { id: "t", props }] } };
  };

  it("carries the look it measured with, so the editor can match the display", () => {
    const target = editTarget(styled({ size: 20, weight: 700, color: "#ff0000", align: "right" }), "a", sizedMeasurer);
    expect(target?.look).toMatchObject({ style: { size: 20, weight: 700 }, color: "#ff0000", align: "right" });
  });

  it("lays a label out with its font size and line height", () => {
    const target = editTarget(styled({ size: 20, lineHeight: 30 }), "t", sizedMeasurer);
    expect(target?.lines).toEqual(["aa", "bb", "cc"]);
    expect(target?.box).toEqual({ x: 0, y: 100, w: 30, h: 90 });
  });
});

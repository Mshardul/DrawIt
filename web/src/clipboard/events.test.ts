import { describe, expect, it } from "vitest";
import { OpenFile } from "../app/workspace.ts";
import { writeDiagram } from "../kdl/write.ts";
import type { DiagramDocument } from "../model/index.ts";
import { MemoryStorage } from "../storage/memory.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { ClipboardImages } from "./images.ts";
import { clipboardText, cutSelection, pasteDocument } from "./events.ts";

const doc = (): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements: [
    { kind: "node", id: "a", label: "A", shape: "rect" },
    { kind: "node", id: "b", label: "B", shape: "rect" },
  ],
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout: [
    { id: "a", x: 10, y: 20, w: 100, h: 40 },
    { id: "b", x: 200, y: 20, w: 80, h: 40, locked: true },
  ],
});

function open(document = doc()): OpenFile {
  return new OpenFile("page.drawit.kdl", document, writeDiagram(document));
}

describe("clipboard events", () => {
  it("copies the selection as a document, including a locked element", () => {
    const file = open();
    file.history.selection = ["a", "b"];
    const text = clipboardText(file, monoMeasurer);
    expect(text?.startsWith("diagram version=1")).toBe(true);
    expect(text).toContain("node a");
    expect(text).toContain("node b");
  });

  it("cuts with one undo step and leaves a locked element in place", () => {
    const file = open();
    file.history.selection = ["a", "b"];
    const text = cutSelection(file, monoMeasurer);
    expect(text).toContain("node a");
    expect(file.document.elements.map((element) => element.id)).toEqual(["b"]);
    expect(file.history.selection).toEqual(["b"]);
    expect(file.history.undo()).toBe(true);
    expect(file.document.elements.map((element) => element.id)).toEqual(["a", "b"]);
    expect(file.history.canUndo).toBe(false);
  });

  it("pastes at the given point and ignores text that is not a document", async () => {
    const file = open();
    file.history.selection = ["a"];
    const text = clipboardText(file, monoMeasurer);
    if (!text) throw new Error("no text");
    const target = open();
    const images = new ClipboardImages();
    expect(await pasteDocument(target, new MemoryStorage(), images, monoMeasurer, "hello", { x: 0, y: 0 })).toBe(false);
    expect(target.document.elements.map((element) => element.id)).toEqual(["a", "b"]);
    expect(await pasteDocument(target, new MemoryStorage(), images, monoMeasurer, text, { x: 5, y: 6 })).toBe(true);
    expect(target.document.elements.map((element) => element.id)).toEqual(["a", "b", "rect"]);
    expect(target.document.layout.find((entry) => entry.id === "rect")).toMatchObject({ x: 5, y: 6 });
    expect(target.history.undo()).toBe(true);
    expect(target.document.elements).toHaveLength(2);
  });
});

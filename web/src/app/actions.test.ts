import { describe, expect, it } from "vitest";
import { dispatchKey, editorActions, type ActionHost, type KeyPress } from "./actions.ts";

function host(over: Partial<ActionHost> = {}): ActionHost & { ran: string[] } {
  const ran: string[] = [];
  const call = (name: string) => () => { ran.push(name); };
  return {
    ran,
    save: call("save"),
    undo: call("undo"),
    redo: call("redo"),
    toggleGrid: call("grid"),
    toggleSnap: call("snap"),
    zoomIn: call("zoom-in"),
    zoomOut: call("zoom-out"),
    resetZoom: call("zoom-reset"),
    zoomToFit: call("zoom-fit"),
    setTool: (tool: string) => { ran.push(tool); },
    canEdit: () => true,
    ...over,
  };
}

describe("editor actions", () => {
  it("names save, undo, redo, grid, snap and zoom", () => {
    expect(editorActions(host()).map((action) => action.id)).toEqual([
      "save", "undo", "redo", "grid", "snap", "zoom-in", "zoom-out", "zoom-reset", "zoom-fit",
      "tool-select", "tool-hand", "tool-line", "tool-arrow", "tool-frame", "tool-rect", "tool-ellipse", "tool-text", "tool-image",
    ]);
    expect(editorActions(host()).map((action) => action.title)).toEqual([
      "Save", "Undo", "Redo", "Grid", "Snap", "Zoom in", "Zoom out", "Reset zoom", "Zoom to fit",
      "Select", "Hand", "Line", "Arrow", "Frame", "Rectangle", "Ellipse", "Text", "Image",
    ]);
  });

  it("runs the action whose key matches", () => {
    const target = host();
    const actions = editorActions(target);
    const run = (event: KeyPress) => {
      target.ran.length = 0;
      dispatchKey(actions, event);
      return target.ran;
    };
    expect(run({ key: "s", metaKey: true })).toEqual(["save"]);
    expect(run({ key: "z", ctrlKey: true })).toEqual(["undo"]);
    expect(run({ key: "z", metaKey: true, shiftKey: true })).toEqual(["redo"]);
    expect(run({ key: "g" })).toEqual(["grid"]);
    expect(run({ key: "G", shiftKey: true })).toEqual(["snap"]);
    expect(run({ key: "=", metaKey: true })).toEqual(["zoom-in"]);
    expect(run({ key: "+", ctrlKey: true, shiftKey: true })).toEqual(["zoom-in"]);
    expect(run({ key: "-", metaKey: true })).toEqual(["zoom-out"]);
    expect(run({ key: "0", ctrlKey: true })).toEqual(["zoom-reset"]);
    expect(run({ key: "!", code: "Digit1", shiftKey: true })).toEqual(["zoom-fit"]);
    expect(run({ key: "v" })).toEqual(["select"]);
    expect(run({ key: "h" })).toEqual(["hand"]);
    expect(run({ key: "l" })).toEqual(["line"]);
    expect(run({ key: "a" })).toEqual(["arrow"]);
    expect(run({ key: "f" })).toEqual(["frame"]);
    expect(run({ key: "r" })).toEqual(["rect"]);
    expect(run({ key: "o" })).toEqual(["ellipse"]);
    expect(run({ key: "t" })).toEqual(["text"]);
    expect(run({ key: "i" })).toEqual(["image"]);
    expect(run({ key: "v", metaKey: true })).toEqual([]);
  });

  it("does not run undo or redo when there is nothing to edit, and still saves from a field", () => {
    const target = host({ canEdit: () => false });
    const actions = editorActions(target);
    let prevented = false;
    const event = { key: "z", metaKey: true, preventDefault: () => { prevented = true; } };
    expect(dispatchKey(actions, event)).toBe(false);
    expect(prevented).toBe(false);
    expect(target.ran).toEqual([]);
    dispatchKey(actions, { key: "s", ctrlKey: true }, true);
    expect(target.ran).toEqual(["save"]);
    target.ran.length = 0;
    dispatchKey(actions, { key: "g" }, true);
    expect(target.ran).toEqual([]);
  });
});

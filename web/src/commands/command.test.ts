import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DiagramDocument } from "../model/index.ts";
import { generateDiagram } from "../testing/generate-diagram.ts";
import { CommandError, applyCommand, applyPatches } from "./command.ts";
import type { Command } from "./command.ts";

function sample(): DiagramDocument {
  return {
    version: 1,
    plugins: [{ id: "core", version: 1 }],
    elements: [
      { kind: "node", id: "a", label: "A", shape: "rect" },
      { kind: "node", id: "b", label: "B", shape: "rect" },
      { kind: "edge", id: "a->b", from: "a", to: "b" },
      { kind: "text", id: "t", content: "hello" },
    ],
    style: {
      theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} },
      classes: [{ name: "c", props: { fill: "red", weight: 700 } }],
      overrides: [{ id: "a", props: { dash: "dashed" } }],
    },
    layout: [
      { id: "a", x: 0, y: 0, w: 100, h: 50 },
      { id: "b", x: 200, y: 0, w: 100, h: 50 },
      { id: "a->b", x: 0, y: 0, from: "auto", to: "auto" },
      { id: "t", x: 10, y: 90 },
    ],
  };
}

const ids = (d: DiagramDocument): string[] => d.elements.map((e) => e.id);
const order = (d: DiagramDocument): string[] => d.layout.map((e) => e.id);

// One command of every kind.
const commands: Record<string, Command> = {
  add: { type: "add", items: [{ element: { kind: "frame", id: "f" }, layout: { id: "f", x: 5, y: 6, w: 7, h: 8 } }] },
  delete: { type: "delete", ids: ["a"] },
  setElement: { type: "setElement", id: "a", set: { label: "Alpha", class: "c" }, unset: [] },
  setLayout: { type: "setLayout", changes: [{ id: "a", set: { x: 40, y: 50 } }, { id: "b", set: { locked: true }, unset: ["w"] }] },
  setStyle: { type: "setStyle", target: { kind: "class", name: "c" }, set: { fill: "blue" }, unset: ["weight"] },
  reorder: { type: "reorder", ids: ["a"], to: "front" },
  rename: { type: "rename", id: "a", newId: "alpha" },
  batch: { type: "batch", commands: [{ type: "setLayout", changes: [{ id: "a", set: { x: 1 } }] }, { type: "delete", ids: ["t"] }] },
};

describe("command layer", () => {
  describe.each(Object.entries(commands))("%s", (name, command) => {
    it(`${name}: forward patches rebuild the result and inverse patches restore the original`, () => {
      const before = sample();
      const { document, patches, inverse } = applyCommand(before, command);
      expect(document).not.toEqual(before);
      expect(applyPatches(before, patches)).toEqual(document);
      expect(applyPatches(document, inverse)).toEqual(sample());
    });

    it(`${name}: is plain data, so a JSON copy gives the same result and patches`, () => {
      const copy = JSON.parse(JSON.stringify(command)) as Command;
      const first = applyCommand(sample(), command);
      const second = applyCommand(sample(), copy);
      expect(second.document).toEqual(first.document);
      expect(JSON.parse(JSON.stringify(first.patches))).toEqual(first.patches);
      expect(JSON.parse(JSON.stringify(first.inverse))).toEqual(first.inverse);
    });

    it(`${name}: leaves the input document unchanged`, () => {
      const before = sample();
      applyCommand(before, command);
      expect(before).toEqual(sample());
    });
  });

  it("add appends the element and its layout entry on top", () => {
    const { document } = applyCommand(sample(), commands["add"] as Command);
    expect(ids(document).at(-1)).toBe("f");
    expect(document.layout.at(-1)).toEqual({ id: "f", x: 5, y: 6, w: 7, h: 8 });
  });

  it("add refuses an ID already in the file", () => {
    const command: Command = { type: "add", items: [{ element: { kind: "frame", id: "a" } }] };
    expect(() => applyCommand(sample(), command)).toThrow(CommandError);
  });

  it("add refuses an ID that does not match the ID pattern", () => {
    const command: Command = { type: "add", items: [{ element: { kind: "frame", id: "Bad Id" } }] };
    expect(() => applyCommand(sample(), command)).toThrow(CommandError);
  });

  it("delete removes the element, its layout entry and its style override", () => {
    const { document } = applyCommand(sample(), { type: "delete", ids: ["a"] });
    expect(ids(document)).not.toContain("a");
    expect(order(document)).not.toContain("a");
    expect(document.style.overrides).toEqual([]);
  });

  it("delete frees the attached end of an edge where the element was", () => {
    const { document } = applyCommand(sample(), { type: "delete", ids: ["a"] });
    expect(document.elements.find((e) => e.id === "a->b")).toMatchObject({ kind: "edge", from: null, to: "b" });
    expect(document.layout.find((e) => e.id === "a->b")).toMatchObject({ fromPoint: { x: 50, y: 25 } });
  });

  it("delete of both ends of an edge frees both", () => {
    const { document } = applyCommand(sample(), { type: "delete", ids: ["a", "b"] });
    const edge = document.layout.find((e) => e.id === "a->b");
    expect(edge).toMatchObject({ fromPoint: { x: 50, y: 25 }, toPoint: { x: 250, y: 25 } });
  });

  it("delete of an unknown ID fails", () => {
    expect(() => applyCommand(sample(), { type: "delete", ids: ["nope"] })).toThrow(CommandError);
  });

  it("setLayout moves several elements as one command", () => {
    const { document, patches } = applyCommand(sample(), commands["setLayout"] as Command);
    expect(document.layout.find((e) => e.id === "a")).toMatchObject({ x: 40, y: 50 });
    expect(document.layout.find((e) => e.id === "b")).toEqual({ id: "b", x: 200, y: 0, h: 50, locked: true });
    expect(patches.length).toBeGreaterThan(0);
  });

  it("setLayout creates the entry of an element that has none", () => {
    const before = sample();
    before.layout = [];
    const { document } = applyCommand(before, { type: "setLayout", changes: [{ id: "a", set: { x: 3, y: 4 } }] });
    expect(document.layout).toEqual([{ id: "a", x: 3, y: 4 }]);
  });

  it("setLayout reads each ID a bounded number of times however many elements it moves", () => {
    const big = generateDiagram({ count: 500 });
    let reads = 0;
    const counted = <T extends { id: string }>(item: T): T => {
      const { id, ...rest } = item;
      return Object.defineProperty({ ...rest }, "id", {
        enumerable: true,
        get: () => {
          reads += 1;
          return id;
        },
      }) as T;
    };
    const doc: DiagramDocument = { ...big, elements: big.elements.map(counted), layout: big.layout.map(counted) };
    const moved = doc.layout.filter((_, i) => i % 5 === 0).map((e) => ({ id: e.id, set: { x: 1, y: 2 } }));
    reads = 0;
    const { document } = applyCommand(doc, { type: "setLayout", changes: moved });
    expect(document.layout.filter((e) => e.x === 1 && e.y === 2)).toHaveLength(100);
    // Scanning both arrays once per change would read about 100 * 500 IDs.
    expect(reads).toBeLessThan(4 * (doc.elements.length + doc.layout.length));
  });

  it("setLayout of an unknown element fails", () => {
    expect(() => applyCommand(sample(), { type: "setLayout", changes: [{ id: "zz", set: { x: 1 } }] })).toThrow(CommandError);
  });

  it("setElement changes a label and removes a field with unset", () => {
    const set = applyCommand(sample(), { type: "setElement", id: "a", set: { label: "Alpha" } }).document;
    expect(set.elements[0]).toMatchObject({ label: "Alpha" });
    const unset = applyCommand(set, { type: "setElement", id: "a", unset: ["label"] }).document;
    expect(unset.elements[0]).not.toHaveProperty("label");
  });

  it("setStyle creates a missing class and a missing per-element override", () => {
    const cls = applyCommand(sample(), { type: "setStyle", target: { kind: "class", name: "new" }, set: { fill: "red" } }).document;
    expect(cls.style.classes.at(-1)).toEqual({ name: "new", props: { fill: "red" } });
    const el = applyCommand(sample(), { type: "setStyle", target: { kind: "el", id: "b" }, set: { size: 20 } }).document;
    expect(el.style.overrides.at(-1)).toEqual({ id: "b", props: { size: 20 } });
  });

  it("reorder moves entries to the front or back of the z-order, keeping their relative order", () => {
    const front = applyCommand(sample(), { type: "reorder", ids: ["a", "b"], to: "back" }).document;
    expect(order(front)).toEqual(["a", "b", "a->b", "t"]);
    const back = applyCommand(sample(), { type: "reorder", ids: ["b", "a"], to: "front" }).document;
    expect(order(back)).toEqual(["a->b", "t", "a", "b"]);
  });

  it("rename updates structure, style, layout and edge ends, including a derived edge ID", () => {
    const { document } = applyCommand(sample(), commands["rename"] as Command);
    expect(ids(document)).toEqual(["alpha", "b", "alpha->b", "t"]);
    expect(document.elements[2]).toMatchObject({ from: "alpha", to: "b" });
    expect(document.style.overrides[0]?.id).toBe("alpha");
    expect(order(document)).toEqual(["alpha", "b", "alpha->b", "t"]);
  });

  it("rename refuses an invalid or taken ID", () => {
    expect(() => applyCommand(sample(), { type: "rename", id: "a", newId: "Bad Id" })).toThrow(CommandError);
    expect(() => applyCommand(sample(), { type: "rename", id: "a", newId: "b" })).toThrow(CommandError);
  });

  it("batch applies all its commands or none", () => {
    const bad: Command = { type: "batch", commands: [{ type: "delete", ids: ["a"] }, { type: "delete", ids: ["nope"] }] };
    expect(() => applyCommand(sample(), bad)).toThrow(CommandError);
  });

  it("an unknown command type fails", () => {
    expect(() => applyCommand(sample(), { type: "explode" } as unknown as Command)).toThrow(CommandError);
  });

  it("the model and the command layer import nothing from the UI", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    for (const dir of ["model", "commands"]) {
      for (const file of readdirSync(join(root, dir)).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
        const imports = [...readFileSync(join(root, dir, file), "utf8").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1] ?? "");
        for (const source of imports) {
          expect(source.startsWith(".") || source === "immer", `${dir}/${file} imports ${source}`).toBe(true);
          expect(source).not.toMatch(/renderer|ui|main/);
        }
      }
    }
  });
});

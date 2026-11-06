import { describe, expect, it } from "vitest";
import { writeDiagram } from "../kdl/write.ts";
import type { DiagramDocument } from "../model/index.ts";
import { clipboardDocument, recogniseClipboard } from "./copy.ts";

const source: DiagramDocument = {
  version: 1,
  title: "Network",
  plugins: [{ id: "arch", version: 1 }],
  comments: ["header"],
  elements: [
    { kind: "node", id: "a", label: "A", shape: "rect", class: "note", comments: ["// keep"] },
    { kind: "node", id: "b", label: "B", shape: "rect", class: "other" },
    { kind: "node", id: "c", label: "C", shape: "rect", class: "note" },
  ],
  style: {
    theme: {
      name: "default",
      colors: { brand: "#112233", ink: "#000000", glow: "#abcdef" },
      fonts: {},
      sizes: { room: 20 },
      spaces: { gap: 12 },
    },
    classes: [
      { name: "note", props: { fill: "$brand", stroke: "$ink", size: "$room" } },
      { name: "other", props: { fill: "$glow", strokeWidth: "$gap" } },
    ],
    overrides: [
      { id: "a", props: { shadow: "1 2 3 $glow" } },
      { id: "b", props: { fill: "$brand" } },
    ],
  },
  layout: [
    { id: "c", x: 0, y: 0, w: 10, h: 10 },
    { id: "a", x: 1, y: 2, w: 3, h: 4 },
    { id: "b", x: 5, y: 6, w: 7, h: 8 },
  ],
};

describe("clipboard document", () => {
  const copied = clipboardDocument(source, ["a", "c"]);

  it("keeps the selected elements and their layout order", () => {
    expect(copied.elements.map((element) => element.id)).toEqual(["a", "c"]);
    expect(copied.layout.map((entry) => entry.id)).toEqual(["c", "a"]);
    expect(copied.elements[0]?.kind === "node" && copied.elements[0].comments).toEqual(["// keep"]);
    expect(copied.title).toBeUndefined();
    expect(copied.plugins).toEqual([{ id: "arch", version: 1 }]);
  });

  it("keeps the classes the selection uses and the tokens those need, apart from built-in ones", () => {
    expect(copied.style.classes.map((styleClass) => styleClass.name)).toEqual(["note"]);
    expect(copied.style.overrides.map((override) => override.id)).toEqual(["a"]);
    expect(copied.style.theme.colors).toEqual({ brand: "#112233", glow: "#abcdef" });
    expect(copied.style.theme.sizes).toEqual({ room: 20 });
    expect(copied.style.theme.spaces).toEqual({});
    expect(copied.style.theme.colors["ink"]).toBeUndefined();
  });

  it("writes a complete diagram the recogniser accepts", () => {
    const text = writeDiagram(copied);
    expect(text.startsWith("diagram version=1")).toBe(true);
    const recognised = recogniseClipboard(text);
    expect(recognised?.elements.map((element) => element.id)).toEqual(["a", "c"]);
    expect(recognised?.style.theme.colors).toEqual({ brand: "#112233", glow: "#abcdef" });
    expect(recognised?.elements[0]?.kind === "node" && recognised.elements[0].comments).toEqual(["// keep"]);
  });
});

describe("clipboard recogniser", () => {
  it("accepts KDL with a diagram version and nothing else", () => {
    expect(recogniseClipboard("diagram version=1\n")?.version).toBe(1);
    expect(recogniseClipboard("diagram version=2 title=\"Later\"\n")?.version).toBe(2);
    expect(recogniseClipboard("hello")).toBeNull();
    expect(recogniseClipboard("diagram title=\"No version\"\n")).toBeNull();
    expect(recogniseClipboard("node a\n")).toBeNull();
    expect(recogniseClipboard("diagram version=1 {")).toBeNull();
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PackManifest, ShapeManifest } from "../shapes/types.ts";
import { DEFAULT_LOOK, textLookOf } from "../style/text-look.ts";
import { monoMeasurer, sizedMeasurer } from "../testing/measurer.ts";
import { alignedX, labelArea, labelLayout, layoutTextBox, MIN_TEXT_W } from "./text-layout.ts";

function shape(pack: string, id: string): ShapeManifest {
  const manifest = JSON.parse(readFileSync(new URL(`../../../packs/${pack}/pack.json`, import.meta.url), "utf8")) as PackManifest;
  const found = manifest.shapes.find((s) => s.id === id);
  if (!found) throw new Error(`no shape ${id}`);
  return found;
}

const LINE_HEIGHT = DEFAULT_LOOK.lineHeight;
const CENTRED = textLookOf({ align: "center" });

describe("text box layout", () => {
  it("a text box with no width fits its content on one line", () => {
    expect(layoutTextBox("ab cd ef", undefined, monoMeasurer, DEFAULT_LOOK)).toEqual({ w: 80, h: LINE_HEIGHT, lines: ["ab cd ef"] });
  });

  it("with no width, explicit line breaks make lines and the widest sets the width", () => {
    expect(layoutTextBox("abc\nabcde", undefined, monoMeasurer, DEFAULT_LOOK)).toEqual({ w: 50, h: 2 * LINE_HEIGHT, lines: ["abc", "abcde"] });
  });

  it("with a width it wraps there and the height follows the wrapped lines", () => {
    expect(layoutTextBox("aa bb cc dd", 50, monoMeasurer, DEFAULT_LOOK)).toEqual({ w: 50, h: 2 * LINE_HEIGHT, lines: ["aa bb", "cc dd"] });
  });

  it("with a width, the box keeps that width when the text is shorter", () => {
    expect(layoutTextBox("ab", 200, monoMeasurer, DEFAULT_LOOK)).toEqual({ w: 200, h: LINE_HEIGHT, lines: ["ab"] });
  });

  it("empty text still has a box to select", () => {
    expect(layoutTextBox("", undefined, monoMeasurer, DEFAULT_LOOK)).toEqual({ w: MIN_TEXT_W, h: LINE_HEIGHT, lines: [""] });
  });

  it("rounds a fitted width up to a whole pixel", () => {
    const fractional = { ...monoMeasurer, width: () => 40.2 };
    expect(layoutTextBox("abcd", undefined, fractional, DEFAULT_LOOK).w).toBe(41);
  });
});

describe("label area", () => {
  it("is the element box for a shape without a manifest", () => {
    expect(labelArea({ w: 160, h: 80 })).toEqual({ x: 0, y: 0, w: 160, h: 80 });
  });

  it("is the manifest label rectangle at the default size", () => {
    expect(labelArea({ w: 160, h: 80 }, shape("core", "rounded-rect"))).toEqual({ x: 8, y: 8, w: 144, h: 64 });
  });

  it("follows the stretch zones when the shape is wider", () => {
    // Cut lines at 8 and 152 scale the middle 144px to 224px; the 8px edges keep their size.
    expect(labelArea({ w: 240, h: 80 }, shape("core", "rounded-rect"))).toEqual({ x: 8, y: 8, w: 224, h: 64 });
  });

  it("follows the stretch zones when the shape is taller", () => {
    // The database keeps its 32px top cap and 16px bottom cap; the 64px between them grows to 152px.
    expect(labelArea({ w: 96, h: 200 }, shape("arch", "database"))).toEqual({ x: 8, y: 51, w: 80, h: 133 });
  });

  it("sits in the middle of a shape that keeps its aspect ratio", () => {
    const icon: ShapeManifest = {
      ...shape("core", "rounded-rect"),
      size: { w: 80, h: 80 },
      label: { x: 10, y: 10, w: 60, h: 60 },
      stretch: undefined,
      keepAspect: true,
    };
    expect(labelArea({ w: 160, h: 80 }, icon)).toEqual({ x: 50, y: 10, w: 60, h: 60 });
  });
});

describe("label layout", () => {
  it("wraps at the label area and centres the block in it", () => {
    expect(labelLayout("aaaa bbbb cccc", { w: 100, h: 60 }, monoMeasurer, CENTRED)).toEqual({
      lines: ["aaaa bbbb", "cccc"],
      x: 50,
      top: 30 - LINE_HEIGHT,
      area: { x: 0, y: 0, w: 100, h: 60 },
    });
  });

  it("centres on the manifest label rectangle, not the box", () => {
    const layout = labelLayout("ab", { w: 96, h: 112 }, monoMeasurer, CENTRED, shape("arch", "database"));
    expect(layout.x).toBe(48);
    expect(layout.top).toBe(68 - LINE_HEIGHT / 2);
  });

  it("lets a block taller than the area stick out evenly above and below", () => {
    const layout = labelLayout("a\nb\nc", { w: 100, h: 24 }, monoMeasurer, DEFAULT_LOOK);
    expect(layout.top).toBe(24 / 2 - (3 * LINE_HEIGHT) / 2);
  });
});

describe("text look in layout", () => {
  const big = textLookOf({ size: 20, lineHeight: 30 });

  it("measures a text box in the look's font and takes its line height", () => {
    expect(layoutTextBox("abcd", undefined, sizedMeasurer, big)).toEqual({ w: 40, h: 30, lines: ["abcd"] });
    expect(layoutTextBox("aa bb cc", 30, sizedMeasurer, big)).toEqual({ w: 30, h: 90, lines: ["aa", "bb", "cc"] });
  });

  it("wraps and centres a label with the look's font and line height", () => {
    const layout = labelLayout("aa bb", { w: 25, h: 100 }, sizedMeasurer, big);
    expect(layout.lines).toEqual(["aa", "bb"]);
    expect(layout.top).toBe(50 - 30);
  });

  it("puts label lines at the left, centre or right of the area", () => {
    const at = (align: "left" | "center" | "right") => labelLayout("a", { w: 100, h: 50 }, monoMeasurer, textLookOf({ align })).x;
    expect([at("left"), at("center"), at("right")]).toEqual([0, 50, 100]);
  });
});

describe("aligned lines", () => {
  it("gives the x and text anchor of lines in a span", () => {
    expect(alignedX("left", 10, 100)).toEqual({ x: 10, anchor: "start" });
    expect(alignedX("center", 10, 100)).toEqual({ x: 60, anchor: "middle" });
    expect(alignedX("right", 10, 100)).toEqual({ x: 110, anchor: "end" });
  });
});

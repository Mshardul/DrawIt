import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK, textLookOf } from "./text-look.ts";

describe("text look", () => {
  it("is Inter 14 regular on a 24 line in the ink colour when nothing is set", () => {
    expect(textLookOf({})).toEqual({
      style: { family: "Inter", size: 14, weight: 400, italic: false },
      color: "#1a1a1a",
      underline: false,
      align: "left",
      lineHeight: 24,
    });
    expect(DEFAULT_LOOK).toEqual(textLookOf({}));
  });

  it("takes each text property from the resolved style", () => {
    const look = textLookOf({
      font: "JetBrains Mono",
      size: 20,
      weight: 700,
      italic: true,
      underline: true,
      color: "#ff0000",
      align: "right",
      lineHeight: 30,
    });
    expect(look).toEqual({
      style: { family: "JetBrains Mono", size: 20, weight: 700, italic: true },
      color: "#ff0000",
      underline: true,
      align: "right",
      lineHeight: 30,
    });
  });

  it("falls back to Inter for a font that is not bundled", () => {
    expect(textLookOf({ font: "Comic Sans" }).style.family).toBe("Inter");
  });

  it("draws a weight with the nearest bundled weight", () => {
    expect(textLookOf({ weight: 500 }).style.weight).toBe(400);
    expect(textLookOf({ weight: 600 }).style.weight).toBe(700);
  });

  it("ignores values that cannot be drawn", () => {
    const look = textLookOf({ size: 0, lineHeight: -1, color: "$nothing", align: "justify" as "left" });
    expect(look).toEqual(DEFAULT_LOOK);
  });
});

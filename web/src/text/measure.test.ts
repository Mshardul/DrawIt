import { describe, expect, it } from "vitest";
import { createTextMeasurer, fontShorthand, TEXT_RENDERING, type TextStyle } from "./measure.ts";

const regular: TextStyle = { family: "Inter", size: 14, weight: 400, italic: false };

// A canvas stand-in: every character is as wide as the font size, and every call is counted.
function fakeContext() {
  const calls: { font: string; text: string }[] = [];
  const ctx = {
    font: "",
    textRendering: "auto" as CanvasTextRendering,
    measureText(text: string) {
      calls.push({ font: this.font, text });
      return { width: Array.from(text).length * Number.parseFloat(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? "0") };
    },
  };
  return { ctx, calls };
}

describe("fontShorthand", () => {
  it("writes italic, weight, size and quoted family in canvas order", () => {
    expect(fontShorthand({ family: "Source Serif 4", size: 16, weight: 700, italic: true })).toBe('italic 700 16px "Source Serif 4"');
    expect(fontShorthand(regular)).toBe('400 14px "Inter"');
  });
});

describe("text measurer", () => {
  it("wraps text to the width with the style's font", () => {
    const { ctx } = fakeContext();
    const measurer = createTextMeasurer(ctx);
    // 14px per character, 70px holds five characters.
    expect(measurer.wrap("aa bb cc dd", 70, regular)).toEqual(["aa bb", "cc dd"]);
  });

  it("measures with the same text rendering the SVG text uses", () => {
    const { ctx } = fakeContext();
    createTextMeasurer(ctx).wrap("a", 100, regular);
    expect(ctx.textRendering).toBe(TEXT_RENDERING);
    expect(TEXT_RENDERING).toBe("geometricPrecision");
  });

  it("does not measure text it has measured before", () => {
    const { ctx, calls } = fakeContext();
    const measurer = createTextMeasurer(ctx);
    measurer.wrap("aa bb cc dd", 70, regular);
    const first = calls.length;
    expect(first).toBeGreaterThan(0);
    measurer.wrap("aa bb cc dd", 70, regular);
    expect(calls).toHaveLength(first);
  });

  it("rewraps at a new width reusing the widths it has", () => {
    const { ctx, calls } = fakeContext();
    const measurer = createTextMeasurer(ctx);
    measurer.wrap("aa bb cc dd", 70, regular);
    const seen = new Set(calls.map((c) => c.text));
    const before = calls.length;
    expect(measurer.wrap("aa bb cc dd", 1000, regular)).toEqual(["aa bb cc dd"]);
    for (const call of calls.slice(before)) expect(seen.has(call.text)).toBe(false);
  });

  it("measures again when the style changes", () => {
    const { ctx, calls } = fakeContext();
    const measurer = createTextMeasurer(ctx);
    measurer.wrap("aa bb", 1000, regular);
    const before = calls.length;
    measurer.wrap("aa bb", 1000, { ...regular, weight: 700 });
    expect(calls.length).toBeGreaterThan(before);
    expect(calls.at(-1)?.font).toBe('700 14px "Inter"');
  });

  it("gives the same lines for a style written two ways", () => {
    const { ctx } = fakeContext();
    const measurer = createTextMeasurer(ctx);
    expect(measurer.wrap("aa bb cc", 50, { ...regular })).toEqual(measurer.wrap("aa bb cc", 50, regular));
  });

  it("reports the width of a line and reads it from the cache the second time", () => {
    const { ctx, calls } = fakeContext();
    const measurer = createTextMeasurer(ctx);
    expect(measurer.width("abc", regular)).toBe(42);
    const first = calls.length;
    expect(measurer.width("abc", regular)).toBe(42);
    expect(calls).toHaveLength(first);
  });

  it("shares widths between width and wrap", () => {
    const { ctx, calls } = fakeContext();
    const measurer = createTextMeasurer(ctx);
    measurer.width("aa", regular);
    const before = calls.length;
    measurer.wrap("aa", 1000, regular);
    expect(calls).toHaveLength(before);
  });

  it("measures a changed text", () => {
    const { ctx, calls } = fakeContext();
    const measurer = createTextMeasurer(ctx);
    measurer.wrap("aa bb", 1000, regular);
    const before = calls.length;
    measurer.wrap("aa bbb", 1000, regular);
    expect(calls.length).toBeGreaterThan(before);
  });
});

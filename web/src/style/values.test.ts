import { describe, expect, it } from "vitest";
import { parseDash, parseGradient, parseShadow, printGradient, printShadow } from "./values.ts";

describe("dash", () => {
  it("accepts solid, dashed and dotted", () => {
    expect(parseDash("dashed")).toBe("dashed");
    expect(parseDash("dotted")).toBe("dotted");
    expect(parseDash("solid")).toBe("solid");
  });

  it("rejects anything else", () => {
    expect(parseDash("dash")).toBeUndefined();
    expect(parseDash("")).toBeUndefined();
  });
});

describe("gradient", () => {
  it("parses an angle and stops with and without positions", () => {
    expect(parseGradient("linear(90, $primary, $accent 0.7)")).toEqual({
      angle: 90,
      stops: [{ color: "$primary" }, { color: "$accent", at: 0.7 }],
    });
  });

  it("parses raw colours and uneven spacing", () => {
    expect(parseGradient("linear(0,#fff 0.25,#000)")).toEqual({
      angle: 0,
      stops: [{ color: "#fff", at: 0.25 }, { color: "#000" }],
    });
  });

  it("prints the canonical form", () => {
    expect(printGradient({ angle: 90, stops: [{ color: "$primary" }, { color: "$accent", at: 0.7 }] })).toBe(
      "linear(90, $primary, $accent 0.7)",
    );
  });

  it("normalises spacing, an integer-valued angle and trailing zeros", () => {
    const parsed = parseGradient("linear(90.0 ,  $a   0.50 ,$b)");
    expect(parsed && printGradient(parsed)).toBe("linear(90, $a 0.5, $b)");
  });

  it("accepts a negative angle", () => {
    expect(parseGradient("linear(-45, #fff, #000)")?.angle).toBe(-45);
  });

  it.each([
    "linear(90, $a)",
    "linear(90)",
    "linear($a, $b)",
    "radial(90, $a, $b)",
    "linear(90, $a, $b",
    "linear(90, $a 1.5, $b)",
    "linear(90, $a -0.1, $b)",
    "linear(90, $a 0.1 0.2, $b)",
    "linear(90, , $b)",
    "linear(90, $a, $b) extra",
    "red",
  ])("rejects %s", (value) => {
    expect(parseGradient(value)).toBeUndefined();
  });
});

describe("shadow", () => {
  it("parses offsets, blur and a colour token", () => {
    expect(parseShadow("2 2 4 $ink")).toEqual({ dx: 2, dy: 2, blur: 4, color: "$ink" });
  });

  it("prints the canonical form", () => {
    expect(printShadow({ dx: 2, dy: -1.5, blur: 4, color: "#000" })).toBe("2 -1.5 4 #000");
  });

  it("normalises spacing and trailing zeros", () => {
    const parsed = parseShadow("  2.0   2.50 4   $ink ");
    expect(parsed && printShadow(parsed)).toBe("2 2.5 4 $ink");
  });

  it.each(["2 2 4", "2 2 $ink", "a 2 4 $ink", "2 2 -4 $ink", "2 2 4 $ink extra", "", "none"])(
    "rejects %s",
    (value) => {
      expect(parseShadow(value)).toBeUndefined();
    },
  );
});

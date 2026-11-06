import { describe, expect, it } from "vitest";
import { rasterSize } from "./png.ts";

describe("png size", () => {
  it("multiplies the svg's own width and height by the scale", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10" width="20" height="10"></svg>`;
    expect(rasterSize(svg, 1)).toEqual({ width: 20, height: 10 });
    expect(rasterSize(svg, 2)).toEqual({ width: 40, height: 20 });
    expect(rasterSize(svg, 3)).toEqual({ width: 60, height: 30 });
  });
});

import { describe, expect, it } from "vitest";
import { clampToolbar, readToolbar } from "./toolbar.ts";

const canvas = { w: 800, h: 600 };
const bar = { w: 200, h: 40 };

function placed(offset: { x: number; y: number }): { left: number; top: number } {
  const shown = clampToolbar(offset, canvas, bar);
  return { left: (canvas.w - bar.w) / 2 + shown.x, top: canvas.h - bar.h - 16 - shown.y };
}

describe("toolbar place", () => {
  it("stays at the bottom centre when the offset is zero", () => {
    expect(clampToolbar({ x: 0, y: 0 }, canvas, bar)).toEqual({ x: 0, y: 0 });
  });

  it("keeps a dragged toolbar inside the canvas, including after the canvas shrinks", () => {
    const shown = placed({ x: 5000, y: 5000 });
    expect(shown.left).toBeGreaterThanOrEqual(8);
    expect(shown.top).toBeGreaterThanOrEqual(8);
    expect(shown.left + bar.w).toBeLessThanOrEqual(canvas.w - 8);
    expect(shown.top + bar.h).toBeLessThanOrEqual(canvas.h - 8);
    const shrunk = clampToolbar({ x: 5000, y: 5000 }, { w: 240, h: 120 }, bar);
    const left = (240 - bar.w) / 2 + shrunk.x;
    const top = 120 - bar.h - 16 - shrunk.y;
    expect(left).toBeGreaterThanOrEqual(8);
    expect(top).toBeGreaterThanOrEqual(8);
    expect(left + bar.w).toBeLessThanOrEqual(240 - 8);
  });

  it("reads the offset and the visibility flag", () => {
    expect(readToolbar(undefined)).toEqual({ x: 0, y: 0, shown: true });
    expect(readToolbar({ x: 12, y: -4, shown: false })).toEqual({ x: 12, y: -4, shown: false });
    expect(readToolbar({ x: "no" })).toEqual({ x: 0, y: 0, shown: true });
  });
});

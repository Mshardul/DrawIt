import { describe, expect, it } from "vitest";
import { gridStep, snapTo } from "./snap.ts";

describe("grid snap", () => {
  it("[T-023] snapTo rounds to the nearest grid line, halves rounding up", () => {
    expect(snapTo(13, 8)).toBe(16);
    expect(snapTo(11, 8)).toBe(8);
    expect(snapTo(12, 8)).toBe(16);
    expect(snapTo(-13, 8)).toBe(-16);
    expect(snapTo(0, 8)).toBe(0);
  });

  it("[T-023] a grid size of 0 leaves the value alone", () => {
    expect(snapTo(13, 0)).toBe(13);
  });

  it("[T-023] gridStep keeps the cell size at high zoom", () => {
    expect(gridStep(8, 1)).toBe(8);
    expect(gridStep(8, 4)).toBe(8);
  });

  it("[T-023] gridStep doubles the cell until it is at least 8 screen px", () => {
    expect(gridStep(8, 0.5)).toBe(16);
    expect(gridStep(8, 0.25)).toBe(32);
    expect(gridStep(8, 0.1)).toBe(128);
  });
});

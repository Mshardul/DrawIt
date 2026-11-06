import { describe, expect, it } from "vitest";
import { PILL_INSET, readGrid, statusFit } from "./status.ts";

describe("status pill fit", () => {
  it("shows the cursor when both pills fit with the inset between them", () => {
    expect(statusFit(800, 200, 140, 300)).toBe("full");
  });

  it("drops the cursor when only the short form fits", () => {
    const file = 300;
    const full = 200;
    const short = 140;
    const stage = full + file + PILL_INSET * 3 - 1;
    expect(statusFit(stage, full, short, file)).toBe("short");
    expect(statusFit(short + file + PILL_INSET * 3, full, short, file)).toBe("short");
  });

  it("hides the pill when the short form does not fit either", () => {
    expect(statusFit(400, 200, 140, 300)).toBe("hidden");
  });
});

describe("grid preferences", () => {
  it("uses the defaults when nothing is stored", () => {
    expect(readGrid(undefined)).toEqual({ show: false, snap: false, size: 8 });
  });

  it("keeps a stored grid and ignores a size the pill does not offer", () => {
    expect(readGrid({ show: true, snap: true, size: 16 })).toEqual({ show: true, snap: true, size: 16 });
    expect(readGrid({ show: "yes", size: 12 })).toEqual({ show: false, snap: false, size: 8 });
  });
});

import { describe, expect, it } from "vitest";
import { dragPanel, fitPanels, readPanels } from "./panels.ts";

describe("stored panel widths", () => {
  it("uses 224 and 200, both shown, when nothing is stored", () => {
    expect(readPanels(undefined)).toEqual({ library: 224, properties: 200, libraryShown: true, propertiesShown: true });
    expect(readPanels({ library: "wide", propertiesShown: "yes" })).toEqual({
      library: 224,
      properties: 200,
      libraryShown: true,
      propertiesShown: true,
    });
  });

  it("keeps a stored width inside 180 to 360 and a visibility flag", () => {
    expect(readPanels({ library: 300.6, properties: 180, libraryShown: false })).toEqual({
      library: 301,
      properties: 180,
      libraryShown: false,
      propertiesShown: true,
    });
    expect(readPanels({ library: 10, properties: 900 })).toMatchObject({ library: 180, properties: 360 });
  });
});

describe("panel widths on a window", () => {
  it("keeps the stored widths while the canvas stays at least 480", () => {
    expect(fitPanels(300, 240, 1200)).toEqual({ library: 300, properties: 240 });
  });

  it("shrinks the panels toward 180 before the canvas goes under 480", () => {
    expect(fitPanels(360, 360, 900)).toEqual({ library: 210, properties: 210 });
    expect(fitPanels(300, 200, 900)).toEqual({ library: 231, properties: 189 });
  });

  it("lets the canvas go under 480 once both panels are at 180", () => {
    expect(fitPanels(360, 360, 700)).toEqual({ library: 180, properties: 180 });
  });

  it("keeps a drag inside 180 to 360 and leaves the canvas at least 480", () => {
    expect(dragPanel(400, 200, 1200)).toBe(360);
    expect(dragPanel(100, 200, 1200)).toBe(180);
    expect(dragPanel(300, 200, 900)).toBe(220);
    expect(dragPanel(300, 200, 700)).toBe(180);
  });
});

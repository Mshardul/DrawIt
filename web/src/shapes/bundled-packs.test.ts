import { describe, expect, it } from "vitest";
import { bundledPacks } from "./bundled-packs.ts";
import { createPackLoader } from "./pack-loader.ts";

describe("bundled packs", () => {
  it("hold a folder, manifest and SVGs for each pack in the repository", () => {
    const folders = bundledPacks.map((p) => p.folder).sort();
    expect(folders).toEqual(["arch", "core", "info"]);
    const core = bundledPacks.find((p) => p.folder === "core");
    expect(JSON.parse(core?.manifest ?? "{}")).toMatchObject({ pack: "core" });
    expect(Object.keys(core?.svgs ?? {})).toContain("rounded-rect.svg");
  });

  it("load without problems and draw a shape", () => {
    const loader = createPackLoader(bundledPacks);
    expect(loader.problems).toEqual([]);
    expect(loader.drawing("rounded-rect", { w: 200, h: 100 })?.box).toEqual({ w: 200, h: 100 });
  });
});

import { describe, expect, it } from "vitest";
import type { SvgNode } from "../render/describe.ts";
import { bundledLoader } from "../shapes/bundled-packs.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import type { LibraryEntry } from "./entries.ts";
import { libraryEntries } from "./entries.ts";
import { defaultSize, describePreview } from "./preview.ts";

const entry = (shape: string): LibraryEntry => {
  const found = libraryEntries(bundledLoader).find((e) => e.shape === shape);
  if (!found) throw new Error(`no entry ${shape}`);
  return found;
};
const tags = (node: SvgNode): string[] => [node.tag, ...node.children.flatMap(tags)];

describe("library preview", () => {
  it("draws a pack shape at its default size", () => {
    const preview = describePreview(entry("core.rounded-rect"), bundledLoader, monoMeasurer);
    expect(preview.size).toEqual({ w: 160, h: 80 });
    expect(tags(preview.nodes[0] as SvgNode)).toContain("path");
  });

  it("draws the built-in shapes at the standard size", () => {
    expect(describePreview(entry("rect"), bundledLoader, monoMeasurer).size).toEqual({ w: 160, h: 80 });
    const ellipse = describePreview(entry("ellipse"), bundledLoader, monoMeasurer);
    expect(tags(ellipse.nodes[0] as SvgNode)).toContain("ellipse");
  });

  it("draws no text, so the preview does not show the shape's name as a label", () => {
    for (const shape of ["rect", "core.rounded-rect"]) {
      expect(tags({ tag: "g", attrs: {}, children: describePreview(entry(shape), bundledLoader, monoMeasurer).nodes })).not.toContain("text");
    }
  });

  it("gives the default size without drawing", () => {
    expect(defaultSize(entry("core.rounded-rect"), bundledLoader)).toEqual({ w: 160, h: 80 });
    expect(defaultSize(entry("arch.database"), bundledLoader)).toEqual(bundledLoader.shape("arch.database")?.size);
  });
});

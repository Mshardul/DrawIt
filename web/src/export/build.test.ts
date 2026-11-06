import { describe, expect, it } from "vitest";
import type { DiagramDocument } from "../model/index.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { buildExport } from "./build.ts";

const doc = (): DiagramDocument => ({
  version: 1,
  title: "Regions",
  plugins: [],
  elements: [
    { kind: "frame", id: "region", name: "Overview" },
    { kind: "node", id: "inside", label: "In", shape: "rect" },
    { kind: "node", id: "away", label: "Out", shape: "rect" },
    { kind: "image", id: "logo", src: "assets/logo.png" },
  ],
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout: [
    { id: "region", x: 0, y: 0, w: 200, h: 120 },
    { id: "inside", x: 20, y: 20, w: 40, h: 40 },
    { id: "away", x: 800, y: 800, w: 40, h: 40 },
    { id: "logo", x: 80, y: 20, w: 40, h: 40 },
  ],
});

describe("building an export", () => {
  it("embeds fonts and image bytes for a frame, and names the file after the frame", async () => {
    const built = await buildExport({
      doc: doc(),
      measurer: monoMeasurer,
      diagramPath: "notes/network.drawit.kdl",
      images: () => ({ status: "ready", url: "blob:local/1", w: 8, h: 8 }),
      storage: {
        read: () => Promise.resolve(new Uint8Array([137, 80, 78, 71])),
      },
      readFont: () => Promise.resolve(new Uint8Array([1, 2, 3])),
      selection: [],
      scope: "frame",
      frameId: "region",
      format: "svg",
      scale: 2,
      transparent: true,
    });
    expect(built.name).toBe("network-region.svg");
    expect(built.message).toBe("");
    expect(built.svg).toContain('clip-path="url(#frame-region)"');
    expect(built.svg).toContain(">Overview<");
    expect(built.svg).toContain('data-id="inside"');
    expect(built.svg).not.toContain('data-id="away"');
    expect(built.svg).toContain("data:image/png;base64,iVBORw==");
    expect(built.svg).toContain("font-family:'Inter'");
    expect(built.svg).not.toContain("blob:local");
    expect(built.summary.startsWith("SVG:")).toBe(true);
    expect(built.blob?.type).toBe("image/svg+xml");
  });
});

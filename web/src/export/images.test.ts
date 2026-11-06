import { describe, expect, it } from "vitest";
import type { DiagramDocument } from "../model/index.ts";
import type { ImageLookup } from "../render/images.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { imageHrefs } from "./images.ts";
import { exportSvg } from "./svg.ts";

const doc = (): DiagramDocument => ({
  version: 1,
  title: "Pictures",
  plugins: [],
  elements: [
    { kind: "image", id: "logo", src: "assets/logo.png" },
    { kind: "image", id: "other", src: "assets/other.png" },
  ],
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout: [
    { id: "logo", x: 0, y: 0, w: 40, h: 40 },
    { id: "other", x: 80, y: 0, w: 40, h: 40 },
  ],
});

const ready: ImageLookup = () => ({ status: "ready", url: "blob:local/1", w: 8, h: 8 });

describe("images an export inlines", () => {
  it("reads image bytes through storage and writes data uris instead of blob urls", async () => {
    const reads: string[] = [];
    const hrefs = await imageHrefs(doc(), "notes/diagram.drawit.kdl", {
      read(path) {
        reads.push(path);
        if (path.endsWith("other.png")) return Promise.reject(new Error("missing"));
        return Promise.resolve(new Uint8Array([137, 80, 78, 71]));
      },
    });
    expect(reads.sort()).toEqual(["notes/assets/logo.png", "notes/assets/other.png"]);
    expect(hrefs.get("assets/logo.png")).toBe("data:image/png;base64,iVBORw==");
    expect(hrefs.has("assets/other.png")).toBe(false);

    const svg = exportSvg(doc(), monoMeasurer, {
      title: "Pictures",
      description: "Images",
      images: ready,
      imageHrefs: hrefs,
      ids: new Set(["logo"]),
    });
    expect(svg).toContain('href="data:image/png;base64,iVBORw=="');
    expect(svg).not.toContain("blob:local");
    expect(svg).not.toContain('data-id="other"');
  });
});

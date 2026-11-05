import { describe, expect, it } from "vitest";
import type { DiagramDocument } from "../model/index.ts";
import { useImages } from "../render/images.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { ThumbnailCache, cardFace, renderThumbnail } from "./thumbnail.ts";

const style = { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] };

function diagram(): DiagramDocument {
  return {
    version: 1,
    plugins: [],
    elements: [{ kind: "node", id: "a", label: "Alpha", shape: "rect" }],
    style,
    layout: [{ id: "a", x: 10, y: 20, w: 100, h: 50 }],
  };
}

describe("thumbnail picture", () => {
  it("draws the diagram at its bounds and uses the lookup it was given", () => {
    useImages(() => ({ status: "ready", url: "blob:open", w: 10, h: 10 }));
    const picture = renderThumbnail(diagram(), monoMeasurer, () => ({ status: "ready", url: "blob:thumb", w: 30, h: 20 }));
    expect(picture.viewBox).toBe("10 20 100 50");
    expect(picture.nodes.map((node) => node.attrs["data-id"])).toEqual(["a"]);
    const withImage = renderThumbnail(
      {
        ...diagram(),
        elements: [{ kind: "image", id: "i", src: "assets/x.png" }],
        layout: [{ id: "i", x: 0, y: 0, w: 40, h: 20 }],
      },
      monoMeasurer,
      () => ({ status: "ready", url: "blob:thumb", w: 30, h: 20 }),
    );
    const image = withImage.nodes[0]?.children.find((node) => node.tag === "image");
    expect(image?.attrs["href"]).toBe("blob:thumb");
  });

  it("includes the gradient and shadow definitions the shapes refer to", () => {
    const picture = renderThumbnail(
      {
        ...diagram(),
        style: { ...style, overrides: [{ id: "a", props: { fill: "linear(90, #000, #fff)" } }] },
      },
      monoMeasurer,
      () => ({ status: "loading" }),
    );
    expect(picture.defs.map((node) => node.tag)).toEqual(["linearGradient"]);
  });
});

describe("thumbnail cache", () => {
  it("parses once per path and modified time, and does not read a file over 1 MiB", async () => {
    const reads: string[] = [];
    const images: string[] = [];
    const text = "diagram version=1\n\nnode a shape=rect\n\nlayout {\n  a x=10 y=20 w=100 h=50\n}\n";
    const cache = new ThumbnailCache(
      {
        read(path) {
          reads.push(path);
          return Promise.resolve(new TextEncoder().encode(path.endsWith("bad.drawit.kdl") ? "diagram {\n" : text));
        },
        images(path) {
          images.push(path);
          return () => ({ status: "loading" });
        },
      },
      monoMeasurer,
    );
    const first = await cache.picture("Demo/a.drawit.kdl", "t1", 20);
    const again = await cache.picture("Demo/a.drawit.kdl", "t1", 20);
    expect(again).toBe(first);
    expect(reads).toEqual(["Demo/a.drawit.kdl"]);
    expect(images).toEqual(["Demo/a.drawit.kdl"]);
    expect(first).toMatchObject({ status: "ready", viewBox: "10 20 100 50" });

    const next = await cache.picture("Demo/a.drawit.kdl", "t2", 20);
    expect(next).not.toBe(first);
    expect(reads).toEqual(["Demo/a.drawit.kdl", "Demo/a.drawit.kdl"]);

    const invalid = await cache.picture("Demo/bad.drawit.kdl", "t1", 12);
    expect(invalid.status).toBe("invalid");
    if (invalid.status === "invalid") expect(invalid.line).toBeGreaterThanOrEqual(1);
    await cache.picture("Demo/bad.drawit.kdl", "t1", 12);
    expect(reads.filter((path) => path.endsWith("bad.drawit.kdl"))).toEqual(["Demo/bad.drawit.kdl"]);

    const huge = await cache.picture("Demo/big.drawit.kdl", "t1", 1024 * 1024 + 1);
    expect(huge).toEqual({ status: "too-large" });
    expect(reads).not.toContain("Demo/big.drawit.kdl");
  });
});

describe("card face", () => {
  it("shows drawing, the picture, the parse error and the size limit", () => {
    const picture = renderThumbnail(diagram(), monoMeasurer, () => ({ status: "loading" }));
    expect(cardFace(null)).toEqual({ kind: "message", tone: "load", text: "Drawing…" });
    expect(cardFace({ status: "too-large" })).toEqual({ kind: "message", tone: "big", text: "Too large to preview" });
    expect(cardFace({ status: "invalid", message: "line 2, column 4: nope", line: 2, column: 4 })).toEqual({
      kind: "message",
      tone: "bad",
      text: "Can't open this file",
      title: "line 2, column 4: nope",
    });
    expect(cardFace(picture)).toMatchObject({ kind: "picture", viewBox: "10 20 100 50" });
  });
});

import { describe, expect, it } from "vitest";
import { createPackLoader, type PackFiles } from "./pack-loader.ts";
import type { ShapeManifest } from "./types.ts";

const OUTLINE = "M 8 0 H 152 V 80 H 8 Z";
const boxSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80"><path data-role="fill" d="${OUTLINE}"/></svg>`;
const iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect data-role="fill" x="0" y="0" width="64" height="64"/></svg>';

const box: ShapeManifest = {
  id: "box",
  name: "Box",
  category: "Basic",
  tags: ["box"],
  svg: "box.svg",
  size: { w: 160, h: 80 },
  outline: OUTLINE,
  anchors: { top: { x: 80, y: 0 }, right: { x: 152, y: 40 }, bottom: { x: 80, y: 80 }, left: { x: 8, y: 40 } },
  label: { x: 16, y: 8, w: 128, h: 64 },
  stretch: { x: [8, 152] },
  keepAspect: false,
};
const icon: ShapeManifest = {
  id: "icon",
  name: "Icon",
  category: "Architecture (generic)",
  tags: ["icon"],
  svg: "icon.svg",
  size: { w: 64, h: 64 },
  outline: "M 0 0 H 64 V 64 H 0 Z",
  anchors: { top: { x: 32, y: 0 }, right: { x: 64, y: 32 }, bottom: { x: 32, y: 64 }, left: { x: 0, y: 32 } },
  label: { x: 8, y: 8, w: 48, h: 48 },
  keepAspect: true,
};

const ringSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80"><path data-role="stroke" d="${OUTLINE}"/><line data-role="detail" x1="8" y1="8" x2="40" y2="8"/></svg>`;
const ring: ShapeManifest = { ...box, id: "ring", name: "Ring", svg: "ring.svg", tags: ["ring"] };

const pack = (folder: string, shapes: ShapeManifest[], svgs: Record<string, string>, id = folder): PackFiles => ({
  folder,
  manifest: JSON.stringify({ pack: id, version: 1, shapes }),
  svgs,
});
const core = (): PackFiles => pack("core", [box], { "box.svg": boxSvg });
const arch = (): PackFiles => pack("arch", [icon], { "icon.svg": iconSvg });

describe("pack loader listing", () => {
  it("lists every loaded shape by full name, in pack and manifest order", () => {
    const loader = createPackLoader([core(), arch()]);
    expect(loader.shapes().map((s) => s.name)).toEqual(["core.box", "arch.icon"]);
    expect(loader.shapes()[1]?.shape).toBe(loader.shape("arch.icon"));
  });

  it("leaves out the shapes of a pack that failed", () => {
    const loader = createPackLoader([core(), pack("arch", [icon], {})]);
    expect(loader.shapes().map((s) => s.name)).toEqual(["core.box"]);
  });
});

describe("pack loader names", () => {
  it("resolves a full name, and a core shape without its prefix", () => {
    const loader = createPackLoader([core(), arch()]);
    expect(loader.shape("core.box")?.id).toBe("box");
    expect(loader.shape("box")).toBe(loader.shape("core.box"));
    expect(loader.shape("arch.icon")?.id).toBe("icon");
  });

  it("does not resolve a shape of another pack without its prefix", () => {
    const loader = createPackLoader([core(), arch()]);
    expect(loader.shape("icon")).toBeUndefined();
    expect(loader.shape("core.icon")).toBeUndefined();
    expect(loader.shape("net.icon")).toBeUndefined();
  });

  it("reports each name no pack provides once, in the order first seen", () => {
    const loader = createPackLoader([core(), arch()]);
    expect(loader.unknownShapes(["box", "icon", "core.box", "arch.icon", "net.router", "icon", "arch.gone"])).toEqual([
      "icon",
      "net.router",
      "arch.gone",
    ]);
  });
});

describe("pack loader drawing", () => {
  it("stretches the shape's SVG to the element size", () => {
    const drawing = createPackLoader([core()]).drawing("box", { w: 320, h: 80 });
    expect(drawing?.box).toEqual({ w: 320, h: 80 });
    expect(drawing?.svg.attrs["viewBox"]).toBe("0 0 320 80");
    expect(drawing?.svg.children[0]?.attrs["d"]).toContain("H 312");
  });

  it("fits a keep-aspect shape inside the element size", () => {
    const drawing = createPackLoader([arch()]).drawing("arch.icon", { w: 128, h: 32 });
    expect(drawing?.box).toEqual({ w: 32, h: 32 });
    expect(drawing?.svg.attrs["viewBox"]).toBe("0 0 32 32");
  });

  it("flattens the outline stretched to the element size, in the element's own space", () => {
    const outline = createPackLoader([core()]).drawing("box", { w: 320, h: 80 })?.outline ?? [];
    expect(outline[0]).toEqual({ x: 8, y: 0 });
    expect(outline).toContainEqual({ x: 312, y: 0 });
    expect(outline.at(-1)).toEqual(outline[0]);
  });

  it("stretches the anchors with the shape, in the element's own space", () => {
    const anchors = createPackLoader([core()]).drawing("box", { w: 320, h: 160 })?.anchors;
    expect(anchors).toEqual({ top: { x: 160, y: 0 }, right: { x: 312, y: 80 }, bottom: { x: 160, y: 160 }, left: { x: 8, y: 80 } });
  });

  it("moves the anchors of a keep-aspect shape to where the shape is centred", () => {
    const anchors = createPackLoader([arch()]).drawing("arch.icon", { w: 128, h: 64 })?.anchors;
    expect(anchors).toEqual({ top: { x: 64, y: 0 }, right: { x: 96, y: 32 }, bottom: { x: 64, y: 64 }, left: { x: 32, y: 32 } });
  });

  it("moves the outline of a keep-aspect shape to where the shape is centred", () => {
    const xs = (createPackLoader([arch()]).drawing("arch.icon", { w: 128, h: 64 })?.outline ?? []).map((p) => p.x);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([32, 96]);
  });

  it("says whether a drawing has a part that takes the fill", () => {
    const loader = createPackLoader([pack("core", [box, ring], { "box.svg": boxSvg, "ring.svg": ringSvg })]);
    expect(loader.drawing("box", { w: 160, h: 80 })?.filled).toBe(true);
    expect(loader.drawing("ring", { w: 160, h: 80 })?.filled).toBe(false);
  });

  it("returns nothing for an unknown shape", () => {
    expect(createPackLoader([core()]).drawing("nope", { w: 10, h: 10 })).toBeUndefined();
  });

  it("returns the same drawing for the same shape and size, and another for another size", () => {
    const loader = createPackLoader([core()]);
    const first = loader.drawing("box", { w: 200, h: 80 });
    expect(loader.drawing("core.box", { w: 200, h: 80 })).toBe(first);
    expect(loader.drawing("box", { w: 201, h: 80 })).not.toBe(first);
  });

  it("keeps a bounded number of sizes for one shape, dropping the least recently used", () => {
    const loader = createPackLoader([core()]);
    const first = loader.drawing("box", { w: 100, h: 80 });
    for (let w = 101; w < 101 + 600; w++) loader.drawing("box", { w, h: 80 });
    expect(loader.drawing("box", { w: 100, h: 80 })).not.toBe(first);
    const recent = loader.drawing("box", { w: 300, h: 80 });
    expect(loader.drawing("box", { w: 300, h: 80 })).toBe(recent);
  });
});

describe("pack loader problems", () => {
  it("has none for valid packs", () => {
    expect(createPackLoader([core(), arch()]).problems).toEqual([]);
  });

  it("leaves out a pack that fails validation and still loads the others", () => {
    const broken = pack("arch", [icon], { "icon.svg": iconSvg.replace('data-role="fill"', 'fill="red"') });
    const loader = createPackLoader([core(), broken]);
    expect(loader.problems.map((p) => p.pack)).toContain("arch");
    expect(loader.shape("arch.icon")).toBeUndefined();
    expect(loader.shape("box")).toBeDefined();
  });

  it("refuses a pack whose folder is not its id", () => {
    const loader = createPackLoader([pack("misc", [icon], { "icon.svg": iconSvg }, "arch")]);
    expect(loader.problems.map((p) => p.message).join()).toMatch(/folder misc must be named after the pack id arch/);
    expect(loader.shape("arch.icon")).toBeUndefined();
  });

  it("refuses a pack id that appears twice, keeping the first", () => {
    const loader = createPackLoader([core(), pack("other", [icon], { "icon.svg": iconSvg }, "core")]);
    expect(loader.problems.map((p) => p.message).join()).toMatch(/pack core appears twice/);
    expect(loader.shape("box")).toBeDefined();
    expect(loader.shape("icon")).toBeUndefined();
  });

  it("reports a manifest that is not JSON", () => {
    const loader = createPackLoader([{ folder: "core", manifest: "{", svgs: {} }]);
    expect(loader.problems).toHaveLength(1);
    expect(loader.problems[0]).toMatchObject({ pack: "core", code: "schema" });
    expect(loader.problems[0]?.message).toMatch(/not valid JSON/);
  });
});

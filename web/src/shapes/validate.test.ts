import { describe, expect, it } from "vitest";
import { validatePack } from "./validate.ts";

const OUTLINE = "M 8 0 H 152 V 80 H 8 Z";
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80"><path data-role="fill" d="${OUTLINE}"/></svg>`;

const shape = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "box",
  name: "Box",
  category: "Basic",
  tags: ["box"],
  svg: "box.svg",
  size: { w: 160, h: 80 },
  outline: OUTLINE,
  anchors: { top: { x: 80, y: 0 }, right: { x: 152, y: 40 }, bottom: { x: 80, y: 80 }, left: { x: 8, y: 40 } },
  label: { x: 16, y: 8, w: 128, h: 64 },
  keepAspect: false,
  ...over,
});
const pack = (over: Record<string, unknown> = {}, shapes: Record<string, unknown>[] = [shape()]): unknown => ({ pack: "core", version: 1, shapes, ...over });
const read = (svg: string) => (file: string) => (file === "box.svg" ? svg : undefined);
const codes = (manifest: unknown, svg = SVG): string[] => validatePack(manifest, read(svg)).map((p) => p.code);

describe("shape pack validation", () => {
  it("[T-022] a correct pack has no problems", () => {
    expect(validatePack(pack(), read(SVG))).toEqual([]);
  });

  it("[T-022] a problem names the pack and the shape", () => {
    const [problem] = validatePack(pack({}, [shape({ category: "Nope" })]), read(SVG));
    expect(problem).toMatchObject({ pack: "core", shape: "box", code: "schema" });
    expect(problem?.message).toContain("category");
  });

  it("[T-022] the manifest must be an object with a pack id, a version and shapes", () => {
    expect(codes(null)).toEqual(["schema"]);
    expect(codes(pack({ pack: "Core Pack" }))).toContain("schema");
    expect(codes(pack({ version: "1" }))).toContain("schema");
    expect(codes(pack({ shapes: [] }))).toContain("schema");
  });

  it("[T-022] shape ids match the id pattern and are unique in the pack", () => {
    expect(codes(pack({}, [shape({ id: "Box" })]))).toContain("schema");
    expect(codes(pack({}, [shape(), shape()]))).toContain("schema");
  });

  it("[T-022] every field of a shape is checked", () => {
    for (const bad of [{ name: "" }, { tags: [] }, { tags: ["Upper Case"] }, { svg: "" }, { size: { w: 160 } }, { keepAspect: "no" }, { outline: 5 }]) {
      expect(codes(pack({}, [shape(bad)])), JSON.stringify(bad)).toContain("schema");
    }
  });

  it("[T-022] the default size is a multiple of the 8px design grid", () => {
    expect(codes(pack({}, [shape({ size: { w: 150, h: 80 } })]))).toContain("size");
  });

  it("[T-022] the SVG viewBox is the default size", () => {
    expect(codes(pack(), SVG.replace("0 0 160 80", "0 0 100 80"))).toContain("size");
  });

  it("[T-022] a missing SVG file is a problem", () => {
    expect(codes(pack({}, [shape({ svg: "gone.svg" })]))).toContain("svg-missing");
  });

  it("[T-022] only path, rect, circle, ellipse, polygon, line, polyline and g are allowed", () => {
    for (const tag of ["text", "image", "style", "script", "filter", "use", "foreignObject"]) {
      const svg = SVG.replace("</svg>", `<${tag}/></svg>`);
      expect(codes(pack(), svg), tag).toContain("svg-element");
    }
  });

  it("[T-022] no literal colours, styles, classes, links or other attributes", () => {
    for (const attr of ['fill="#fff"', 'stroke="red"', 'style="fill:red"', 'class="x"', 'stroke-width="2"', 'href="http://x"', 'onclick="x()"', 'opacity="1"']) {
      const svg = SVG.replace('<path ', `<path ${attr} `);
      expect(codes(pack(), svg), attr).toContain("svg-attribute");
    }
  });

  it("[T-022] a literal colour is reported as one", () => {
    const [problem] = validatePack(pack(), read(SVG.replace('<path ', '<path fill="#fff" ')));
    expect(problem?.message).toMatch(/colour/);
  });

  it("[T-022] every drawn element has a role of fill, stroke or detail", () => {
    expect(codes(pack(), SVG.replace('data-role="fill" ', ""))).toContain("svg-role");
    expect(codes(pack(), SVG.replace('"fill"', '"shiny"'))).toContain("svg-role");
  });

  it("[T-022] an SVG that does not parse is a problem", () => {
    expect(codes(pack(), "<svg><path")).toContain("svg-parse");
  });

  it("[T-022] the outline is one closed path of absolute commands", () => {
    expect(codes(pack({}, [shape({ outline: "M 8 0 H 152 V 80 H 8" })]))).toContain("outline");
    expect(codes(pack({}, [shape({ outline: "m 8 0 h 144 v 80 z" })]))).toContain("outline");
    expect(codes(pack({}, [shape({ outline: "M 0 0 H 8 V 8 Z M 20 20 H 28 V 28 Z" })]))).toContain("outline");
  });

  it("[T-022] the four side anchors lie on the outline", () => {
    const off = shape({ anchors: { top: { x: 80, y: 10 }, right: { x: 152, y: 40 }, bottom: { x: 80, y: 80 }, left: { x: 8, y: 40 } } });
    expect(codes(pack({}, [off]))).toContain("anchor");
  });

  it("[T-022] anchors, including extra ones, are inside the shape's bounds", () => {
    const extra = shape({ anchors: { top: { x: 80, y: 0 }, right: { x: 152, y: 40 }, bottom: { x: 80, y: 80 }, left: { x: 8, y: 40 }, extra: [{ x: 200, y: 40 }] } });
    expect(codes(pack({}, [extra]))).toContain("anchor");
  });

  it("[T-022] extra anchors are accepted when valid", () => {
    const ok = shape({ anchors: { top: { x: 80, y: 0 }, right: { x: 152, y: 40 }, bottom: { x: 80, y: 80 }, left: { x: 8, y: 40 }, extra: [{ x: 8, y: 0 }] } });
    expect(codes(pack({}, [ok]))).toEqual([]);
  });

  it("[T-022] the label rectangle is inside the shape's bounds", () => {
    expect(codes(pack({}, [shape({ label: { x: 16, y: 8, w: 200, h: 64 } })]))).toContain("label");
    expect(codes(pack({}, [shape({ label: { x: -4, y: 8, w: 40, h: 64 } })]))).toContain("label");
    expect(codes(pack({}, [shape({ label: { x: 16, y: 8, w: 0, h: 64 } })]))).toContain("label");
  });

  it("[T-022] stretch has exactly two ascending cut lines per axis, inside the shape", () => {
    expect(codes(pack({}, [shape({ stretch: { x: [8, 152], y: [8, 72] } })]))).toEqual([]);
    expect(codes(pack({}, [shape({ stretch: { x: [8] } })]))).toContain("stretch");
    expect(codes(pack({}, [shape({ stretch: { x: [152, 8] } })]))).toContain("stretch");
    expect(codes(pack({}, [shape({ stretch: { x: [8, 8] } })]))).toContain("stretch");
    expect(codes(pack({}, [shape({ stretch: { x: [0, 152] } })]))).toContain("stretch");
    expect(codes(pack({}, [shape({ stretch: { x: [8, 400] } })]))).toContain("stretch");
    expect(codes(pack({}, [shape({ stretch: { z: [8, 152] } })]))).toContain("stretch");
  });

  it("[T-022] a keep-aspect shape has no cut lines", () => {
    expect(codes(pack({}, [shape({ keepAspect: true, stretch: { x: [8, 152] } })]))).toContain("stretch");
    expect(codes(pack({}, [shape({ keepAspect: true })]))).toEqual([]);
  });

  it("[T-022] a circle or ellipse may not straddle a cut line", () => {
    const circle = (cx: number) => SVG.replace("</svg>", `<circle data-role="detail" cx="${String(cx)}" cy="40" r="10"/></svg>`);
    const stretchy = pack({}, [shape({ stretch: { x: [60, 100] } })]);
    expect(codes(stretchy, circle(80))).toEqual([]);
    expect(codes(stretchy, circle(55))).toContain("stretch");
  });
});

import { describe, expect, it } from "vitest";
import { parseSvg } from "./svg.ts";
import { axisScale, stretchAxis, stretchPoint, stretchSvg, targetBox } from "./stretch.ts";

const cuts: [number, number] = [8, 152];

describe("stretch: one axis", () => {
  it("[T-022] with no cut lines the whole shape scales", () => {
    expect(stretchAxis(80, 160, 320)).toBe(160);
    expect(stretchAxis(0, 160, 320)).toBe(0);
    expect(stretchAxis(160, 160, 320)).toBe(320);
  });

  it("[T-022] parts outside the cut lines keep their size and move; parts between scale", () => {
    expect(stretchAxis(4, 160, 320, cuts)).toBe(4);
    expect(stretchAxis(156, 160, 320, cuts)).toBe(316);
    expect(stretchAxis(80, 160, 320, cuts)).toBeCloseTo(160);
    expect(stretchAxis(8, 160, 320, cuts)).toBe(8);
    expect(stretchAxis(152, 160, 320, cuts)).toBe(312);
  });

  it("[T-022] the fixed parts keep their size at any larger target", () => {
    for (const target of [16, 17, 100, 1000]) {
      expect(stretchAxis(160, 160, target, cuts) - stretchAxis(152, 160, target, cuts)).toBeCloseTo(8);
      expect(stretchAxis(8, 160, target, cuts)).toBeCloseTo(8);
    }
  });

  it("[T-022] at the design size every point maps to itself", () => {
    for (const v of [0, 4, 8, 80, 152, 160]) expect(stretchAxis(v, 160, 160, cuts)).toBeCloseTo(v);
  });

  it("[T-022] a target narrower than the fixed parts shrinks them together and collapses the middle", () => {
    expect(stretchAxis(0, 160, 8, cuts)).toBe(0);
    expect(stretchAxis(8, 160, 8, cuts)).toBe(4);
    expect(stretchAxis(80, 160, 8, cuts)).toBe(4);
    expect(stretchAxis(152, 160, 8, cuts)).toBe(4);
    expect(stretchAxis(160, 160, 8, cuts)).toBe(8);
  });

  it("[T-022] the local scale is 1 in a fixed part and the stretch factor in the middle", () => {
    expect(axisScale(4, 160, 320, cuts)).toBe(1);
    expect(axisScale(80, 160, 320, cuts)).toBeCloseTo(304 / 144);
    expect(axisScale(80, 160, 320)).toBe(2);
  });

  it("[T-022] a point stretches on each axis by its own cut lines", () => {
    const p = stretchPoint({ x: 80, y: 40 }, { w: 160, h: 80 }, { w: 320, h: 160 }, { x: cuts });
    expect(p.x).toBeCloseTo(160);
    expect(p.y).toBe(80);
  });

  it("[T-022] keep-aspect fits the target box and leaves the shape's ratio alone", () => {
    expect(targetBox({ w: 96, h: 96 }, { w: 200, h: 100 }, true)).toEqual({ w: 100, h: 100 });
    expect(targetBox({ w: 96, h: 96 }, { w: 200, h: 100 }, false)).toEqual({ w: 200, h: 100 });
  });
});

describe("stretch: an SVG tree", () => {
  const svg = (body: string) =>
    parseSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80">${body}</svg>`);
  const attrs = (tree: ReturnType<typeof svg>, i = 0) => tree.children[i]?.attrs ?? {};

  it("[T-022] the viewBox becomes the target size", () => {
    const out = stretchSvg(svg(""), { w: 160, h: 80 }, { w: 320, h: 40 });
    expect(out.attrs["viewBox"]).toBe("0 0 320 40");
  });

  it("[T-022] path coordinates stretch for every command", () => {
    const tree = svg('<path data-role="fill" d="M 0 0 H 160 V 80 C 160 40 120 40 80 40 Q 40 40 0 80 L 0 0 Z"/>');
    const d = attrs(stretchSvg(tree, { w: 160, h: 80 }, { w: 320, h: 160 }, { x: cuts, y: [8, 72] }))["d"];
    expect(d).toContain("H 320");
    expect(d).toContain("V 160");
    expect(d?.startsWith("M 0 0")).toBe(true);
    expect(d?.endsWith("Z")).toBe(true);
  });

  it("[T-022] polygon and line points stretch", () => {
    const tree = svg('<polygon data-role="fill" points="0,0 160,0 160,80"/><line data-role="detail" x1="8" y1="0" x2="152" y2="80"/>');
    const out = stretchSvg(tree, { w: 160, h: 80 }, { w: 320, h: 80 }, { x: cuts });
    expect(attrs(out, 0)["points"]).toBe("0,0 320,0 320,80");
    expect(attrs(out, 1)).toMatchObject({ x1: "8", y1: "0", x2: "312", y2: "80" });
  });

  it("[T-022] a rect keeps its position and edges on the stretch, and its corner radius", () => {
    const tree = svg('<rect data-role="fill" x="0" y="0" width="160" height="80" rx="8"/>');
    expect(attrs(stretchSvg(tree, { w: 160, h: 80 }, { w: 320, h: 80 }, { x: cuts }))).toMatchObject({ x: "0", y: "0", width: "320", height: "80", rx: "8" });
  });

  it("[T-022] a circle becomes an ellipse scaled by the local stretch", () => {
    const tree = svg('<circle data-role="detail" cx="80" cy="40" r="10"/>');
    const out = attrs(stretchSvg(tree, { w: 160, h: 80 }, { w: 320, h: 80 }, { x: cuts }));
    expect(out["cx"]).toBe("160");
    expect(out["cy"]).toBe("40");
    expect(Number(out["rx"])).toBeCloseTo(10 * (304 / 144), 2);
    expect(out["ry"]).toBe("10");
  });

  it("[T-022] children of a group are stretched", () => {
    const tree = svg('<g><line data-role="stroke" x1="0" y1="0" x2="160" y2="0"/></g>');
    const out = stretchSvg(tree, { w: 160, h: 80 }, { w: 320, h: 80 });
    expect(out.children[0]?.children[0]?.attrs["x2"]).toBe("320");
  });

  it("[T-022] the stretched tree at the design size equals the original coordinates", () => {
    const tree = svg('<path data-role="fill" d="M 8 0 H 152 V 80 H 8 Z"/>');
    expect(attrs(stretchSvg(tree, { w: 160, h: 80 }, { w: 160, h: 80 }, { x: cuts }))["d"]).toBe("M 8 0 H 152 V 80 H 8 Z");
  });
});

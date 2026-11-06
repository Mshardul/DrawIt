import { describe, expect, it } from "vitest";
import type { DiagramDocument } from "../model/index.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { embeddedFonts, usedFontFaces } from "./fonts.ts";
import { exportSvg } from "./svg.ts";

const doc = (): DiagramDocument => ({
  version: 1,
  title: "Type",
  plugins: [],
  elements: [
    { kind: "node", id: "plain", label: "Hi", shape: "rect" },
    { kind: "text", id: "code", content: "x" },
    { kind: "text", id: "aside", content: "y" },
  ],
  style: {
    theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} },
    classes: [],
    overrides: [
      { id: "code", props: { font: "JetBrains Mono", weight: 700, italic: true } },
      { id: "aside", props: { font: "Source Serif 4" } },
    ],
  },
  layout: [
    { id: "plain", x: 0, y: 0, w: 80, h: 40 },
    { id: "code", x: 0, y: 50, w: 80, h: 40 },
    { id: "aside", x: 0, y: 100, w: 80, h: 40 },
  ],
});

describe("fonts an export embeds", () => {
  it("keeps every script of each face the exported text resolves to", () => {
    const faces = usedFontFaces(doc());
    const key = (family: string, weight: number, italic: boolean): string => `${family} ${String(weight)} ${italic ? "italic" : "normal"}`;
    const used = new Set(faces.map((face) => key(face.family, face.weight, face.italic)));
    expect(used).toEqual(new Set([key("Inter", 400, false), key("JetBrains Mono", 700, true), key("Source Serif 4", 400, false)]));
    expect(faces.filter((face) => face.family === "Inter" && face.weight === 400 && !face.italic).map((face) => face.script).sort()).toEqual(["cyrillic", "greek", "latin"]);

    const withoutAside = usedFontFaces(doc(), new Set(["plain", "code"]));
    expect(withoutAside.some((face) => face.family === "Source Serif 4")).toBe(false);
  });

  it("writes those faces into the svg as base64 font faces", async () => {
    const fonts = await embeddedFonts(doc(), undefined, () => Promise.resolve(new Uint8Array([1, 2, 3])));
    const svg = exportSvg(doc(), monoMeasurer, { title: "Type", description: "Text", fonts });
    expect(svg).toContain("text { white-space: pre; }");
    expect(svg).toContain("font-family:'Inter'");
    expect(svg).toContain("font-family:'JetBrains Mono'");
    expect(svg).toContain("font-weight:700");
    expect(svg).toContain("font-style:italic");
    expect(svg).toContain("font-family:'Source Serif 4'");
    expect(svg).toContain("src:url('data:font/woff2;base64,AQID')");
    expect(svg.match(/@font-face/g)?.length).toBe(usedFontFaces(doc()).length);

    const subset = await embeddedFonts(doc(), new Set(["plain"]), () => Promise.resolve(new Uint8Array([1])));
    const one = exportSvg(doc(), monoMeasurer, { title: "Type", description: "Text", ids: new Set(["plain"]), fonts: subset });
    expect(one).toContain("font-family:'Inter'");
    expect(one).not.toContain("font-family:'JetBrains Mono'");
    expect(one).not.toContain("font-family:'Source Serif 4'");
  });
});

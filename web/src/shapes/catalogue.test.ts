import { describe, expect, it } from "vitest";
import { CATALOGUE_STYLE, catalogueBody, problemList } from "./catalogue.ts";
import type { PackManifest, ShapeManifest } from "./types.ts";

const OUTLINE = "M 0 0 H 64 V 64 H 0 Z";
const shape = (id: string, name: string, category: string, size = { w: 64, h: 64 }): ShapeManifest => ({
  id,
  name,
  category,
  tags: ["tag"],
  svg: `${id}.svg`,
  size,
  outline: OUTLINE,
  anchors: { top: { x: 32, y: 0 }, right: { x: 64, y: 32 }, bottom: { x: 32, y: 64 }, left: { x: 0, y: 32 } },
  label: { x: 8, y: 8, w: 48, h: 48 },
  keepAspect: false,
});
const svgOf = ({ w, h }: { w: number; h: number }): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(w)} ${String(h)}"><path data-role="fill" d="${OUTLINE}"/><line data-role="detail" x1="0" y1="8" x2="8" y2="8"/></svg>`;

const core: PackManifest = { pack: "core", version: 1, shapes: [shape("late", "Late <one>", "Flowchart"), shape("early", "Early", "Basic"), shape("huge", "Huge", "Basic", { w: 400, h: 300 })] };
const arch: PackManifest = { pack: "arch", version: 1, shapes: [shape("server", "Server", "Architecture (generic)")] };
const stray = (name: string): string => `<figure data-file="${name}"`;
const html = catalogueBody([
  { manifest: core, svgs: { "late.svg": svgOf({ w: 64, h: 64 }), "early.svg": svgOf({ w: 64, h: 64 }), "huge.svg": svgOf({ w: 400, h: 300 }) } },
  { manifest: arch, svgs: { "server.svg": svgOf({ w: 64, h: 64 }), "forgotten.svg": svgOf({ w: 64, h: 48 }) } },
]);
const card = (name: string): string => new RegExp(`<figure[^>]*data-(?:shape|file)="${name}"[^>]*>([\\s\\S]*?)</figure>`).exec(html)?.[1] ?? "";

describe("catalogue", () => {
  it("shows each shape once with its full name", () => {
    for (const name of ["core.late", "core.early", "core.huge", "arch.server"]) {
      expect(html.match(new RegExp(`data-shape="${name}"`, "g")), name).toHaveLength(1);
      expect(card(name)).toContain(`>${name}<`);
    }
  });

  it("shows nothing but the thumbnail and the name: no guides, no sizes, no dark copies", () => {
    expect(card("core.early")).not.toContain("outline");
    expect(card("core.early")).not.toContain("label-area");
    expect(card("core.early")).not.toContain("<circle");
    expect(html).not.toContain("theme-dark");
    expect(html.match(/<figure/g)).toHaveLength(5);
  });

  it("also shows an SVG file that no shape names, by its file name, after the shapes", () => {
    expect(html).toContain(stray("arch/forgotten.svg"));
    expect(html.match(/data-file="arch\/forgotten.svg"/g)).toHaveLength(1);
    expect(html.match(/data-file=/g)).toHaveLength(1);
    expect(html.indexOf("<h2>Not in a pack.json</h2>")).toBeGreaterThan(html.indexOf("core.late"));
    expect(card("arch/forgotten.svg")).toMatch(/<svg[^>]*width="64"[^>]*height="48"/);
    expect(card("arch/forgotten.svg")).toContain(">arch/forgotten.svg<");
  });

  it("has no such section when every file is named", () => {
    expect(catalogueBody([{ manifest: arch, svgs: { "server.svg": svgOf({ w: 64, h: 64 }) } }])).not.toContain("Not in a pack.json");
  });

  it("groups the shapes under the shape categories in their order", () => {
    const headings = [...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1]);
    expect(headings).toEqual(["Basic", "Flowchart", "Architecture (generic)", "Not in a pack.json"]);
    expect(html.indexOf("core.early")).toBeLessThan(html.indexOf("core.late"));
  });

  it("draws a shape at its default size and shrinks a large one to fit", () => {
    expect(card("core.early")).toMatch(/<svg[^>]*width="64"[^>]*height="64"/);
    const huge = /<svg[^>]*width="(\d+(?:\.\d+)?)"[^>]*height="(\d+(?:\.\d+)?)"/.exec(card("core.huge"));
    expect(Number(huge?.[1])).toBeLessThanOrEqual(160);
    expect(Number(huge?.[2])).toBeLessThanOrEqual(120);
    expect(Number(huge?.[1]) / Number(huge?.[2])).toBeCloseTo(400 / 300, 2);
  });

  it("colours parts by role, with details drawn so they show", () => {
    expect(CATALOGUE_STYLE).toMatch(/\[data-role="fill"\]\s*\{[^}]*fill:\s*var\(--fill\)/);
    expect(CATALOGUE_STYLE).toMatch(/\[data-role="detail"\]\s*\{[^}]*fill:\s*none/);
  });

  it("escapes names and has no scripts", () => {
    expect(html).not.toContain("<one>");
    expect(html).not.toMatch(/<script/i);
  });

  describe("problems", () => {
    it("lists each problem with its pack and shape, escaped, and nothing when there are none", () => {
      expect(problemList([])).toBe("");
      const list = problemList([
        { pack: "arch", shape: "server", code: "svg-missing", message: "server.svg not found <here>" },
        { pack: "net", code: "schema", message: "pack.json is not valid JSON" },
      ]);
      expect(list).toContain("arch.server");
      expect(list).toContain("server.svg not found &lt;here&gt;");
      expect(list).toContain("net");
      expect(list).not.toContain("<here>");
    });
  });
});

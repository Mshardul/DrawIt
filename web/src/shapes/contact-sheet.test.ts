import { describe, expect, it } from "vitest";
import { renderContactSheet } from "./contact-sheet.ts";
import type { PackManifest } from "./types.ts";

const OUTLINE = "M 8 0 H 152 V 80 H 8 Z";
const manifest: PackManifest = {
  pack: "core",
  version: 1,
  shapes: [
    {
      id: "box",
      name: "Box <one>",
      category: "Basic",
      tags: ["box"],
      svg: "box.svg",
      size: { w: 160, h: 80 },
      outline: OUTLINE,
      anchors: { top: { x: 80, y: 0 }, right: { x: 152, y: 40 }, bottom: { x: 80, y: 80 }, left: { x: 8, y: 40 } },
      label: { x: 16, y: 8, w: 128, h: 64 },
      stretch: { x: [8, 152] },
      keepAspect: false,
    },
    {
      id: "icon",
      name: "Icon",
      category: "Basic",
      tags: ["icon"],
      svg: "icon.svg",
      size: { w: 64, h: 64 },
      outline: "M 0 0 H 64 V 64 H 0 Z",
      anchors: { top: { x: 32, y: 0 }, right: { x: 64, y: 32 }, bottom: { x: 32, y: 64 }, left: { x: 0, y: 32 } },
      label: { x: 8, y: 8, w: 48, h: 48 },
      keepAspect: true,
    },
  ],
};
const svgs = {
  "box.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80"><path data-role="fill" d="${OUTLINE}"/></svg>`,
  "icon.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect data-role="fill" x="0" y="0" width="64" height="64"/></svg>`,
};
const html = renderContactSheet([{ manifest, svgs }]);
const cell = (shape: string, size: string, theme: string) =>
  new RegExp(`<figure[^>]*data-shape="${shape}"[^>]*data-size="${size}"[^>]*data-theme="${theme}"[^>]*>([\\s\\S]*?)</figure>`).exec(html)?.[1] ?? "";

describe("contact sheet", () => {
  it("[T-022] shows every shape at default, wide and narrow size in light and dark", () => {
    for (const size of ["default", "wide", "narrow"]) for (const theme of ["light", "dark"]) {
      expect(cell("core.box", size, theme), `${size} ${theme}`).toContain("<svg");
    }
  });

  it("[T-022] wide is twice the default width and narrow half, stretched by the cut lines", () => {
    expect(cell("core.box", "wide", "light")).toContain('viewBox="0 0 320 80"');
    expect(cell("core.box", "narrow", "light")).toContain('viewBox="0 0 80 80"');
    expect(cell("core.box", "wide", "light")).toContain("H 312");
  });

  it("[T-022] a keep-aspect shape keeps its ratio when wide or narrow", () => {
    expect(cell("core.icon", "wide", "light")).toContain('viewBox="0 0 64 64"');
    expect(cell("core.icon", "narrow", "light")).toContain('viewBox="0 0 32 32"');
  });

  it("[T-022] a guides cell draws the outline, anchors and label area", () => {
    const guides = /<figure[^>]*data-shape="core.box"[^>]*data-size="guides"[^>]*>([\s\S]*?)<\/figure>/.exec(html)?.[1] ?? "";
    expect(guides).toContain(OUTLINE);
    expect(guides.match(/<circle/g)).toHaveLength(4);
    expect(guides).toContain('class="label-area"');
  });

  it("[T-022] names are escaped and the page has no scripts", () => {
    expect(html).toContain("Box &lt;one&gt;");
    expect(html).not.toContain("<one>");
    expect(html).not.toMatch(/<script/i);
  });

  it("[T-022] the light and dark themes colour the roles through the same classes", () => {
    expect(html).toMatch(/\.theme-dark/);
    expect(html).toMatch(/\[data-role="fill"\]/);
    expect(html).toMatch(/\[data-role="detail"\]/);
  });
});

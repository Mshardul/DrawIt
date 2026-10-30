// The contact sheet: every shape of every pack at its default size, stretched wide and stretched
// narrow, in the light and the dark theme, plus a guides view with the outline, anchors and label
// area. It is one self-contained HTML page drawn with the same stretch function the app uses, so
// what an author sees is what the canvas will draw.
import { parseSvg, type SvgEl } from "./svg.ts";
import { stretchSvg, targetBox } from "./stretch.ts";
import type { PackManifest, ShapeManifest, Size } from "./types.ts";

export interface SheetPack {
  manifest: PackManifest;
  /** SVG text by file name. */
  svgs: Record<string, string>;
}

const STYLE = `
:root { color-scheme: light dark; font: 14px system-ui, sans-serif; }
body { margin: 0; padding: 24px; background: #f2f2f2; color: #1a1a1a; }
h1 { font-size: 20px; }
section { margin: 0 0 32px; }
h2 { font-size: 15px; margin: 0 0 4px; }
h2 small { font-weight: normal; color: #666; margin-left: 8px; }
.row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
figure { margin: 0; padding: 8px; border-radius: 6px; }
figcaption { font-size: 11px; margin-top: 4px; opacity: 0.7; }
.theme-light { --bg: #ffffff; --fill: #dbe8f5; --stroke: #1f4e79; color: #1a1a1a; background: var(--bg); }
.theme-dark { --bg: #1b1f24; --fill: #27415c; --stroke: #8fb8e0; color: #eeeeee; background: var(--bg); }
svg { --stroke-width: 1.5; display: block; overflow: visible; stroke-linejoin: round; stroke-linecap: round; }
svg [data-role="fill"] { fill: var(--fill); stroke: var(--stroke); stroke-width: var(--stroke-width); }
svg [data-role="stroke"] { fill: none; stroke: var(--stroke); stroke-width: var(--stroke-width); }
svg [data-role="detail"] { fill: none; stroke: var(--stroke); stroke-width: calc(var(--stroke-width) * 2 / 3); }
svg .outline { fill: none; stroke: #d33; stroke-width: 1; stroke-dasharray: 3 2; }
svg .anchor { fill: #d33; }
svg .label-area { fill: none; stroke: #2a9d4a; stroke-width: 1; stroke-dasharray: 2 2; }
`;

const escape = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function serialize(el: SvgEl): string {
  const attrs = Object.entries(el.attrs).map(([k, v]) => ` ${k}="${escape(v)}"`).join("");
  return el.children.length === 0 ? `<${el.tag}${attrs}/>` : `<${el.tag}${attrs}>${el.children.map(serialize).join("")}</${el.tag}>`;
}

const el = (tag: string, attrs: Record<string, string | number>): SvgEl => ({
  tag,
  attrs: Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, String(v)])),
  children: [],
});

function draw(shape: ShapeManifest, svg: string, target: Size, guides: boolean): string {
  const box = targetBox(shape.size, target, shape.keepAspect);
  const drawn = stretchSvg(parseSvg(svg), shape.size, box, shape.stretch);
  drawn.attrs["width"] = String(box.w);
  drawn.attrs["height"] = String(box.h);
  if (guides) {
    const { anchors, label } = shape;
    drawn.children.push(
      el("path", { class: "outline", d: shape.outline }),
      el("rect", { class: "label-area", x: label.x, y: label.y, width: label.w, height: label.h }),
      ...[anchors.top, anchors.right, anchors.bottom, anchors.left, ...(anchors.extra ?? [])].map((p) => el("circle", { class: "anchor", cx: p.x, cy: p.y, r: 3 })),
    );
  }
  return serialize(drawn);
}

function section(pack: string, shape: ShapeManifest, svg: string): string {
  const name = `${pack}.${shape.id}`;
  const { w, h } = shape.size;
  const cells: [string, string, Size, boolean][] = [
    ["default", "light", shape.size, false],
    ["default", "dark", shape.size, false],
    ["wide", "light", { w: w * 2, h }, false],
    ["wide", "dark", { w: w * 2, h }, false],
    ["narrow", "light", { w: w / 2, h }, false],
    ["narrow", "dark", { w: w / 2, h }, false],
    ["guides", "light", shape.size, true],
  ];
  const figures = cells.map(
    ([size, theme, target, guides]) =>
      `<figure class="theme-${theme}" data-shape="${escape(name)}" data-size="${size}" data-theme="${theme}">${draw(shape, svg, target, guides)}<figcaption>${size} ${theme}</figcaption></figure>`,
  );
  const meta = `${escape(shape.category)} · ${String(shape.size.w)}×${String(shape.size.h)}${shape.keepAspect ? " · keep aspect" : ""} · ${escape(shape.tags.join(", "))}`;
  return `<section><h2>${escape(shape.name)}<small>${escape(name)} · ${meta}</small></h2><div class="row">${figures.join("")}</div></section>`;
}

/** The page for `packs`. Every pack must already have passed the validator. */
export function renderContactSheet(packs: SheetPack[]): string {
  const sections = packs.flatMap(({ manifest, svgs }) =>
    manifest.shapes.map((shape) => section(manifest.pack, shape, svgs[shape.svg] ?? "")),
  );
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>DrawIt shape contact sheet</title><style>${STYLE}</style></head><body><h1>Shape contact sheet</h1>${sections.join("\n")}</body></html>\n`;
}

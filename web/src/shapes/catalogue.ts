// The catalogue: every shape of every pack as a thumbnail with its name, by category. It is for
// looking at the shapes, so it has no sizes, guides or dark copies; the contact sheet has those.
// `catalogue.html` draws it live from the pack files.
import { escape, ROLE_STYLE, serialize, type SheetPack } from "./contact-sheet.ts";
import { parseSvg } from "./svg.ts";
import { CATEGORIES, type Problem } from "./types.ts";

/** The largest thumbnail, in px. A shape larger than this is shrunk to fit; a smaller one is drawn at its default size. */
const MAX_W = 160;
const MAX_H = 120;

export const CATALOGUE_STYLE = `
:root { font: 14px system-ui, sans-serif; }
body { margin: 0; padding: 24px; background: #f2f2f2; color: #1a1a1a; }
h1 { font-size: 20px; }
h2 { font-size: 15px; margin: 24px 0 8px; }
.grid { display: flex; flex-wrap: wrap; gap: 12px; }
figure { --fill: #dbe8f5; --stroke: #1f4e79; margin: 0; width: 184px; padding: 12px 8px 8px; box-sizing: border-box; border-radius: 6px; background: #fff; text-align: center; }
.problems { background: #fde8e8; color: #7a1010; padding: 8px 8px 8px 28px; border-radius: 6px; }
.thumb { height: ${String(MAX_H)}px; display: flex; align-items: center; justify-content: center; }
figcaption { font-size: 12px; margin-top: 8px; }
${ROLE_STYLE}`;

function thumbnail(svg: string, w: number, h: number): string {
  const scale = Math.min(1, MAX_W / w, MAX_H / h);
  const drawn = parseSvg(svg);
  drawn.attrs["width"] = String(Math.round(w * scale * 100) / 100);
  drawn.attrs["height"] = String(Math.round(h * scale * 100) / 100);
  return serialize(drawn);
}

/** The problems of the packs as a list, or nothing when there are none. */
export function problemList(problems: readonly Problem[]): string {
  if (problems.length === 0) return "";
  const items = problems.map((p) => `<li><b>${escape(p.shape === undefined ? p.pack : `${p.pack}.${p.shape}`)}</b> ${escape(p.message)}</li>`);
  return `<ul class="problems">${items.join("")}</ul>`;
}

/** The size an SVG file declares in its viewBox, or the largest thumbnail when it declares none. */
function declaredSize(svg: string): { w: number; h: number } {
  const [, , w, h] = (/viewBox="([^"]*)"/.exec(svg)?.[1] ?? "").trim().split(/\s+/).map(Number);
  return w !== undefined && h !== undefined && w > 0 && h > 0 ? { w, h } : { w: MAX_W, h: MAX_H };
}

/** The thumbnails of `packs` by category, then any SVG file no shape names. A shape whose SVG is missing is drawn empty. */
export function catalogueBody(packs: SheetPack[]): string {
  const cards = packs.flatMap(({ manifest, svgs }) =>
    manifest.shapes.map((shape) => {
      const name = `${manifest.pack}.${shape.id}`;
      const figure = `<figure data-shape="${escape(name)}"><div class="thumb">${thumbnail(svgs[shape.svg] ?? "", shape.size.w, shape.size.h)}</div><figcaption>${escape(name)}</figcaption></figure>`;
      return { category: shape.category, figure };
    }),
  );
  const sections = CATEGORIES.flatMap((category) => {
    const inCategory = cards.filter((c) => c.category === category);
    return inCategory.length === 0 ? [] : [`<h2>${escape(category)}</h2><div class="grid">${inCategory.map((c) => c.figure).join("")}</div>`];
  });
  const strays = packs.flatMap(({ manifest, svgs }) => {
    const named = new Set(manifest.shapes.map((shape) => shape.svg));
    return Object.keys(svgs)
      .filter((file) => !named.has(file))
      .sort()
      .map((file) => {
        const name = `${manifest.pack}/${file}`;
        const { w, h } = declaredSize(svgs[file] ?? "");
        return `<figure data-file="${escape(name)}"><div class="thumb">${thumbnail(svgs[file] ?? "", w, h)}</div><figcaption>${escape(name)}</figcaption></figure>`;
      });
  });
  if (strays.length > 0) sections.push(`<h2>Not in a pack.json</h2><div class="grid">${strays.join("")}</div>`);
  return sections.join("\n");
}

// Turns a rendered node tree into an SVG document. The nodes are the ones the canvas draws.
import type { DiagramDocument, FrameElement } from "../model/index.ts";
import { layoutById } from "../model/lookup.ts";
import { diagramBounds, elementExtent } from "../render/bounds.ts";
import { type Box, elementBox } from "../render/boxes.ts";
import { describeDefs } from "../render/defs.ts";
import { describeDiagram, type SvgNode } from "../render/describe.ts";
import { frameName } from "../render/frame.ts";
import { type ImageLookup, openImages } from "../render/images.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { fontFaceCss, type EmbeddedFont } from "./fonts.ts";

export const EXPORT_PAD = 16;

export interface SvgDocument {
  nodes: readonly SvgNode[];
  defs: readonly SvgNode[];
  viewBox: { x: number; y: number; w: number; h: number };
  title: string;
  description: string;
  /** Font faces embedded ahead of the white-space rule. */
  fontCss?: string;
}

const ESCAPE: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

function esc(text: string): string {
  return text.replace(/[&<>"]/g, (char) => ESCAPE[char] ?? char);
}

function render(node: SvgNode, indent: string): string {
  const attrs = Object.entries(node.attrs).map(([name, value]) => ` ${name}="${esc(String(value))}"`).join("");
  if (node.children.length === 0) {
    if (node.text === undefined) return `${indent}<${node.tag}${attrs}/>`;
    return `${indent}<${node.tag}${attrs}>${esc(node.text)}</${node.tag}>`;
  }
  const pad = `${indent}  `;
  const inner = [...(node.text !== undefined ? [`${pad}${esc(node.text)}`] : []), ...node.children.map((child) => render(child, pad))];
  return `${indent}<${node.tag}${attrs}>\n${inner.join("\n")}\n${indent}</${node.tag}>`;
}

/** The SVG document for a node tree, with a stable layout the golden files compare. */
export function serialiseSvg(parts: SvgDocument): string {
  const { x, y, w, h } = parts.viewBox;
  const root: SvgNode = {
    tag: "svg",
    attrs: { xmlns: "http://www.w3.org/2000/svg", viewBox: `${String(x)} ${String(y)} ${String(w)} ${String(h)}`, width: w, height: h },
    children: [
      { tag: "title", attrs: {}, text: parts.title, children: [] },
      { tag: "desc", attrs: {}, text: parts.description, children: [] },
      { tag: "style", attrs: {}, text: `${parts.fontCss ?? ""}text { white-space: pre; }`, children: [] },
      ...(parts.defs.length > 0 ? [{ tag: "defs", attrs: {}, children: [...parts.defs] }] : []),
      ...parts.nodes,
    ],
  };
  return `${render(root, "")}\n`;
}

function referenced(nodes: readonly SvgNode[]): Set<string> {
  const ids = new Set<string>();
  const visit = (node: SvgNode): void => {
    for (const value of Object.values(node.attrs)) {
      for (const match of String(value).matchAll(/url\(#([^)]+)\)/g)) if (match[1]) ids.add(match[1]);
    }
    for (const child of node.children) visit(child);
  };
  for (const node of nodes) visit(node);
  return ids;
}

export interface ExportSvgOptions {
  title: string;
  description: string;
  /** Export these elements. The whole canvas when absent. */
  ids?: ReadonlySet<string>;
  /** Export everything overlapping this frame, clipped to its region. */
  frame?: string;
  images?: ImageLookup;
  /** `src` to a data URI, used in place of the blob URL the canvas draws from. */
  imageHrefs?: ReadonlyMap<string, string>;
  /** Faces to embed. Absent leaves the file on the fonts the viewer already has. */
  fonts?: readonly EmbeddedFont[];
}

interface FrameScope {
  ids: ReadonlySet<string>;
  region: Box;
  name: Box | null;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

function frameScope(doc: DiagramDocument, measurer: TextMeasurer, images: ImageLookup, frameId: string): FrameScope | null {
  const frame = doc.elements.find((element): element is FrameElement => element.kind === "frame" && element.id === frameId);
  const region = frame && elementBox(doc, frame, layoutById(doc).get(frame.id), measurer, images);
  if (!frame || !region) return null;
  const ids = new Set<string>([frame.id]);
  for (const element of doc.elements) {
    const extent = elementExtent(doc, element, measurer, images);
    if (extent && overlaps(extent, region)) ids.add(element.id);
  }
  return { ids, region, name: frameName(doc, frame, measurer)?.box ?? null };
}

function padded(box: Box): SvgDocument["viewBox"] {
  return { x: box.x - EXPORT_PAD, y: box.y - EXPORT_PAD, w: box.w + EXPORT_PAD * 2, h: box.h + EXPORT_PAD * 2 };
}

function around(region: Box, name: Box | null): Box {
  if (!name) return region;
  const x = Math.min(region.x, name.x);
  const y = Math.min(region.y, name.y);
  const right = Math.max(region.x + region.w, name.x + name.w);
  const bottom = Math.max(region.y + region.h, name.y + name.h);
  return { x, y, w: right - x, h: bottom - y };
}

/** The frame's name is drawn above its box, so it stays outside the clip that cuts strokes and shadows. */
function liftFrameName(nodes: readonly SvgNode[], frameId: string): { clipped: SvgNode[]; name: SvgNode | null } {
  const clipped: SvgNode[] = [];
  let name: SvgNode | null = null;
  for (const node of nodes) {
    if (node.attrs["data-id"] !== frameId) {
      clipped.push(node);
      continue;
    }
    const above = node.children.filter((child) => child.tag === "text" && Number(child.attrs["y"]) < 0);
    const rest = node.children.filter((child) => !(child.tag === "text" && Number(child.attrs["y"]) < 0));
    clipped.push({ ...node, children: rest });
    const transform = node.attrs["transform"];
    if (above.length > 0) name = { tag: "g", attrs: transform !== undefined ? { transform } : {}, children: above };
  }
  return { clipped, name };
}

/** The canvas, a selection, or a frame, as an SVG string at the diagram's own size. */
export function exportSvg(doc: DiagramDocument, measurer: TextMeasurer, options: ExportSvgOptions): string {
  const images = hrefLookup(options.images ?? openImages, options.imageHrefs);
  const scope = options.frame !== undefined ? frameScope(doc, measurer, images, options.frame) : null;
  const only = scope?.ids ?? options.ids;
  const drawn = describeDiagram(doc, measurer, { ...(only && { only }), images });
  const lifted = scope ? liftFrameName(drawn, options.frame ?? "") : { clipped: drawn, name: null };
  const nodes = scope
    ? [
        {
          tag: "g",
          attrs: { "clip-path": "url(#frame-region)" },
          children: lifted.clipped,
        },
        ...(lifted.name ? [lifted.name] : []),
      ]
    : drawn;
  const used = referenced(nodes);
  const defs = describeDefs(doc).filter((node) => used.has(String(node.attrs["id"])));
  if (scope) {
    defs.push({
      tag: "clipPath",
      attrs: { id: "frame-region" },
      children: [{ tag: "rect", attrs: { x: scope.region.x, y: scope.region.y, width: scope.region.w, height: scope.region.h }, children: [] }],
    });
  }
  const bounds = scope ? around(scope.region, scope.name) : diagramBounds(doc, measurer, images, options.ids);
  const viewBox = bounds ? padded(bounds) : { x: 0, y: 0, w: EXPORT_PAD * 2, h: EXPORT_PAD * 2 };
  const fontCss = options.fonts && options.fonts.length > 0 ? fontFaceCss(options.fonts) : undefined;
  return serialiseSvg({ nodes, defs, viewBox, title: options.title, description: options.description, ...(fontCss && { fontCss }) });
}

export function exportedIds(
  doc: DiagramDocument,
  measurer: TextMeasurer,
  images: ImageLookup,
  options: { ids?: ReadonlySet<string>; frame?: string },
): ReadonlySet<string> | undefined {
  if (options.frame === undefined) return options.ids;
  return frameScope(doc, measurer, images, options.frame)?.ids ?? new Set<string>();
}

function hrefLookup(base: ImageLookup, hrefs: ReadonlyMap<string, string> | undefined): ImageLookup {
  if (!hrefs) return base;
  return (src) => {
    const state = base(src);
    const href = hrefs.get(src);
    return state.status === "ready" && href !== undefined ? { ...state, url: href } : state;
  };
}

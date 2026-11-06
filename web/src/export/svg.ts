// Turns a rendered node tree into an SVG document. The nodes are the ones the canvas draws.
import type { DiagramDocument } from "../model/index.ts";
import { diagramBounds } from "../render/bounds.ts";
import { describeDefs } from "../render/defs.ts";
import { describeDiagram, type SvgNode } from "../render/describe.ts";
import { type ImageLookup, openImages } from "../render/images.ts";
import type { TextMeasurer } from "../text/measure.ts";

export const EXPORT_PAD = 16;

export interface SvgDocument {
  nodes: readonly SvgNode[];
  defs: readonly SvgNode[];
  viewBox: { x: number; y: number; w: number; h: number };
  title: string;
  description: string;
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
      { tag: "style", attrs: {}, text: "text { white-space: pre; }", children: [] },
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
  images?: ImageLookup;
}

/** The canvas, or a selection, as an SVG string at the diagram's own size. */
export function exportSvg(doc: DiagramDocument, measurer: TextMeasurer, options: ExportSvgOptions): string {
  const images = options.images ?? openImages;
  const nodes = describeDiagram(doc, measurer, { ...(options.ids && { only: options.ids }), images });
  const used = referenced(nodes);
  const defs = describeDefs(doc).filter((node) => used.has(String(node.attrs["id"])));
  const bounds = diagramBounds(doc, measurer, images, options.ids);
  const viewBox = bounds
    ? { x: bounds.x - EXPORT_PAD, y: bounds.y - EXPORT_PAD, w: bounds.w + EXPORT_PAD * 2, h: bounds.h + EXPORT_PAD * 2 }
    : { x: 0, y: 0, w: EXPORT_PAD * 2, h: EXPORT_PAD * 2 };
  return serialiseSvg({ nodes, defs, viewBox, title: options.title, description: options.description });
}

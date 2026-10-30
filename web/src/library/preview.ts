// A library entry drawn by the same renderer as the canvas, at its default size, with no label.
import type { DiagramDocument } from "../model/index.ts";
import { describeDiagram, type ShapeSource, type SvgNode } from "../render/describe.ts";
import { SHAPE_H, SHAPE_W } from "../render/size.ts";
import type { TextMeasurer } from "../text/measure.ts";
import type { Size } from "../shapes/types.ts";
import type { LibraryEntry } from "./entries.ts";

export interface Preview {
  nodes: SvgNode[];
  /** The shape's default size: the area the nodes occupy, from the origin. */
  size: Size;
}

const ID = "preview";

/** The default size of a library shape: its manifest size, or the standard size for a built-in one. */
export function defaultSize(entry: LibraryEntry, packs: ShapeSource): Size {
  return (!entry.builtIn && packs.shape(entry.shape)?.size) || { w: SHAPE_W, h: SHAPE_H };
}

export function describePreview(entry: LibraryEntry, packs: ShapeSource, measurer: TextMeasurer): Preview {
  const size = defaultSize(entry, packs);
  const doc: DiagramDocument = {
    version: 1,
    plugins: [],
    elements: [{ kind: "node", id: ID, shape: entry.shape }],
    style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
    layout: [{ id: ID, x: 0, y: 0, w: size.w, h: size.h }],
  };
  return { nodes: describeDiagram(doc, measurer, { packs, hideText: new Set([ID]) }), size };
}

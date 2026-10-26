// Shape pack manifest (spec 3, decision A17). A pack is a folder with `pack.json` and one SVG per
// shape. Everything here is design coordinates: the SVG's own space, `0 0 w h` at the default size.
import type { Point } from "../model/layout.ts";

export type { Point };

export interface Size {
  w: number;
  h: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

/** Colour comes from the role, never from the SVG: the theme and classes supply it. */
export type Role = "fill" | "stroke" | "detail";

/** Cut lines on one axis: parts before the first and after the second keep their size, parts between scale (decision A15). */
export type Cuts = [number, number];

export interface Stretch {
  x?: Cuts;
  y?: Cuts;
}

export interface ShapeManifest {
  /** Name inside the pack; the full name is `<pack>.<id>`. */
  id: string;
  name: string;
  category: string;
  tags: string[];
  /** File name of the shape's SVG in the pack folder. */
  svg: string;
  /** Default size: multiples of 8. */
  size: Size;
  /** One closed path, absolute commands only: used for hit-testing and for attaching edges anywhere along it. */
  outline: string;
  /** Default attach points for `auto`: the side midpoints on the outline, plus optional extras. */
  anchors: { top: Point; right: Point; bottom: Point; left: Point; extra?: Point[] };
  /** Where text is centred. */
  label: Rect;
  stretch?: Stretch;
  /** Locks the ratio, as for icons. Excludes cut lines. */
  keepAspect: boolean;
}

export interface PackManifest {
  pack: string;
  version: number;
  shapes: ShapeManifest[];
}

export type ProblemCode =
  | "schema"
  | "size"
  | "svg-missing"
  | "svg-parse"
  | "svg-element"
  | "svg-attribute"
  | "svg-role"
  | "svg-path"
  | "outline"
  | "anchor"
  | "label"
  | "stretch";

export interface Problem {
  pack: string;
  shape?: string;
  code: ProblemCode;
  message: string;
}

/** The categories of spec 3. */
export const CATEGORIES = ["Basic", "Flowchart", "Architecture (generic)", "Network", "C4", "Infographic", "Arrows and lines"];

/** The grid default sizes are multiples of. */
export const DESIGN_GRID = 8;

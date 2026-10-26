// Structure section (spec 4.3): what exists, what it says, how things connect.

/** Element IDs: short slugs, unique across the file; all element types share one namespace. */
export const ID_PATTERN = /^[a-z][a-z0-9_-]*$/;

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export interface PluginRef {
  id: string;
  version: number;
}

interface ElementBase {
  id: string;
  /** Style class name. */
  class?: string;
}

export interface NodeElement extends ElementBase {
  kind: "node";
  /** Plain text; defaults to the ID when absent. */
  label?: string;
  /** `pack.name`; `core` shapes may omit the pack prefix. */
  shape: string;
}

export interface FrameElement extends ElementBase {
  kind: "frame";
  name?: string;
}

export interface EdgeElement extends ElementBase {
  kind: "edge";
  /** Element ID, or null for an end attached to nothing (`-` in the file). */
  from: string | null;
  to: string | null;
  label?: string;
}

export interface TextElement extends ElementBase {
  kind: "text";
  content: string;
}

export interface ImageElement extends ElementBase {
  kind: "image";
  /** Relative path inside `assets/`. */
  src: string;
}

export interface ShapeElement extends ElementBase {
  kind: "shape";
  shape: string;
}

export type DiagramElement =
  | NodeElement
  | FrameElement
  | EdgeElement
  | TextElement
  | ImageElement
  | ShapeElement;

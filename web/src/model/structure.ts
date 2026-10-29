// Structure section: what exists, what it says, how things connect.

/** Element IDs: short slugs, unique across the file; all element types share one namespace. */
export const ID_PATTERN = /^[a-z][a-z0-9_-]*$/;

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/** `base`, or `base-2`, `base-3` and so on: the first ID that no element uses. */
export function unusedId(elements: readonly { id: string }[], base: string): string {
  const used = new Set(elements.map((e) => e.id));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${String(n)}`)) n++;
  return `${base}-${String(n)}`;
}

export interface PluginRef {
  id: string;
  version: number;
}

/** A value KDL can hold. */
export type KdlValue = string | number | boolean | null;

/** A node the model does not know, kept so a save does not lose it. */
export interface UnknownNode {
  name: string;
  args: KdlValue[];
  props: Record<string, KdlValue>;
  children: UnknownNode[];
  /** Whole-line `//` comments above the node, as written. */
  comments?: string[];
}

interface ElementBase {
  id: string;
  /** Style class name. */
  class?: string;
  /** Whole-line `//` comments above the element, as written. They move with it. */
  comments?: string[];
  /** Properties no installed pack defines, kept as written. */
  ext?: Record<string, KdlValue>;
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

/** A structure node from a pack that is not installed. Drawn as a placeholder. */
export interface UnknownElement {
  kind: "unknown";
  /** The node's first argument when it is a valid ID, otherwise `unknown-N`. */
  id: string;
  node: UnknownNode;
}

export type DiagramElement =
  | NodeElement
  | FrameElement
  | EdgeElement
  | TextElement
  | ImageElement
  | ShapeElement
  | UnknownElement;

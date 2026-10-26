import type { DiagramElement, PluginRef } from "./structure.ts";
import type { Style } from "./style.ts";
import type { LayoutEntry } from "./layout.ts";

export * from "./structure.ts";
export * from "./style.ts";
export * from "./layout.ts";

/** The document model: the source of truth for a diagram. */
export interface DiagramDocument {
  version: number;
  title?: string;
  plugins: PluginRef[];
  /** Whole-line `//` comments above the header. */
  comments?: string[];
  /** Structure section, in authored order. */
  elements: DiagramElement[];
  style: Style;
  /** Layout section; entry order is z-order, later draws on top. */
  layout: LayoutEntry[];
}

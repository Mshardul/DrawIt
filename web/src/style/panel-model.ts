// What the style panel shows for a selection: one field per property, with the value the
// selected elements share or "mixed". Pure, so the panel's rules need no browser.
import type { DiagramDocument, DiagramElement, StyleProps } from "../model/index.ts";
import { layoutById } from "../model/lookup.ts";
import { type PropertyDef, PROPERTIES } from "./registry.ts";
import { styleOf } from "./of.ts";

const SHOWN: readonly PropertyDef["key"][] = [
  "fill", "opacity", "stroke", "strokeWidth", "dash", "radius", "shadow",
  "font", "size", "weight", "italic", "underline", "color", "align", "lineHeight",
];

export type FieldValue = { state: "same"; value: unknown } | { state: "mixed" };

export interface PanelField {
  def: PropertyDef;
  value: FieldValue;
  /** The selected elements the property applies to and that are not locked; an edit goes to these. */
  ids: string[];
  /** True when every element the property applies to is locked, so nothing can be edited. */
  locked: boolean;
  /** True when any of them has its own line for the property, so clearing it changes something. */
  overridden: boolean;
}

const isRectangle = (element: DiagramElement): boolean =>
  (element.kind === "node" || element.kind === "shape") && (element.shape === "rect" || element.shape === "core.rect");

/**
 * Edges are lines, not areas, a pack shape takes its corners from its cut lines, and a shape
 * has no text.
 */
function applies(def: PropertyDef, element: DiagramElement): boolean {
  const { key } = def;
  switch (element.kind) {
    case "node":
      return key !== "radius" || isRectangle(element);
    case "shape":
      return def.group !== "text" && (key !== "radius" || isRectangle(element));
    case "text":
      return true;
    case "edge":
      return key !== "fill" && key !== "radius";
    default:
      return false;
  }
}

export function panelFields(doc: DiagramDocument, selection: readonly string[]): PanelField[] {
  const entries = layoutById(doc);
  const picked = selection.flatMap((id) => doc.elements.find((e) => e.id === id) ?? []);
  const fields: PanelField[] = [];
  for (const def of PROPERTIES) {
    if (!SHOWN.includes(def.key)) continue;
    const targets = picked.filter((e) => applies(def, e));
    if (targets.length === 0) continue;
    const values = targets.map((e) => styleOf(doc, e)[def.key as keyof StyleProps]);
    const first = values[0];
    const value: FieldValue = values.every((v) => v === first) ? { state: "same", value: first } : { state: "mixed" };
    const editable = targets.filter((e) => entries.get(e.id)?.locked !== true);
    const overridden = editable.some((e) => {
      const line = doc.style.overrides.find((o) => o.id === e.id);
      return line !== undefined && def.key in line.props;
    });
    const ids = editable.map((e) => e.id);
    fields.push({ def, value, ids, locked: ids.length === 0, overridden });
  }
  return fields;
}

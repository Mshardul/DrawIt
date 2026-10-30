// What the style panel shows for a selection: one field per property, with the value the
// selected elements share or "mixed". Pure, so the panel's rules need no browser.
import type { DiagramDocument, DiagramElement, StyleProps } from "../model/index.ts";
import { type PropertyDef, PROPERTIES } from "./registry.ts";
import { styleOf } from "./of.ts";

const SHOWN: readonly PropertyDef["key"][] = ["fill", "opacity", "stroke", "strokeWidth", "radius"];

export type FieldValue = { state: "same"; value: unknown } | { state: "mixed" };

export interface PanelField {
  def: PropertyDef;
  value: FieldValue;
  /** The selected elements the property applies to; an edit goes to these. */
  ids: string[];
  /** True when any of them has its own line for the property, so clearing it changes something. */
  overridden: boolean;
}

const isRectangle = (element: DiagramElement): boolean =>
  (element.kind === "node" || element.kind === "shape") && (element.shape === "rect" || element.shape === "core.rect");

/** Edges are lines, not areas, and a pack shape takes its corners from its cut lines. */
function applies(key: PropertyDef["key"], element: DiagramElement): boolean {
  switch (element.kind) {
    case "node":
    case "shape":
      return key !== "radius" || isRectangle(element);
    case "text":
      return true;
    case "edge":
      return key !== "fill" && key !== "radius";
    default:
      return false;
  }
}

export function panelFields(doc: DiagramDocument, selection: readonly string[]): PanelField[] {
  const picked = selection.flatMap((id) => doc.elements.find((e) => e.id === id) ?? []);
  const fields: PanelField[] = [];
  for (const def of PROPERTIES) {
    if (!SHOWN.includes(def.key)) continue;
    const targets = picked.filter((e) => applies(def.key, e));
    if (targets.length === 0) continue;
    const values = targets.map((e) => styleOf(doc, e)[def.key as keyof StyleProps]);
    const first = values[0];
    const value: FieldValue = values.every((v) => v === first) ? { state: "same", value: first } : { state: "mixed" };
    const overridden = targets.some((e) => {
      const line = doc.style.overrides.find((o) => o.id === e.id);
      return line !== undefined && def.key in line.props;
    });
    fields.push({ def, value, ids: targets.map((e) => e.id), overridden });
  }
  return fields;
}

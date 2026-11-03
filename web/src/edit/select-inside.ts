// Select inside as a pure function from a document and a selection to a new selection.
import type { DiagramDocument } from "../model/index.ts";
import { layoutById } from "../model/lookup.ts";
import { elementBox, type Box } from "../render/boxes.ts";
import type { TextMeasurer } from "../text/measure.ts";

const within = (inner: Box, outer: Box): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

/**
 * The selection with every unlocked element that lies fully inside a selected shape or frame added,
 * and the unlocked edges whose two ends are both selected. The container stays selected, so it can
 * be moved or copied with its contents. Null if nothing selected can hold anything or nothing is
 * inside.
 */
export function selectInside(doc: DiagramDocument, measurer: TextMeasurer, selection: readonly string[]): string[] | null {
  const entries = layoutById(doc);
  const chosen = new Set(selection);
  const containers = doc.elements.flatMap((e) => {
    const holds = e.kind === "node" || e.kind === "shape" || e.kind === "frame";
    const box = holds && chosen.has(e.id) ? elementBox(doc, e, entries.get(e.id), measurer) : null;
    return box ? [{ id: e.id, box }] : [];
  });
  if (containers.length === 0) return null;

  const added = new Set<string>();
  for (const e of doc.elements) {
    if (e.kind === "edge" || e.kind === "unknown" || chosen.has(e.id)) continue;
    const entry = entries.get(e.id);
    const box = entry?.locked === true ? null : elementBox(doc, e, entry, measurer);
    if (box && containers.some((c) => within(box, c.box))) added.add(e.id);
  }
  const selected = (id: string | null): boolean => id !== null && (chosen.has(id) || added.has(id));
  for (const e of doc.elements) {
    if (e.kind !== "edge" || chosen.has(e.id) || entries.get(e.id)?.locked === true) continue;
    if (selected(e.from) && selected(e.to)) added.add(e.id);
  }
  if (added.size === 0) return null;
  return [...selection, ...doc.elements.filter((e) => added.has(e.id)).map((e) => e.id)];
}

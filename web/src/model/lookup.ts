// Lookups over a document by ID, built once per array. A document is never changed in place (the
// command layer returns a new one, sharing every array it did not touch), so a lookup stays right
// for as long as its array exists. A drag changes only the layout, so the elements lookup is built
// once for the whole drag.
import type { DiagramDocument, DiagramElement, LayoutEntry } from "./index.ts";

const elements = new WeakMap<DiagramElement[], ReadonlyMap<string, DiagramElement>>();
const entries = new WeakMap<LayoutEntry[], ReadonlyMap<string, LayoutEntry>>();

/** The elements of the document by ID. */
export function elementsById(doc: DiagramDocument): ReadonlyMap<string, DiagramElement> {
  let found = elements.get(doc.elements);
  if (!found) {
    found = new Map(doc.elements.map((e) => [e.id, e]));
    elements.set(doc.elements, found);
  }
  return found;
}

/** The layout entries by ID. Where two entries name one ID, the first wins. */
export function layoutById(doc: DiagramDocument): ReadonlyMap<string, LayoutEntry> {
  let found = entries.get(doc.layout);
  if (!found) {
    const first = new Map<string, LayoutEntry>();
    for (const entry of doc.layout) if (!first.has(entry.id)) first.set(entry.id, entry);
    found = first;
    entries.set(doc.layout, found);
  }
  return found;
}

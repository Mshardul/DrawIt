// The resolved style of an element in a document. A drag changes only the layout, so the style
// section keeps its identity and each element resolves once for as long as both are unchanged.
import type { DiagramDocument, DiagramElement, Style, StyleProps } from "../model/index.ts";
import { BUILT_IN_THEME, defaultStyleFor } from "./defaults.ts";
import { createStyleResolver } from "./resolve.ts";
import { type TextLook, textLookOf } from "./text-look.ts";

interface Resolved {
  resolve: (element: DiagramElement) => StyleProps;
  byElement: WeakMap<DiagramElement, StyleProps>;
}

const sections = new WeakMap<Style, Resolved>();

export function styleOf(doc: DiagramDocument, element: DiagramElement): StyleProps {
  let section = sections.get(doc.style);
  if (!section) {
    section = { resolve: createStyleResolver(doc.style, BUILT_IN_THEME, defaultStyleFor), byElement: new WeakMap() };
    sections.set(doc.style, section);
  }
  let style = section.byElement.get(element);
  if (!style) {
    style = section.resolve(element);
    section.byElement.set(element, style);
  }
  return style;
}

/** A colour token's value for this document: the file's theme first, then the built-in theme. */
export function themeColour(doc: DiagramDocument, name: string): string | undefined {
  return doc.style.theme.colors[name] ?? BUILT_IN_THEME.colors[name];
}

/** How an element's text is drawn and measured. */
export function textLookFor(doc: DiagramDocument, element: DiagramElement): TextLook {
  return textLookOf(styleOf(doc, element));
}

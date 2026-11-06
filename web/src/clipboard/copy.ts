// A selection copied as its own diagram, and the check that pasted text is one.
import { parse } from "@bgotink/kdl";
import { readDiagram } from "../kdl/read.ts";
import type { DiagramDocument, StyleProps, Theme } from "../model/index.ts";
import { BUILT_IN_THEME } from "../style/defaults.ts";

const TOKEN = /\$([A-Za-z][A-Za-z0-9_-]*)/g;

const BUILT_IN = new Set<string>([
  ...Object.keys(BUILT_IN_THEME.colors),
  ...Object.keys(BUILT_IN_THEME.fonts),
  ...Object.keys(BUILT_IN_THEME.sizes),
  ...Object.keys(BUILT_IN_THEME.spaces),
]);

function tokenNames(props: StyleProps): string[] {
  const names: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      for (const match of value.matchAll(TOKEN)) if (match[1]) names.push(match[1]);
    } else if (typeof value === "object" && value !== null) {
      for (const nested of Object.values(value)) visit(nested);
    }
  };
  visit(props);
  return names;
}

function kept<T>(table: Record<string, T>, names: ReadonlySet<string>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(table)) {
    if (names.has(key) && !BUILT_IN.has(key)) out[key] = value;
  }
  return out;
}

/** A complete diagram of the selection: its elements, the classes they use, and the tokens those need. */
export function clipboardDocument(doc: DiagramDocument, ids: readonly string[]): DiagramDocument {
  const picked = new Set(ids);
  const elements = doc.elements.filter((element) => picked.has(element.id));
  const classes = doc.style.classes.filter((styleClass) => elements.some((element) => element.kind !== "unknown" && element.class === styleClass.name));
  const overrides = doc.style.overrides.filter((override) => picked.has(override.id));
  const names = new Set<string>([...classes, ...overrides].flatMap((item) => tokenNames(item.props)));
  const theme: Theme = {
    name: doc.style.theme.name,
    colors: kept(doc.style.theme.colors, names),
    fonts: kept(doc.style.theme.fonts, names),
    sizes: kept(doc.style.theme.sizes, names),
    spaces: kept(doc.style.theme.spaces, names),
  };
  return {
    version: doc.version,
    plugins: doc.plugins.map((plugin) => ({ ...plugin })),
    elements: elements.map((element) => ({ ...element })),
    style: { theme, classes: classes.map((styleClass) => ({ ...styleClass, props: { ...styleClass.props } })), overrides: overrides.map((override) => ({ ...override, props: { ...override.props } })) },
    layout: doc.layout.filter((entry) => picked.has(entry.id)).map((entry) => ({ ...entry })),
  };
}

function hasDiagramVersion(text: string): boolean {
  let source;
  try {
    source = parse(text);
  } catch {
    return false;
  }
  return source.nodes.some((node) => node.name.getName() === "diagram" && node.entries.some((entry) => entry.name?.getName() === "version"));
}

/** The diagram in pasted text, or null when the text is not a DrawIt document. */
export function recogniseClipboard(text: string): DiagramDocument | null {
  if (!hasDiagramVersion(text)) return null;
  try {
    return readDiagram(text).document;
  } catch {
    return null;
  }
}

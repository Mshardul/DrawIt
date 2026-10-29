// Style resolution: one style per element, a pure function of the style section.
import type { DiagramElement, StyleProps, Style, Theme } from "../model/index.ts";

type TokenTable = "colors" | "fonts" | "numbers";

// A token name is looked up in the table for the kind of value the property holds, so `$body` can
// be a colour, a font and a size at once. Number tokens are looked up in sizes, then in spaces.
const TABLES: Partial<Record<keyof StyleProps, TokenTable>> = {
  fill: "colors",
  stroke: "colors",
  color: "colors",
  font: "fonts",
  opacity: "numbers",
  strokeWidth: "numbers",
  radius: "numbers",
  size: "numbers",
  weight: "numbers",
  lineHeight: "numbers",
};

function lookup(theme: Theme, table: TokenTable, name: string): string | number | undefined {
  if (table === "colors") return theme.colors[name];
  if (table === "fonts") return theme.fonts[name];
  return theme.sizes[name] ?? theme.spaces[name];
}

function replaceTokens(props: StyleProps, theme: Theme, fallback: Theme): StyleProps {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    const table = TABLES[key as keyof StyleProps];
    if (table && typeof value === "string" && value.startsWith("$")) {
      const name = value.slice(1);
      const found = lookup(theme, table, name) ?? lookup(fallback, table, name);
      if (found !== undefined) out[key] = found;
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function merge(target: StyleProps, layer: StyleProps): void {
  const { ext, ...rest } = layer;
  Object.assign(target, rest);
  if (ext) target.ext = { ...target.ext, ...ext };
}

/**
 * Builds a resolver for one style section. Properties merge in the order defaults for the element
 * kind, its class, its override lines; then tokens are replaced from the file's theme, and a token
 * the file lacks from `fallback`. A token neither defines leaves the property unset.
 */
export function createStyleResolver(
  style: Style,
  fallback: Theme,
  defaultsFor: (kind: DiagramElement["kind"]) => StyleProps,
): (element: DiagramElement) => StyleProps {
  const classes = new Map<string, StyleProps>();
  for (const c of style.classes) classes.set(c.name, c.props);
  const overrides = new Map<string, StyleProps[]>();
  for (const o of style.overrides) {
    const lines = overrides.get(o.id);
    if (lines) lines.push(o.props);
    else overrides.set(o.id, [o.props]);
  }

  return (element) => {
    const merged: StyleProps = {};
    merge(merged, defaultsFor(element.kind));
    const className = "class" in element ? element.class : undefined;
    const byClass = className === undefined ? undefined : classes.get(className);
    if (byClass) merge(merged, byClass);
    for (const line of overrides.get(element.id) ?? []) merge(merged, line);
    return replaceTokens(merged, style.theme, fallback);
  };
}

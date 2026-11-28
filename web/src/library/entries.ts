// The shape library's entries, grouped by category and searched by name and tags.
import type { PackLoader } from "../shapes/pack-loader.ts";
import { CATEGORIES } from "../shapes/types.ts";

export interface LibraryEntry {
  /** The shape as a node's `shape` property names it: `rect`, `ellipse` or `<pack>.<id>`. */
  shape: string;
  name: string;
  category: string;
  tags: string[];
  /** Drawn natively rather than from a pack. */
  builtIn: boolean;
}

const BUILT_IN: LibraryEntry[] = [
  { shape: "rect", name: "Rectangle", category: "Basic", tags: ["box", "square"], builtIn: true },
  { shape: "ellipse", name: "Ellipse", category: "Basic", tags: ["oval", "circle"], builtIn: true },
];

const BUILT_IN_SHAPES = new Set(BUILT_IN.map((entry) => entry.shape));

function alias(shape: string, name: string, category: string, tags: string[]): LibraryEntry {
  return { shape, name, category, tags, builtIn: BUILT_IN_SHAPES.has(shape) };
}

/** An existing shape listed again under another category and name. */
const ALIASES: LibraryEntry[] = [
  alias("rect", "Class", "UML", ["class", "type", "uml"]),
  alias("ellipse", "Use case", "UML", ["use-case", "usecase", "uml"]),
  alias("core.decision", "Decision", "UML", ["decision", "branch", "uml", "activity"]),
  alias("core.rounded-rect", "State", "UML", ["state", "uml"]),
  alias("rect", "Entity", "ERD", ["entity", "table", "erd"]),
  alias("core.decision", "Relationship", "ERD", ["relationship", "erd"]),
  alias("ellipse", "Attribute", "ERD", ["attribute", "erd", "field"]),
];

/** Rectangle and ellipse, then aliases, then the pack shapes in pack order. */
export function libraryEntries(loader: PackLoader): LibraryEntry[] {
  return [
    ...BUILT_IN,
    ...ALIASES,
    ...loader.shapes().map(({ name, shape }) => ({ shape: name, name: shape.name, category: shape.category, tags: shape.tags, builtIn: false })),
  ];
}

/** Entries by category in the order of the shape categories. Empty categories are left out. */
export function groupByCategory(entries: readonly LibraryEntry[]): { category: string; entries: LibraryEntry[] }[] {
  return CATEGORIES.map((category) => ({ category, entries: entries.filter((e) => e.category === category) })).filter((g) => g.entries.length > 0);
}

/** Entries whose name or tags contain every word of `query`, ignoring case. A blank query keeps all. */
export function searchEntries(entries: readonly LibraryEntry[], query: string): LibraryEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== "");
  return entries.filter((entry) => {
    const haystack = [entry.name, ...entry.tags].map((s) => s.toLowerCase());
    return words.every((word) => haystack.some((s) => s.includes(word)));
  });
}

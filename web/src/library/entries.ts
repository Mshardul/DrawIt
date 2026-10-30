// What the shape library lists: the two built-in shapes and every pack shape, grouped by category
// and searched by name and tags. Pure functions over a pack loader.
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

/** Rectangle and ellipse, then the pack shapes in pack order. */
export function libraryEntries(loader: PackLoader): LibraryEntry[] {
  return [
    ...BUILT_IN,
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

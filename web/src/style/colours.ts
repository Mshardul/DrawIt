// What the colour picker offers: the theme's colour tokens first, then raw colours.
import type { DiagramDocument } from "../model/index.ts";
import { BUILT_IN_THEME } from "./defaults.ts";
import { COLOUR } from "./values.ts";

export interface ThemeToken {
  /** As written in a file, such as `$accent`. */
  token: string;
  colour: string;
}

/** The built-in tokens in their order, with the file's value where it redefines one, then the file's own tokens. */
export function themeTokens(doc: DiagramDocument): ThemeToken[] {
  const own = doc.style.theme.colors;
  const names = [...Object.keys(BUILT_IN_THEME.colors), ...Object.keys(own).filter((n) => !(n in BUILT_IN_THEME.colors))];
  return names.flatMap((name) => {
    const colour = own[name] ?? BUILT_IN_THEME.colors[name];
    return colour === undefined ? [] : [{ token: `$${name}`, colour }];
  });
}

const RECENT_LIMIT = 8;

export interface ColourStore {
  load(): readonly string[];
  save(colours: readonly string[]): void;
}

function kept(colours: readonly string[]): string[] {
  const out: string[] = [];
  for (const colour of colours) {
    if (!COLOUR.test(colour) || colour.startsWith("$")) continue;
    const lower = colour.toLowerCase();
    if (out.includes(lower)) continue;
    out.push(lower);
    if (out.length === RECENT_LIMIT) break;
  }
  return out;
}

/** The raw colours chosen so far, newest first. A store keeps them; without one they last for this object only. */
export class RecentColours {
  private colours: string[] = [];
  private ready = false;
  private store: ColourStore | undefined;

  constructor(store?: ColourStore) {
    this.store = store;
  }

  /** The store is read on first use, so it can be filled after this object is created. */
  private ensure(): void {
    if (this.ready) return;
    this.ready = true;
    this.colours = kept(this.store?.load() ?? []);
  }

  add(colour: string): void {
    if (!COLOUR.test(colour) || colour.startsWith("$")) return;
    this.ensure();
    const lower = colour.toLowerCase();
    this.colours = [lower, ...this.colours.filter((c) => c !== lower)].slice(0, RECENT_LIMIT);
    this.store?.save(this.colours);
  }

  list(): string[] {
    this.ensure();
    return [...this.colours];
  }
}

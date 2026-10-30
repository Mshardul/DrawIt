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

/** The raw colours chosen so far, newest first. Lives as long as the session: it is never written to the file. */
export class RecentColours {
  private colours: string[] = [];

  add(colour: string): void {
    if (!COLOUR.test(colour) || colour.startsWith("$")) return;
    const lower = colour.toLowerCase();
    this.colours = [lower, ...this.colours.filter((c) => c !== lower)].slice(0, RECENT_LIMIT);
  }

  list(): string[] {
    return [...this.colours];
  }
}

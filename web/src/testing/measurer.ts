import type { TextMeasurer } from "../text/measure.ts";
import { breakLines } from "../text/wrap.ts";

/** Width of one character in `monoMeasurer`. */
export const CHAR_W = 10;

const widthOf = (text: string): number => Array.from(text).length * CHAR_W;

/** A measurer for tests that need no browser: every character is `CHAR_W` wide, in every style. */
export const monoMeasurer: TextMeasurer = {
  width: widthOf,
  wrap: (text, maxWidth) => breakLines(text, maxWidth, widthOf),
};

/** A measurer whose characters are half as wide as the font size, so a test can see the style reach it. */
export const sizedMeasurer: TextMeasurer = {
  width: (text, style) => Array.from(text).length * (style.size / 2),
  wrap: (text, maxWidth, style) => breakLines(text, maxWidth, (piece) => Array.from(piece).length * (style.size / 2)),
};

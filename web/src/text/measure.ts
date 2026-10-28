import type { FontFamily, FontWeight } from "./fonts.ts";
import { breakLines } from "./wrap.ts";

/** Used by the canvas here and by every SVG text node, so both shape glyphs the same way. */
export const TEXT_RENDERING = "geometricPrecision";

export interface TextStyle {
  family: FontFamily;
  /** Pixels. */
  size: number;
  weight: FontWeight;
  italic: boolean;
}

/** The subset of a 2D canvas context that measuring needs. */
export type MeasureContext = Pick<CanvasRenderingContext2D, "font" | "textRendering"> & {
  measureText(text: string): { width: number };
};

/** The CSS font shorthand for a style, in the order canvas and CSS accept. */
export function fontShorthand(style: TextStyle): string {
  return `${style.italic ? "italic " : ""}${String(style.weight)} ${String(style.size)}px "${style.family}"`;
}

/** The SVG attributes that draw text in `style`, the same font that `fontShorthand` measures. */
export function svgTextAttrs(style: TextStyle): Record<string, string | number> {
  return {
    "font-family": `"${style.family}"`,
    "font-size": style.size,
    "font-weight": style.weight,
    "font-style": style.italic ? "italic" : "normal",
    "text-rendering": TEXT_RENDERING,
  };
}

export interface TextMeasurer {
  /** Wrapped lines of `text` at `width` in `style`. Explicit line breaks always start a new line. */
  wrap(text: string, width: number, style: TextStyle): string[];
  /** Width of `text` set on one line in `style`. */
  width(text: string, style: TextStyle): number;
}

function defaultContext(): MeasureContext {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) throw new Error("no 2d canvas context");
  return ctx;
}

/**
 * Measures with the canvas and keeps every width it has read, per font. Wrapping the same text again,
 * at any width, reads the cache; only text or a font not seen before reaches the canvas.
 */
export function createTextMeasurer(context?: MeasureContext): TextMeasurer {
  let ctx = context;
  const widths = new Map<string, Map<string, number>>();

  const width = (text: string, style: TextStyle): number => {
    const font = fontShorthand(style);
    let known = widths.get(font);
    if (!known) {
      known = new Map();
      widths.set(font, known);
    }
    let w = known.get(text);
    if (w === undefined) {
      ctx ??= defaultContext();
      ctx.font = font;
      ctx.textRendering = TEXT_RENDERING;
      w = ctx.measureText(text).width;
      known.set(text, w);
    }
    return w;
  };

  return {
    width,
    wrap: (text, maxWidth, style) => breakLines(text, maxWidth, (piece) => width(piece, style)),
  };
}
